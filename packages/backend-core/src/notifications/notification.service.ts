import type {
  DeadLetterNotificationQuery,
  NotificationDeliveryAttempt,
  NotificationLog,
  NotificationLogQuery,
  PaginatedResponse,
} from "@im/contracts";
import type { Prisma, PrismaClient, TransactionClient } from "@im/db";

import { recordActivityLog } from "../activity";

type NotificationLogRecord = {
  id: string;
  incidentId: string;
  policyStepId: string | null;
  repeatIteration: number | null;
  channel: string;
  targetType: string;
  targetId: string | null;
  targetAddress: string;
  status: string;
  attempt: number;
  idempotencyKey: string;
  eventAction: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  nextRetryAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MarkNotificationFailedOptions = {
  deliveryAttemptId?: string;
  maxAttempts?: number;
  retryAfterSeconds?: number;
};

type MarkNotificationSentOptions = {
  deliveryAttemptId?: string;
};

type MarkNotificationSkippedOptions = {
  deliveryAttemptId?: string;
};

type NotificationDeliveryAttemptRecord = {
  id: string;
  notificationLogId: string;
  attempt: number;
  status: string;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  retryAfterSeconds: number | null;
  startedAt: Date;
  completedAt: Date | null;
  metadata: unknown;
};

type WorkspaceScopeOptions = {
  workspaceIds?: string[];
};

export class NotificationService {
  constructor(private readonly db: PrismaClient) {}

  async claimDueNotifications(limit = 25, leaseSeconds = 120): Promise<NotificationLog[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const leaseUntil = new Date(Date.now() + Math.max(leaseSeconds, 30) * 1000);
    const notifications = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT nl.id
        FROM notification_logs nl
        JOIN incidents i ON i.id = nl.incident_id
        JOIN workspaces w ON w.id = i.workspace_id
        WHERE w.suspended_at IS NULL
          AND (
            (
              nl.status = 'pending'
              AND (nl.next_retry_at IS NULL OR nl.next_retry_at <= now())
            )
            OR (
              nl.status IN ('failed', 'retrying', 'sending')
              AND nl.next_retry_at IS NOT NULL
              AND nl.next_retry_at <= now()
            )
          )
        ORDER BY nl.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      `;
      const ids = rows.map((row) => row.id);

      if (ids.length === 0) {
        return [];
      }

      await this.markStaleDeliveryAttemptsTimedOut(tx, ids);

      await tx.notificationLog.updateMany({
        where: {
          id: {
            in: ids,
          },
        },
        data: {
          status: "sending",
          errorMessage: null,
          nextRetryAt: leaseUntil,
        },
      });

      return tx.notificationLog.findMany({
        where: {
          id: {
            in: ids,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    });

    return notifications.map((notification) => this.mapNotification(notification));
  }

  async getNotification(notificationId: string): Promise<NotificationLog | null> {
    const notification = await this.db.notificationLog.findUnique({
      where: {
        id: notificationId,
      },
    });

    return notification ? this.mapNotification(notification) : null;
  }

  async listNotifications(
    query: NotificationLogQuery,
    options: WorkspaceScopeOptions = {},
  ): Promise<PaginatedResponse<NotificationLog>> {
    const limit = query.limit;
    const rows = await this.db.notificationLog.findMany({
      where: {
        ...(query.incident_id ? { incidentId: query.incident_id } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(options.workspaceIds
          ? {
              incident: {
                workspaceId: {
                  in: options.workspaceIds,
                },
              },
            }
          : {}),
      },
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      ...(query.cursor
        ? {
            cursor: {
              id: query.cursor,
            },
            skip: 1,
          }
        : {}),
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const next = rows.length > limit ? items.at(-1)?.id ?? null : null;

    return {
      items: items.map((notification) => this.mapNotification(notification)),
      next_cursor: next,
    };
  }

  async listDeadLetterNotifications(
    query: DeadLetterNotificationQuery,
    options: WorkspaceScopeOptions = {},
  ): Promise<PaginatedResponse<NotificationLog>> {
    const rows = await this.db.notificationLog.findMany({
      where: {
        status: "failed",
        nextRetryAt: null,
        ...(query.incident_id ? { incidentId: query.incident_id } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(options.workspaceIds
          ? {
              incident: {
                workspaceId: {
                  in: options.workspaceIds,
                },
              },
            }
          : {}),
      },
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      ...(query.cursor
        ? {
            cursor: {
              id: query.cursor,
            },
            skip: 1,
          }
        : {}),
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const next = rows.length > query.limit ? items.at(-1)?.id ?? null : null;

    return {
      items: items.map((notification) => this.mapNotification(notification)),
      next_cursor: next,
    };
  }

  async listDeliveryAttempts(notificationId: string): Promise<NotificationDeliveryAttempt[]> {
    const attempts = await this.db.notificationDeliveryAttempt.findMany({
      where: {
        notificationLogId: notificationId,
      },
      orderBy: {
        attempt: "asc",
      },
    });

    return attempts.map((attempt) => this.mapDeliveryAttempt(attempt));
  }

  async startDeliveryAttempt(
    notificationId: string,
    provider: string,
    metadata: Prisma.InputJsonObject = {},
  ): Promise<NotificationDeliveryAttempt> {
    const attempt = await this.db.$transaction(async (tx) => {
      const notification = await tx.notificationLog.findUniqueOrThrow({
        where: {
          id: notificationId,
        },
        select: {
          attempt: true,
          channel: true,
          incidentId: true,
          incident: {
            select: {
              workspaceId: true,
            },
          },
          targetType: true,
        },
      });
      const maxAttempt = await tx.notificationDeliveryAttempt.aggregate({
        where: {
          notificationLogId: notificationId,
        },
        _max: {
          attempt: true,
        },
      });
      const nextAttempt = Math.max(notification.attempt, maxAttempt._max.attempt ?? 0) + 1;
      const created = await tx.notificationDeliveryAttempt.create({
        data: {
          notificationLogId: notificationId,
          attempt: nextAttempt,
          status: "sending",
          provider,
          metadata,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: notification.incident.workspaceId,
        resourceType: "notification",
        resourceId: notificationId,
        action: "notification.claimed",
        message: `Notification delivery attempt ${nextAttempt} claimed`,
        metadata: {
          attempt: nextAttempt,
          channel: notification.channel,
          incident_id: notification.incidentId,
          provider,
          target_type: notification.targetType,
        },
      });

      return created;
    });

    return this.mapDeliveryAttempt(attempt);
  }

  private async markStaleDeliveryAttemptsTimedOut(
    tx: TransactionClient,
    notificationIds: string[],
  ): Promise<void> {
    const staleAttempts = await tx.notificationDeliveryAttempt.findMany({
      where: {
        notificationLogId: {
          in: notificationIds,
        },
        status: "sending",
        completedAt: null,
      },
      include: {
        notificationLog: {
          select: {
            attempt: true,
            channel: true,
            id: true,
            incidentId: true,
            status: true,
            targetType: true,
            incident: {
              select: {
                workspaceId: true,
              },
            },
          },
        },
      },
    });

    if (staleAttempts.length === 0) {
      return;
    }

    const completedAt = new Date();
    const reason = "Delivery attempt timed out after notification lease expired";

    await tx.notificationDeliveryAttempt.updateMany({
      where: {
        id: {
          in: staleAttempts.map((attempt) => attempt.id),
        },
        status: "sending",
      },
      data: {
        status: "timed_out",
        errorMessage: reason,
        completedAt,
      },
    });

    for (const attempt of staleAttempts) {
      await recordActivityLog(tx, {
        workspaceId: attempt.notificationLog.incident.workspaceId,
        resourceType: "notification",
        resourceId: attempt.notificationLogId,
        action: "notification.attempt_timed_out",
        message: `Notification delivery attempt ${attempt.attempt} timed out`,
        metadata: {
          attempt: attempt.notificationLog.attempt,
          channel: attempt.notificationLog.channel,
          delivery_attempt: attempt.attempt,
          delivery_attempt_id: attempt.id,
          incident_id: attempt.notificationLog.incidentId,
          notification_status: attempt.notificationLog.status,
          provider: attempt.provider,
          reason,
          started_at: attempt.startedAt.toISOString(),
          target_type: attempt.notificationLog.targetType,
        },
      });
    }
  }

  async shouldSkipNotification(
    notificationId: string,
    options: MarkNotificationSkippedOptions = {},
  ): Promise<boolean> {
    const notification = await this.db.notificationLog.findUnique({
      where: {
        id: notificationId,
      },
      include: {
        incident: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!notification) {
      return true;
    }

    if (notification.status === "sent" || notification.status === "sent_after_ack" || notification.status === "skipped") {
      return true;
    }

    if (notification.eventAction === "incident.created"
      && (notification.incident.status === "acknowledged" || notification.incident.status === "resolved")) {
      await this.markSkipped(notificationId, `Incident is ${notification.incident.status}`, options);
      return true;
    }

    return false;
  }

  async markSent(
    notificationId: string,
    providerMessageId?: string,
    options: MarkNotificationSentOptions = {},
  ): Promise<NotificationLog> {
    const notification = await this.db.$transaction(async (tx) => {
      const completedAt = new Date();
      const attemptCompleted = await this.completeSendingDeliveryAttempt(
        tx,
        notificationId,
        options.deliveryAttemptId,
        {
          status: "sent",
          providerMessageId: providerMessageId ?? null,
          errorMessage: null,
          completedAt,
        },
      );

      if (!attemptCompleted) {
        return tx.notificationLog.findUniqueOrThrow({
          where: {
            id: notificationId,
          },
        });
      }

      const existing = await tx.notificationLog.findUniqueOrThrow({
        where: {
          id: notificationId,
        },
        include: {
          incident: {
            select: {
              status: true,
              workspaceId: true,
            },
          },
        },
      });
      const sentAfterAck = existing.incident.status === "acknowledged" || existing.incident.status === "resolved";
      const updated = await tx.notificationLog.update({
        where: {
          id: notificationId,
        },
        data: {
          status: sentAfterAck ? "sent_after_ack" : "sent",
          attempt: {
            increment: 1,
          },
          providerMessageId: providerMessageId ?? null,
          errorMessage: sentAfterAck ? `Incident is ${existing.incident.status}` : null,
          nextRetryAt: null,
          sentAt: completedAt,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: existing.incident.workspaceId,
        resourceType: "notification",
        resourceId: notificationId,
        action: sentAfterAck ? "notification.sent_after_ack" : "notification.sent",
        message: sentAfterAck
          ? "Notification sent after incident was acknowledged or resolved"
          : "Notification sent",
        metadata: activityMetadataForNotification(updated, {
          delivery_attempt_id: options.deliveryAttemptId,
          incident_status: existing.incident.status,
          provider_message_id: providerMessageId ?? null,
        }),
      });

      return updated;
    });

    return this.mapNotification(notification);
  }

  async markFailed(
    notificationId: string,
    errorMessage: string,
    options: MarkNotificationFailedOptions = {},
  ): Promise<NotificationLog> {
    const notification = await this.db.$transaction(async (tx) => {
      const existing = await tx.notificationLog.findUniqueOrThrow({
        where: {
          id: notificationId,
        },
        include: {
          incident: {
            select: {
              status: true,
              workspaceId: true,
            },
          },
        },
      });

      if (existing.incident.status === "acknowledged" || existing.incident.status === "resolved") {
        const completedAt = new Date();
        const attemptCompleted = await this.completeSendingDeliveryAttempt(
          tx,
          notificationId,
          options.deliveryAttemptId,
          {
            status: "failed",
            errorMessage,
            retryAfterSeconds: options.retryAfterSeconds ?? null,
            completedAt,
          },
        );

        if (!attemptCompleted) {
          return existing;
        }

        const updated = await tx.notificationLog.update({
          where: {
            id: notificationId,
          },
          data: {
            status: "skipped",
            errorMessage: `Incident is ${existing.incident.status}; provider failed after incident was closed: ${errorMessage}`,
            nextRetryAt: null,
          },
        });

        await recordActivityLog(tx, {
          workspaceId: existing.incident.workspaceId,
          resourceType: "notification",
          resourceId: notificationId,
          action: "notification.skipped_after_ack",
          message: "Notification retry skipped after incident was acknowledged or resolved",
          metadata: activityMetadataForNotification(updated, {
            delivery_attempt_id: options.deliveryAttemptId,
            error_message: errorMessage,
            incident_status: existing.incident.status,
            retry_after_seconds: options.retryAfterSeconds ?? null,
          }),
        });

        return updated;
      }

      const nextAttempt = existing.attempt + 1;
      const maxAttempts = options.maxAttempts ?? 3;
      const retryable = nextAttempt < maxAttempts;
      const retryDelayMs = options.retryAfterSeconds !== undefined
        ? Math.max(0, options.retryAfterSeconds) * 1000
        : nextAttempt * 60_000;
      const completedAt = new Date();
      const attemptCompleted = await this.completeSendingDeliveryAttempt(
        tx,
        notificationId,
        options.deliveryAttemptId,
        {
          status: "failed",
          errorMessage,
          retryAfterSeconds: options.retryAfterSeconds ?? null,
          completedAt,
        },
      );

      if (!attemptCompleted) {
        return existing;
      }

      const updated = await tx.notificationLog.update({
        where: {
          id: notificationId,
        },
        data: {
          status: retryable ? "retrying" : "failed",
          attempt: nextAttempt,
          errorMessage,
          nextRetryAt: retryable ? new Date(Date.now() + retryDelayMs) : null,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: existing.incident.workspaceId,
        resourceType: "notification",
        resourceId: notificationId,
        action: retryable ? "notification.retrying" : "notification.failed",
        message: retryable ? "Notification delivery failed and will retry" : "Notification delivery failed",
        metadata: activityMetadataForNotification(updated, {
          delivery_attempt_id: options.deliveryAttemptId,
          error_message: errorMessage,
          retry_after_seconds: options.retryAfterSeconds ?? null,
          retryable,
        }),
      });

      return updated;
    });

    return this.mapNotification(notification);
  }

  async markSkipped(
    notificationId: string,
    reason: string,
    options: MarkNotificationSkippedOptions = {},
  ): Promise<NotificationLog> {
    const notification = await this.db.$transaction((tx) =>
      this.markSkippedInTransaction(tx, notificationId, reason, options),
    );

    return this.mapNotification(notification);
  }

  private async markSkippedInTransaction(
    tx: TransactionClient,
    notificationId: string,
    reason: string,
    options: MarkNotificationSkippedOptions = {},
  ): Promise<NotificationLogRecord> {
    const completedAt = new Date();
    const attemptCompleted = await this.completeSendingDeliveryAttempt(
      tx,
      notificationId,
      options.deliveryAttemptId,
      {
        status: "skipped",
        errorMessage: reason,
        completedAt,
      },
    );

    if (!attemptCompleted) {
      return tx.notificationLog.findUniqueOrThrow({
        where: {
          id: notificationId,
        },
      });
    }

    const notification = await tx.notificationLog.update({
      where: {
        id: notificationId,
      },
      include: {
        incident: {
          select: {
            workspaceId: true,
          },
        },
      },
      data: {
        status: "skipped",
        errorMessage: reason,
        nextRetryAt: null,
      },
    });

    await recordActivityLog(tx, {
      workspaceId: notification.incident.workspaceId,
      resourceType: "notification",
      resourceId: notificationId,
      action: "notification.skipped",
      message: "Notification skipped",
      metadata: activityMetadataForNotification(notification, {
        delivery_attempt_id: options.deliveryAttemptId,
        reason,
      }),
    });

    return notification;
  }

  private async completeSendingDeliveryAttempt(
    tx: TransactionClient,
    notificationId: string,
    deliveryAttemptId: string | undefined,
    data: Prisma.NotificationDeliveryAttemptUpdateManyMutationInput,
  ): Promise<boolean> {
    if (!deliveryAttemptId) {
      return true;
    }

    const completed = await tx.notificationDeliveryAttempt.updateMany({
      where: {
        id: deliveryAttemptId,
        notificationLogId: notificationId,
        status: "sending",
        completedAt: null,
      },
      data,
    });

    return completed.count === 1;
  }

  private mapNotification(notification: NotificationLogRecord): NotificationLog {
    return {
      id: notification.id,
      incident_id: notification.incidentId,
      policy_step_id: notification.policyStepId,
      repeat_iteration: notification.repeatIteration,
      channel: notification.channel as NotificationLog["channel"],
      target_type: notification.targetType as NotificationLog["target_type"],
      target_id: notification.targetId,
      target_address: notification.targetAddress,
      status: notification.status as NotificationLog["status"],
      attempt: notification.attempt,
      idempotency_key: notification.idempotencyKey,
      event_action: notification.eventAction,
      provider_message_id: notification.providerMessageId,
      error_message: notification.errorMessage,
      next_retry_at: notification.nextRetryAt?.toISOString() ?? null,
      sent_at: notification.sentAt?.toISOString() ?? null,
      created_at: notification.createdAt.toISOString(),
      updated_at: notification.updatedAt.toISOString(),
    };
  }

  private mapDeliveryAttempt(attempt: NotificationDeliveryAttemptRecord): NotificationDeliveryAttempt {
    return {
      id: attempt.id,
      notification_log_id: attempt.notificationLogId,
      attempt: attempt.attempt,
      status: attempt.status as NotificationDeliveryAttempt["status"],
      provider: attempt.provider,
      provider_message_id: attempt.providerMessageId,
      error_message: attempt.errorMessage,
      retry_after_seconds: attempt.retryAfterSeconds,
      started_at: attempt.startedAt.toISOString(),
      completed_at: attempt.completedAt?.toISOString() ?? null,
      metadata: attempt.metadata ?? null,
    };
  }
}

function activityMetadataForNotification(
  notification: NotificationLogRecord,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    attempt: notification.attempt,
    channel: notification.channel,
    incident_id: notification.incidentId,
    notification_status: notification.status,
    provider_message_id: notification.providerMessageId,
    target_type: notification.targetType,
    ...metadata,
  };
}
