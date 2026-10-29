import type {
  CreateIncidentRequest,
  Incident,
  IncidentDetail,
  IncidentEscalationState,
  IncidentFilter,
  IncidentNotificationsQuery,
  IncidentPriority,
  IncidentSeverity,
  IncidentTimelineQuery,
  IncidentTimelineEntry,
  NotificationLog,
  PaginatedResponse,
} from "@im/contracts";
import type { PrismaClient, TransactionClient } from "@im/db";

import { recordActivityLog } from "../activity";
import { IncidentError } from "./incident.errors";

type IncidentRecord = {
  id: string;
  workspaceId: string;
  serviceId: string;
  title: string;
  description: string | null;
  severity: string;
  priority: string;
  status: string;
  source: string;
  fingerprint: string;
  dedupKey: string | null;
  acknowledgedById: string | null;
  acknowledgedAt: Date | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type IncidentTimelineRecord = {
  id: string;
  incidentId: string;
  type: string;
  message: string;
  metadata: unknown;
  actorUserId: string | null;
  createdAt: Date;
};

type IncidentEscalationStateRecord = {
  incidentId: string;
  policyId: string;
  currentStep: number;
  repeatIteration: number;
  nextRunAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type EscalationPolicyForIncidentStart = {
  id: string;
  name: string;
  repeatEnabled: boolean;
  repeatIntervalSeconds: number | null;
  repeatLimit: number | null;
  steps: {
    id: string;
    stepOrder: number;
    delaySeconds: number;
    targetType: string;
    targetId: string | null;
  }[];
};

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

type IncidentListFilters = Partial<IncidentFilter> & {
  workspaceIds?: string[];
};

export class IncidentService {
  constructor(private readonly db: PrismaClient) {}

  async listIncidents(filters: IncidentListFilters = {}): Promise<PaginatedResponse<Incident>> {
    const limit = filters.limit ?? 25;
    const incidents = await this.db.incident.findMany({
      where: {
        ...(filters.workspace_id
          ? { workspaceId: filters.workspace_id }
          : filters.workspaceIds
            ? { workspaceId: { in: filters.workspaceIds } }
            : {}),
        ...(filters.service_id ? { serviceId: filters.service_id } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.status === "open"
          ? { status: { in: ["triggered", "acknowledged"] as const } }
          : filters.status ? { status: filters.status } : {}),
      },
      orderBy: filters.status === "open"
        ? [{ priority: "asc" }, { createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      ...(filters.cursor
        ? {
            cursor: {
              id: filters.cursor,
            },
            skip: 1,
          }
        : {}),
      take: limit + 1,
    });

    const items = incidents.slice(0, limit).map((incident) => this.mapIncident(incident));

    return {
      items,
      next_cursor: incidents.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async listIncidentsForService(
    serviceId: string,
    filters: Omit<IncidentListFilters, "service_id"> = {},
  ): Promise<PaginatedResponse<Incident>> {
    return this.listIncidents({ ...filters, service_id: serviceId });
  }

  async getIncident(incidentId: string): Promise<Incident | null> {
    const incident = await this.db.incident.findUnique({
      where: {
        id: incidentId,
      },
    });

    return incident ? this.mapIncident(incident) : null;
  }

  async getIncidentDetail(incidentId: string): Promise<IncidentDetail | null> {
    const incident = await this.getIncident(incidentId);

    if (!incident) {
      return null;
    }

    const [escalation, timelineSummary, notificationTotal, notificationStatusCounts] = await Promise.all([
      this.getEscalationState(incidentId),
      this.db.incidentTimelineEntry.aggregate({
        where: {
          incidentId,
        },
        _count: {
          _all: true,
        },
        _max: {
          createdAt: true,
        },
      }),
      this.db.notificationLog.count({
        where: {
          incidentId,
        },
      }),
      this.db.notificationLog.groupBy({
        by: ["status"],
        where: {
          incidentId,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    return {
      incident,
      escalation,
      timeline_summary: {
        total: timelineSummary._count._all,
        latest_created_at: timelineSummary._max.createdAt?.toISOString() ?? null,
      },
      notification_summary: {
        total: notificationTotal,
        by_status: notificationStatusCounts.map((row) => ({
          status: row.status as IncidentDetail["notification_summary"]["by_status"][number]["status"],
          count: row._count._all,
        })),
      },
    };
  }

  async createManualIncident(input: CreateIncidentRequest): Promise<Incident> {
    const incident = await this.db.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: {
          id: input.service_id,
        },
        include: {
          escalationPolicy: {
            include: {
              steps: {
                orderBy: {
                  stepOrder: "asc",
                },
              },
            },
          },
        },
      });

      if (!service) {
        throw new IncidentError("service_not_found", "Service not found");
      }

      const now = new Date();
      const createdIncident = await tx.incident.create({
        data: {
          workspaceId: service.workspaceId,
          serviceId: input.service_id,
          title: input.title,
          description: input.description ?? null,
          severity: input.severity,
          priority: input.priority ?? priorityFromSeverity(input.severity),
          source: input.source,
          fingerprint: input.dedup_key ?? `manual:${input.service_id}:${input.title}:${now.toISOString()}`,
          dedupKey: input.dedup_key ?? null,
        },
      });

      await tx.incidentTimelineEntry.create({
        data: {
          incidentId: createdIncident.id,
          type: "incident.created",
          message: `Incident created: ${createdIncident.title}`,
          metadata: {
            priority: createdIncident.priority,
            severity: createdIncident.severity,
            source: createdIncident.source,
          },
        },
      });

      await recordActivityLog(tx, {
        workspaceId: createdIncident.workspaceId,
        resourceType: "incident",
        resourceId: createdIncident.id,
        action: "incident.created",
        message: `Incident created: ${createdIncident.title}`,
        metadata: {
          incident_id: createdIncident.id,
          service_id: createdIncident.serviceId,
          priority: createdIncident.priority,
          severity: createdIncident.severity,
          source: createdIncident.source,
          status: createdIncident.status,
          title: createdIncident.title,
        },
      });
      await this.startEscalationForIncidentInTransaction(tx, {
        incidentId: createdIncident.id,
        now,
        policy: service.escalationPolicy,
      });

      return createdIncident;
    });

    return this.mapIncident(incident);
  }

  async updateIncidentPriority(
    incidentId: string,
    priority: IncidentPriority,
    actorUserId?: string,
  ): Promise<Incident> {
    const incident = await this.db.$transaction(async (tx) => {
      const actor = actorUserId
        ? await tx.user.findUnique({ where: { id: actorUserId } })
        : await tx.user.findFirst({ orderBy: { createdAt: "asc" } });

      if (!actor) {
        throw new IncidentError("actor_not_found", "Actor user not found");
      }

      const current = await tx.incident.findUnique({
        where: {
          id: incidentId,
        },
      });

      if (!current) {
        throw new IncidentError("incident_not_found", "Incident not found");
      }

      if (current.priority === priority) {
        return current;
      }

      const updated = await tx.incident.update({
        where: {
          id: incidentId,
        },
        data: {
          priority,
        },
      });

      await tx.incidentTimelineEntry.create({
        data: {
          incidentId,
          type: "incident.priority_updated",
          message: `Incident priority changed from ${current.priority} to ${updated.priority}`,
          actorUserId: actor.id,
          metadata: {
            previous_priority: current.priority,
            priority: updated.priority,
          },
        },
      });

      await recordActivityLog(tx, {
        workspaceId: updated.workspaceId,
        resourceType: "incident",
        resourceId: incidentId,
        action: "incident.priority_updated",
        message: `Incident priority changed from ${current.priority} to ${updated.priority}`,
        actorUserId: actor.id,
        metadata: {
          incident_id: updated.id,
          previous_priority: current.priority,
          priority: updated.priority,
          service_id: updated.serviceId,
          severity: updated.severity,
          status: updated.status,
          title: updated.title,
        },
      });
      await this.queueLifecycleNotificationsInTransaction(tx, updated, "incident.priority_updated");

      return updated;
    });

    return this.mapIncident(incident);
  }

  async startEscalationForIncidentInTransaction(
    tx: TransactionClient,
    input: {
      incidentId: string;
      policy: EscalationPolicyForIncidentStart | null;
      now?: Date;
    },
  ): Promise<IncidentEscalationStateRecord | null> {
    const policy = input.policy;
    const snapshot = policy ? this.snapshotEscalationPolicy(policy) : null;
    const firstStep = snapshot?.steps[0];

    if (!policy || !firstStep) {
      return null;
    }

    const now = input.now ?? new Date();
    const nextRunAt = new Date(now.getTime() + firstStep.delay_seconds * 1000);
    const escalationState = await tx.incidentEscalationState.create({
      data: {
        incidentId: input.incidentId,
        policyId: policy.id,
        policySnapshot: snapshot,
        currentStep: firstStep.step_order,
        repeatIteration: 0,
        nextRunAt,
        status: "active",
      },
    });

    await tx.incidentTimelineEntry.create({
      data: {
        incidentId: input.incidentId,
        type: "escalation.started",
        message: `Escalation started using policy ${policy.name}`,
        metadata: {
          policy_id: policy.id,
          first_step: firstStep.step_order,
          next_run_at: nextRunAt.toISOString(),
        },
      },
    });

    return escalationState;
  }

  async acknowledgeIncident(incidentId: string, actorUserId?: string): Promise<Incident> {
    const incident = await this.db.$transaction(async (tx) => {
      const actor = actorUserId
        ? await tx.user.findUnique({ where: { id: actorUserId } })
        : await tx.user.findFirst({ orderBy: { createdAt: "asc" } });

      if (!actor) {
        throw new IncidentError("actor_not_found", "Actor user not found");
      }

      const current = await tx.incident.findUnique({
        where: {
          id: incidentId,
        },
      });

      if (!current) {
        throw new IncidentError("incident_not_found", "Incident not found");
      }

      if (current.status === "resolved") {
        throw new IncidentError("invalid_incident_transition", "Resolved incidents cannot be acknowledged");
      }

      if (current.status === "acknowledged") {
        await this.skipOpenNotificationsInTransaction(tx, incidentId, current.workspaceId, "Incident is acknowledged");
        return current;
      }

      const updated = await tx.incident.update({
        where: {
          id: incidentId,
        },
        data: {
          status: "acknowledged",
          acknowledgedById: actor.id,
          acknowledgedAt: new Date(),
        },
      });

      await tx.incidentTimelineEntry.create({
        data: {
          incidentId,
          type: "incident.acknowledged",
          message: `Incident acknowledged by ${actor.name}`,
          actorUserId: actor.id,
        },
      });

      await tx.incidentEscalationState.updateMany({
        where: {
          incidentId,
          status: "active",
        },
        data: {
          status: "stopped",
          nextRunAt: null,
        },
      });

      await this.skipOpenNotificationsInTransaction(tx, incidentId, updated.workspaceId, "Incident is acknowledged");

      await recordActivityLog(tx, {
        workspaceId: updated.workspaceId,
        resourceType: "incident",
        resourceId: incidentId,
        action: "incident.acknowledged",
        message: `Incident acknowledged by ${actor.name}`,
        actorUserId: actor.id,
        metadata: {
          incident_id: updated.id,
          service_id: updated.serviceId,
          priority: updated.priority,
          severity: updated.severity,
          status: updated.status,
          title: updated.title,
        },
      });
      await this.queueLifecycleNotificationsInTransaction(tx, updated, "incident.acknowledged");

      return updated;
    });

    return this.mapIncident(incident);
  }

  async resolveIncident(incidentId: string, actorUserId?: string): Promise<Incident> {
    const incident = await this.db.$transaction(async (tx) => {
      const actor = actorUserId
        ? await tx.user.findUnique({ where: { id: actorUserId } })
        : await tx.user.findFirst({ orderBy: { createdAt: "asc" } });

      if (!actor) {
        throw new IncidentError("actor_not_found", "Actor user not found");
      }

      const current = await tx.incident.findUnique({
        where: {
          id: incidentId,
        },
      });

      if (!current) {
        throw new IncidentError("incident_not_found", "Incident not found");
      }

      if (current.status === "resolved") {
        await this.skipOpenNotificationsInTransaction(tx, incidentId, current.workspaceId, "Incident is resolved");
        return current;
      }

      const updated = await tx.incident.update({
        where: {
          id: incidentId,
        },
        data: {
          status: "resolved",
          resolvedById: actor.id,
          resolvedAt: new Date(),
        },
      });

      await tx.incidentTimelineEntry.create({
        data: {
          incidentId,
          type: "incident.resolved",
          message: `Incident resolved by ${actor.name}`,
          actorUserId: actor.id,
        },
      });

      await tx.incidentEscalationState.updateMany({
        where: {
          incidentId,
          status: {
            in: ["active", "paused"],
          },
        },
        data: {
          status: "stopped",
          nextRunAt: null,
        },
      });

      await this.skipOpenNotificationsInTransaction(tx, incidentId, updated.workspaceId, "Incident is resolved");

      await recordActivityLog(tx, {
        workspaceId: updated.workspaceId,
        resourceType: "incident",
        resourceId: incidentId,
        action: "incident.resolved",
        message: `Incident resolved by ${actor.name}`,
        actorUserId: actor.id,
        metadata: {
          incident_id: updated.id,
          service_id: updated.serviceId,
          priority: updated.priority,
          severity: updated.severity,
          status: updated.status,
          title: updated.title,
        },
      });
      await this.queueLifecycleNotificationsInTransaction(tx, updated, "incident.resolved");

      return updated;
    });

    return this.mapIncident(incident);
  }

  async listTimelineEntries(
    incidentId: string,
    query: Partial<IncidentTimelineQuery> = {},
  ): Promise<PaginatedResponse<IncidentTimelineEntry>> {
    const limit = query.limit ?? 25;
    const entries = await this.db.incidentTimelineEntry.findMany({
      where: {
        incidentId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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

    const items = entries.slice(0, limit).map((entry) => this.mapTimelineEntry(entry));

    return {
      items,
      next_cursor: entries.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async listNotifications(
    incidentId: string,
    query: Partial<IncidentNotificationsQuery> = {},
  ): Promise<PaginatedResponse<NotificationLog>> {
    const limit = query.limit ?? 25;
    const notifications = await this.db.notificationLog.findMany({
      where: {
        incidentId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

    const items = notifications.slice(0, limit).map((notification) => this.mapNotification(notification));

    return {
      items,
      next_cursor: notifications.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async getEscalationState(incidentId: string): Promise<IncidentEscalationState | null> {
    const state = await this.db.incidentEscalationState.findUnique({
      where: {
        incidentId,
      },
    });

    return state ? this.mapEscalationState(state) : null;
  }

  private snapshotEscalationPolicy(policy: EscalationPolicyForIncidentStart) {
    return {
      id: policy.id,
      name: policy.name,
      repeat_enabled: policy.repeatEnabled,
      repeat_interval_seconds: policy.repeatIntervalSeconds,
      repeat_limit: policy.repeatLimit,
      steps: policy.steps
        .map((step) => ({
          id: step.id,
          step_order: step.stepOrder,
          delay_seconds: step.delaySeconds,
          target_type: step.targetType,
          target_id: step.targetId,
        }))
        .sort((left, right) => left.step_order - right.step_order),
    };
  }

  async skipOpenNotificationsInTransaction(
    tx: TransactionClient,
    incidentId: string,
    workspaceId: string,
    reason: string,
  ): Promise<void> {
    const notifications = await tx.notificationLog.findMany({
      where: {
        incidentId,
        status: {
          in: ["pending", "retrying", "failed"],
        },
      },
      include: {
        deliveryAttempts: {
          select: {
            attempt: true,
          },
          orderBy: {
            attempt: "desc",
          },
          take: 1,
        },
      },
    });

    for (const notification of notifications) {
      const nextAttempt = Math.max(notification.attempt, notification.deliveryAttempts[0]?.attempt ?? 0) + 1;

      await tx.notificationDeliveryAttempt.create({
        data: {
          notificationLogId: notification.id,
          attempt: nextAttempt,
          status: "skipped",
          provider: "system",
          errorMessage: reason,
          startedAt: new Date(),
          completedAt: new Date(),
          metadata: {
            reason,
            incident_id: incidentId,
          },
        },
      });

      const updated = await tx.notificationLog.update({
        where: {
          id: notification.id,
        },
        data: {
          status: "skipped",
          errorMessage: reason,
          nextRetryAt: null,
        },
      });

      await recordActivityLog(tx, {
        workspaceId,
        resourceType: "notification",
        resourceId: notification.id,
        action: "notification.skipped",
        message: "Notification skipped",
        metadata: {
          attempt: updated.attempt,
          channel: updated.channel,
          incident_id: incidentId,
          notification_status: updated.status,
          reason,
          target_type: updated.targetType,
        },
      });

      await tx.incidentTimelineEntry.create({
        data: {
          incidentId,
          type: "notification.skipped",
          message: `Notification skipped: ${reason}`,
          metadata: {
            notification_id: notification.id,
            channel: updated.channel,
            reason,
          },
        },
      });
    }
  }

  async queueLifecycleNotificationsInTransaction(
    tx: TransactionClient,
    incident: IncidentRecord,
    eventAction: "incident.acknowledged" | "incident.resolved" | "incident.priority_updated",
  ): Promise<void> {
    const settings = await tx.workspaceNotificationProviderSetting.findMany({
      where: { workspaceId: incident.workspaceId, enabled: true, provider: { in: ["email", "twilio"] } },
    });
    const enabledProviders = new Set(settings
      .filter((setting) => {
        const config = typeof setting.config === "object" && setting.config && !Array.isArray(setting.config)
          ? setting.config as Record<string, unknown>
          : {};
        return Array.isArray(config.event_actions) && config.event_actions.includes(eventAction);
      })
      .map((setting) => setting.provider));
    if (enabledProviders.size === 0) return;

    const channels = [
      ...(enabledProviders.has("email") ? ["email" as const] : []),
      ...(enabledProviders.has("twilio") ? ["sms" as const, "phone" as const] : []),
    ];
    const recipients = await tx.notificationLog.findMany({
      where: { incidentId: incident.id, eventAction: "incident.created", channel: { in: channels } },
      distinct: ["channel", "targetType", "targetId", "targetAddress"],
    });
    if (recipients.length === 0) return;

    await tx.notificationLog.createMany({
      data: recipients.map((recipient) => ({
        incidentId: incident.id,
        channel: recipient.channel,
        targetType: recipient.targetType,
        targetId: recipient.targetId,
        targetAddress: recipient.targetAddress,
        status: "pending",
        nextRetryAt: new Date(),
        eventAction,
        idempotencyKey: `${incident.id}:${eventAction}:${recipient.channel}:${recipient.targetType}:${recipient.targetId ?? recipient.targetAddress}`,
      })),
      skipDuplicates: true,
    });
  }

  private mapIncident(incident: IncidentRecord): Incident {
    return {
      id: incident.id,
      workspace_id: incident.workspaceId,
      service_id: incident.serviceId,
      title: incident.title,
      description: incident.description,
      severity: incident.severity as Incident["severity"],
      priority: incident.priority as Incident["priority"],
      status: incident.status as Incident["status"],
      source: incident.source,
      fingerprint: incident.fingerprint,
      dedup_key: incident.dedupKey,
      acknowledged_by: incident.acknowledgedById,
      acknowledged_at: incident.acknowledgedAt?.toISOString() ?? null,
      resolved_by: incident.resolvedById,
      resolved_at: incident.resolvedAt?.toISOString() ?? null,
      created_at: incident.createdAt.toISOString(),
      updated_at: incident.updatedAt.toISOString(),
    };
  }

  private mapTimelineEntry(entry: IncidentTimelineRecord): IncidentTimelineEntry {
    return {
      id: entry.id,
      incident_id: entry.incidentId,
      type: entry.type,
      message: entry.message,
      metadata: entry.metadata ?? null,
      actor_user_id: entry.actorUserId,
      created_at: entry.createdAt.toISOString(),
    };
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
      target_address: maskNotificationTargetAddress(notification.targetAddress),
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

  private mapEscalationState(state: IncidentEscalationStateRecord): IncidentEscalationState {
    return {
      incident_id: state.incidentId,
      policy_id: state.policyId,
      current_step: state.currentStep,
      repeat_iteration: state.repeatIteration,
      next_run_at: state.nextRunAt?.toISOString() ?? null,
      status: state.status as IncidentEscalationState["status"],
      created_at: state.createdAt.toISOString(),
      updated_at: state.updatedAt.toISOString(),
    };
  }
}

function priorityFromSeverity(severity: IncidentSeverity): IncidentPriority {
  if (severity === "critical") {
    return "P1";
  }

  if (severity === "high") {
    return "P2";
  }

  if (severity === "medium") {
    return "P3";
  }

  return "P4";
}

function maskNotificationTargetAddress(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value);
      return `${url.origin}/***`;
    } catch {
      return "***";
    }
  }

  const [localPart, domain] = value.split("@");

  if (localPart && domain) {
    return `${localPart.slice(0, 2)}***@${domain}`;
  }

  return value ? "***" : "";
}
