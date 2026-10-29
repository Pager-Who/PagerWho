import type {
  PaginatedPlatformUsers,
  PaginatedPlatformWorkspaces,
  PlatformListUsersQuery,
  PlatformListWorkspacesQuery,
  PlatformDiagnostics,
  PlatformDiagnosticsQuery,
  PlatformInspectorQuery,
  PlatformInspectorResult,
  PlatformResourceList,
  PlatformResourceListQuery,
  PlatformMe,
  PlatformOverview,
  PlatformUserDetail,
  PlatformUserSummary,
  PlatformWorkspaceDetail,
  PlatformWorkspaceSummary,
  WorkspaceQuotaResource,
  WorkspaceRole,
  WorkspaceRoleKey,
} from "@im/contracts";
import { type Prisma, type PrismaClient } from "@im/db";

import { ActivityLogService, recordActivityLog } from "../activity";
import { QuotaService } from "../quotas";
import { WorkspaceService } from "../workspaces";
import { workspaceRoleKeys } from "../workspaces/workspace-permissions";
import { PlatformError } from "./platform.errors";

type PlatformUserRecord = Prisma.UserGetPayload<{
  include: {
    _count: {
      select: {
        workspaceMemberships: true;
      };
    };
    platformAdminRoles: true;
  };
}>;

type PlatformWorkspaceRecord = Prisma.WorkspaceGetPayload<{
  include: {
    _count: {
      select: {
        incidents: true;
        members: true;
        services: true;
      };
    };
    quotaSettings: true;
  };
}>;

export class PlatformService {
  private readonly activityLogService: ActivityLogService;
  private readonly quotaService: QuotaService;
  private readonly workspaceService: WorkspaceService;

  constructor(private readonly db: PrismaClient) {
    this.activityLogService = new ActivityLogService(db);
    this.quotaService = new QuotaService(db);
    this.workspaceService = new WorkspaceService(db);
  }

  async getPlatformMe(actorUserId: string): Promise<PlatformMe> {
    const roles = await this.listPlatformRoles(actorUserId);

    return {
      is_platform_admin: roles.includes("platform_admin"),
      roles,
    };
  }

  async assertPlatformAdmin(actorUserId: string): Promise<void> {
    const admin = await this.db.platformAdminRole.findFirst({
      where: {
        role: "platform_admin",
        userId: actorUserId,
        user: {
          suspendedAt: null,
        },
      },
      select: {
        userId: true,
      },
    });

    if (!admin) {
      throw new PlatformError("platform_admin_required", "Platform admin access required");
    }
  }

  async listPlatformRoles(userId: string): Promise<Array<"platform_admin">> {
    const roles = await this.db.platformAdminRole.findMany({
      where: {
        userId,
      },
      orderBy: {
        role: "asc",
      },
    });

    return roles.map((role) => role.role as "platform_admin");
  }

  async getOverview(actorUserId: string): Promise<PlatformOverview> {
    await this.assertPlatformAdmin(actorUserId);
    const now = new Date();
    const since24HoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [
      users,
      suspendedUsers,
      workspaces,
      suspendedWorkspaces,
      openIncidents,
      notificationDeadLetters,
      newUsers24h,
      activeSessions,
      failedNotifications24h,
      failedWorkerRuns24h,
      api5xx24h,
      notificationOutcomes24h,
      failedNotifications,
      failedWorkerRuns,
    ] = await Promise.all([
      this.db.user.count(),
      this.db.user.count({ where: { suspendedAt: { not: null } } }),
      this.db.workspace.count(),
      this.db.workspace.count({ where: { suspendedAt: { not: null } } }),
      this.db.incident.count({ where: { status: { in: ["triggered", "acknowledged"] } } }),
      this.db.notificationLog.count({ where: { status: "failed", nextRetryAt: null } }),
      this.db.user.count({ where: { createdAt: { gte: since24HoursAgo } } }),
      this.db.authSession.count({ where: { expiresAt: { gt: now }, revokedAt: null } }),
      this.db.notificationLog.count({ where: { status: "failed", updatedAt: { gte: since24HoursAgo } } }),
      this.db.workerRunLog.count({ where: { status: "failed", startedAt: { gte: since24HoursAgo } } }),
      this.db.activityLog.count({ where: { action: "api.request_failed", createdAt: { gte: since24HoursAgo } } }),
      this.db.notificationLog.findMany({
        where: {
          status: { in: ["sent", "sent_after_ack", "failed"] },
          updatedAt: { gte: since24HoursAgo },
        },
        select: { createdAt: true, sentAt: true, status: true, updatedAt: true },
      }),
      this.db.notificationLog.findMany({
        where: { status: "failed" },
        include: {
          incident: {
            select: { id: true, title: true, workspaceId: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      this.db.workerRunLog.findMany({
        where: { status: "failed" },
        orderBy: { startedAt: "desc" },
        take: 8,
      }),
    ]);
    const successfulNotifications = notificationOutcomes24h.filter((notification) =>
      notification.status === "sent" || notification.status === "sent_after_ack");
    const completedNotifications = successfulNotifications.length
      + notificationOutcomes24h.filter((notification) => notification.status === "failed").length;
    const notificationLatencies = successfulNotifications
      .filter((notification) => notification.sentAt)
      .map((notification) => notification.sentAt!.getTime() - notification.createdAt.getTime());

    return {
      attention: [
        ...failedNotifications.map((notification) => ({
          created_at: notification.updatedAt.toISOString(),
          detail: notification.errorMessage,
          id: notification.id,
          incident_id: notification.incident.id,
          kind: "notification" as const,
          status: notification.nextRetryAt ? "retrying" : "dead_letter",
          title: notification.incident.title,
          workspace_id: notification.incident.workspaceId,
        })),
        ...failedWorkerRuns.map((run) => ({
          created_at: run.startedAt.toISOString(),
          detail: run.errorMessage,
          id: run.id,
          incident_id: null,
          kind: "worker" as const,
          status: run.status,
          title: run.workerName,
          workspace_id: null,
        })),
      ]
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, 10),
      counts: {
        active_sessions: activeSessions,
        api_5xx_24h: api5xx24h,
        average_notification_latency_ms_24h: average(notificationLatencies),
        failed_notifications_24h: failedNotifications24h,
        failed_worker_runs_24h: failedWorkerRuns24h,
        new_users_24h: newUsers24h,
        notification_dead_letters: notificationDeadLetters,
        open_incidents: openIncidents,
        notification_success_rate_24h: completedNotifications > 0
          ? successfulNotifications.length / completedNotifications * 100
          : null,
        suspended_users: suspendedUsers,
        suspended_workspaces: suspendedWorkspaces,
        users,
        workspaces,
      },
      deployment_version: process.env.APP_VERSION?.trim() || "development",
      notification_trend: buildNotificationTrend(notificationOutcomes24h, now),
    };
  }

  async getDiagnostics(
    actorUserId: string,
    query: PlatformDiagnosticsQuery,
  ): Promise<PlatformDiagnostics> {
    await this.assertPlatformAdmin(actorUserId);
    const includeNotifications = query.kind === "all" || query.kind === "notification";
    const includeWebhooks = query.kind === "all" || query.kind === "webhook";
    const includeWorkers = (query.kind === "all" || query.kind === "worker") && !query.workspace_id;
    const [notifications, workerRuns, webhookEvents] = await Promise.all([
      includeNotifications && (!query.request_id || UuidPattern.test(query.request_id))
        ? this.db.notificationLog.findMany({
            where: {
              status: { in: ["failed", "retrying"] },
              ...(query.request_id ? { id: query.request_id } : {}),
              ...(query.workspace_id ? { incident: { workspaceId: query.workspace_id } } : {}),
              ...(query.search
                ? {
                    OR: [
                      { errorMessage: { contains: query.search, mode: "insensitive" } },
                      { incident: { title: { contains: query.search, mode: "insensitive" } } },
                    ],
                  }
                : {}),
            },
            include: {
              incident: {
                select: {
                  id: true,
                  status: true,
                  title: true,
                  workspace: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { updatedAt: "desc" },
            take: query.limit,
          })
        : Promise.resolve([]),
      includeWorkers && (!query.request_id || UuidPattern.test(query.request_id))
        ? this.db.workerRunLog.findMany({
            where: {
              status: "failed",
              ...(query.request_id ? { id: query.request_id } : {}),
              ...(query.search
                ? {
                    OR: [
                      { errorMessage: { contains: query.search, mode: "insensitive" } },
                      { workerName: { contains: query.search, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            orderBy: { startedAt: "desc" },
            take: query.limit,
          })
        : Promise.resolve([]),
      includeWebhooks
        ? this.db.activityLog.findMany({
            where: {
              action: { in: ["webhook.ingestion_failed", "webhook.ingestion_succeeded"] },
              ...(query.workspace_id ? { workspaceId: query.workspace_id } : {}),
              ...(query.request_id
                ? { metadata: { path: ["request_id"], equals: query.request_id } }
                : {}),
              ...(query.search
                ? {
                    OR: [
                      { action: { contains: query.search, mode: "insensitive" } },
                      { message: { contains: query.search, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            include: {
              workspace: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: query.limit,
          })
        : Promise.resolve([]),
    ]);

    const items = [
      ...notifications.map((notification) => ({
        attempt: notification.attempt,
        can_retry: notification.status === "failed"
          && notification.nextRetryAt === null
          && notification.incident.status === "triggered",
        channel: notification.channel,
        detail: notification.errorMessage,
        id: notification.id,
        incident_id: notification.incident.id,
        incident_title: notification.incident.title,
        kind: "notification" as const,
        occurred_at: notification.updatedAt.toISOString(),
        request_id: notification.id,
        status: notification.nextRetryAt ? "retrying" : notification.status,
        title: `${notification.channel} notification`,
        workspace_id: notification.incident.workspace.id,
        workspace_name: notification.incident.workspace.name,
      })),
      ...workerRuns.map((run) => ({
        attempt: null,
        can_retry: false,
        channel: null,
        detail: run.errorMessage,
        id: run.id,
        incident_id: null,
        incident_title: null,
        kind: "worker" as const,
        occurred_at: run.startedAt.toISOString(),
        request_id: run.id,
        status: run.status,
        title: run.workerName,
        workspace_id: null,
        workspace_name: null,
      })),
      ...webhookEvents.map((event) => {
        const requestId = getMetadataString(event.metadata, "request_id");
        const incidentId = getMetadataUuid(event.metadata, "incident_id");
        const endpointName = getMetadataString(event.metadata, "endpoint_name");
        const errorCode = getMetadataString(event.metadata, "error_code");
        const action = getMetadataString(event.metadata, "action");

        return {
          attempt: null,
          can_retry: false,
          channel: "webhook",
          detail: errorCode ?? action,
          id: event.id,
          incident_id: incidentId,
          incident_title: null,
          kind: "webhook" as const,
          occurred_at: event.createdAt.toISOString(),
          request_id: requestId,
          status: event.action === "webhook.ingestion_succeeded" ? "succeeded" : "failed",
          title: endpointName ?? "Webhook ingestion",
          workspace_id: event.workspace?.id ?? null,
          workspace_name: event.workspace?.name ?? null,
        };
      }),
    ]
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .slice(0, query.limit);

    return { items };
  }

  async retryNotification(
    actorUserId: string,
    notificationId: string,
    reason: string,
  ): Promise<PlatformDiagnostics> {
    await this.assertPlatformAdmin(actorUserId);
    const notification = await this.db.notificationLog.findUnique({
      where: { id: notificationId },
      include: {
        incident: { select: { status: true, workspaceId: true } },
      },
    });

    if (!notification) {
      throw new PlatformError("notification_not_found", "Notification not found");
    }

    if (notification.status !== "failed" || notification.nextRetryAt || notification.incident.status !== "triggered") {
      throw new PlatformError("notification_not_retryable", "Only dead letters for open incidents can be retried");
    }

    await this.db.$transaction(async (tx) => {
      await tx.notificationLog.update({
        where: { id: notificationId },
        data: {
          nextRetryAt: new Date(),
          status: "retrying",
        },
      });
      await recordActivityLog(tx, {
        action: "platform.notification_retry_requested",
        actorUserId,
        message: "Notification retry requested by platform admin",
        metadata: { reason },
        resourceId: notificationId,
        resourceType: "notification",
        workspaceId: notification.incident.workspaceId,
      });
    });

    return this.getDiagnostics(actorUserId, { kind: "all", limit: 25 });
  }

  async inspectResource(
    actorUserId: string,
    query: PlatformInspectorQuery,
  ): Promise<PlatformInspectorResult> {
    await this.assertPlatformAdmin(actorUserId);
    let result: PlatformInspectorResult | null = null;

    if (query.resource_type === "user") {
      const user = await this.db.user.findUnique({
        where: { id: query.id },
        include: {
          workspaceMemberships: {
            include: { workspace: { select: { id: true, name: true } } },
          },
        },
      });

      if (user) {
        result = {
          created_at: user.createdAt.toISOString(),
          data: {
            email: user.email,
            email_verified: Boolean(user.emailVerifiedAt),
            name: user.name,
            suspended_at: user.suspendedAt?.toISOString() ?? null,
            suspension_reason: user.suspensionReason,
          },
          id: user.id,
          relationships: user.workspaceMemberships.map((membership) => ({
            id: membership.workspace.id,
            label: "workspace",
            resource_type: "workspace",
            title: membership.workspace.name,
          })),
          resource_type: "user",
          status: user.suspendedAt ? "suspended" : "active",
          title: user.name,
          updated_at: user.updatedAt.toISOString(),
          workspace_id: null,
          workspace_name: null,
        };
      }
    }

    if (query.resource_type === "workspace") {
      const workspace = await this.db.workspace.findUnique({
        where: { id: query.id },
        include: {
          _count: { select: { incidents: true, members: true, services: true } },
          quotaSettings: true,
        },
      });

      if (workspace) {
        result = {
          created_at: workspace.createdAt.toISOString(),
          data: {
            incident_count: workspace._count.incidents,
            member_count: workspace._count.members,
            service_count: workspace._count.services,
            slug: workspace.slug,
            suspended_at: workspace.suspendedAt?.toISOString() ?? null,
            suspension_reason: workspace.suspensionReason,
          },
          id: workspace.id,
          relationships: [],
          resource_type: "workspace",
          status: workspace.suspendedAt ? "suspended" : "active",
          title: workspace.name,
          updated_at: workspace.updatedAt.toISOString(),
          workspace_id: workspace.id,
          workspace_name: workspace.name,
        };
      }
    }

    if (query.resource_type === "incident") {
      const incident = await this.db.incident.findUnique({
        where: { id: query.id },
        include: {
          service: { select: { id: true, name: true } },
          workspace: { select: { id: true, name: true } },
        },
      });

      if (incident) {
        result = {
          created_at: incident.createdAt.toISOString(),
          data: {
            acknowledged_at: incident.acknowledgedAt?.toISOString() ?? null,
            description: incident.description,
            fingerprint: incident.fingerprint,
            priority: incident.priority,
            resolved_at: incident.resolvedAt?.toISOString() ?? null,
            severity: incident.severity,
            source: incident.source,
          },
          id: incident.id,
          relationships: [{
            id: incident.service.id,
            label: "service",
            resource_type: "service",
            title: incident.service.name,
          }],
          resource_type: "incident",
          status: incident.status,
          title: incident.title,
          updated_at: incident.updatedAt.toISOString(),
          workspace_id: incident.workspace.id,
          workspace_name: incident.workspace.name,
        };
      }
    }

    if (query.resource_type === "notification") {
      const notification = await this.db.notificationLog.findUnique({
        where: { id: query.id },
        include: {
          incident: {
            select: {
              id: true,
              title: true,
              workspace: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (notification) {
        result = {
          created_at: notification.createdAt.toISOString(),
          data: {
            attempt: notification.attempt,
            channel: notification.channel,
            error_message: notification.errorMessage,
            next_retry_at: notification.nextRetryAt?.toISOString() ?? null,
            provider_message_id: notification.providerMessageId,
            sent_at: notification.sentAt?.toISOString() ?? null,
            target_address: maskInspectorTarget(notification.targetAddress),
            target_type: notification.targetType,
          },
          id: notification.id,
          relationships: [{
            id: notification.incident.id,
            label: "incident",
            resource_type: "incident",
            title: notification.incident.title,
          }],
          resource_type: "notification",
          status: notification.status,
          title: `${notification.channel} notification`,
          updated_at: notification.updatedAt.toISOString(),
          workspace_id: notification.incident.workspace.id,
          workspace_name: notification.incident.workspace.name,
        };
      }
    }

    if (query.resource_type === "worker_run") {
      const run = await this.db.workerRunLog.findUnique({ where: { id: query.id } });

      if (run) {
        result = {
          created_at: run.startedAt.toISOString(),
          data: {
            completed_at: run.completedAt?.toISOString() ?? null,
            duration_ms: run.durationMs,
            error_message: run.errorMessage,
            metadata: redactSecretConfig(run.metadata),
            processed_count: run.processedCount,
          },
          id: run.id,
          relationships: [],
          resource_type: "worker_run",
          status: run.status,
          title: run.workerName,
          updated_at: run.completedAt?.toISOString() ?? null,
          workspace_id: null,
          workspace_name: null,
        };
      }
    }

    if (!result) {
      throw new PlatformError("resource_not_found", "Resource not found");
    }

    await recordActivityLog(this.db, {
      action: "platform.resource_inspected",
      actorUserId,
      message: "Resource inspected by platform admin",
      metadata: {
        inspected_id: result.id,
        inspected_resource_type: result.resource_type,
      },
      resourceId: result.id,
      resourceType: result.resource_type,
      workspaceId: result.workspace_id,
    });

    return result;
  }

  async listResources(
    actorUserId: string,
    query: PlatformResourceListQuery,
  ): Promise<PlatformResourceList> {
    await this.assertPlatformAdmin(actorUserId);
    const search = query.search;
    let items: PlatformResourceList["items"] = [];

    if (query.resource_type === "user") {
      const users = await this.db.user.findMany({
        ...(search ? { where: {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            ...(UuidPattern.test(search) ? [{ id: search }] : []),
          ],
        } } : {}),
        orderBy: { createdAt: "desc" },
        take: query.limit,
      });
      items = users.map((user) => ({
        created_at: user.createdAt.toISOString(),
        id: user.id,
        resource_type: "user",
        status: user.suspendedAt ? "suspended" : "active",
        subtitle: user.email,
        title: user.name,
        workspace_name: null,
      }));
    }

    if (query.resource_type === "workspace") {
      const workspaces = await this.db.workspace.findMany({
        ...(search ? { where: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            ...(UuidPattern.test(search) ? [{ id: search }] : []),
          ],
        } } : {}),
        orderBy: { createdAt: "desc" },
        take: query.limit,
      });
      items = workspaces.map((workspace) => ({
        created_at: workspace.createdAt.toISOString(),
        id: workspace.id,
        resource_type: "workspace",
        status: workspace.suspendedAt ? "suspended" : "active",
        subtitle: workspace.slug,
        title: workspace.name,
        workspace_name: workspace.name,
      }));
    }

    if (query.resource_type === "incident") {
      const incidents = await this.db.incident.findMany({
        ...(search ? { where: {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { source: { contains: search, mode: "insensitive" } },
            ...(UuidPattern.test(search) ? [{ id: search }] : []),
          ],
        } } : {}),
        include: { workspace: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: query.limit,
      });
      items = incidents.map((incident) => ({
        created_at: incident.createdAt.toISOString(),
        id: incident.id,
        resource_type: "incident",
        status: incident.status,
        subtitle: `${incident.priority} · ${incident.source}`,
        title: incident.title,
        workspace_name: incident.workspace.name,
      }));
    }

    if (query.resource_type === "notification") {
      const notifications = await this.db.notificationLog.findMany({
        ...(search ? { where: {
          OR: [
            { errorMessage: { contains: search, mode: "insensitive" } },
            { incident: { title: { contains: search, mode: "insensitive" } } },
            ...(UuidPattern.test(search) ? [{ id: search }] : []),
          ],
        } } : {}),
        include: {
          incident: {
            select: { title: true, workspace: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: query.limit,
      });
      items = notifications.map((notification) => ({
        created_at: notification.createdAt.toISOString(),
        id: notification.id,
        resource_type: "notification",
        status: notification.status,
        subtitle: `${notification.channel} · ${notification.incident.title}`,
        title: `${notification.channel} notification`,
        workspace_name: notification.incident.workspace.name,
      }));
    }

    if (query.resource_type === "worker_run") {
      const runs = await this.db.workerRunLog.findMany({
        ...(search ? { where: {
          OR: [
            { errorMessage: { contains: search, mode: "insensitive" } },
            { workerName: { contains: search, mode: "insensitive" } },
            ...(UuidPattern.test(search) ? [{ id: search }] : []),
          ],
        } } : {}),
        orderBy: { startedAt: "desc" },
        take: query.limit,
      });
      items = runs.map((run) => ({
        created_at: run.startedAt.toISOString(),
        id: run.id,
        resource_type: "worker_run",
        status: run.status,
        subtitle: `${run.processedCount} processed`,
        title: run.workerName,
        workspace_name: null,
      }));
    }

    await recordActivityLog(this.db, {
      action: "platform.resources_searched",
      actorUserId,
      message: "Resources searched by platform admin",
      metadata: {
        result_count: items.length,
        resource_type: query.resource_type,
        search: search ?? null,
      },
      resourceType: query.resource_type,
    });

    return { items };
  }

  async listUsers(actorUserId: string, query: PlatformListUsersQuery): Promise<PaginatedPlatformUsers> {
    await this.assertPlatformAdmin(actorUserId);
    const where: Prisma.UserWhereInput = {
      ...(query.status === "active" ? { suspendedAt: null } : {}),
      ...(query.status === "suspended" ? { suspendedAt: { not: null } } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.db.user.findMany({
      where,
      include: {
        _count: {
          select: {
            workspaceMemberships: true,
          },
        },
        platformAdminRoles: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map(mapPlatformUserSummary);

    return {
      items,
      next_cursor: rows.length > query.limit ? items.at(-1)?.id ?? null : null,
    };
  }

  async getUser(actorUserId: string, userId: string): Promise<PlatformUserDetail> {
    await this.assertPlatformAdmin(actorUserId);
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        _count: {
          select: {
            workspaceMemberships: true,
          },
        },
        notificationContacts: {
          orderBy: {
            type: "asc",
          },
        },
        notificationPreferences: {
          orderBy: {
            channel: "asc",
          },
        },
        authSessions: {
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        },
        identities: {
          orderBy: {
            provider: "asc",
          },
        },
        passwordCredential: {
          select: {
            userId: true,
          },
        },
        platformAdminRoles: true,
        workspaceMemberships: {
          include: {
            roles: {
              orderBy: {
                roleKey: "asc",
              },
            },
            workspace: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!user) {
      throw new PlatformError("user_not_found", "User not found");
    }

    const [recentActivity, ...securityActivityGroups] = await Promise.all([
      this.activityLogService.listActivityLogs({ actor_user_id: userId, limit: 25 }),
      ...[
        "auth.login_failed",
        "platform.user_suspended",
        "platform.user_restored",
        "platform.user_sessions_revoked",
        "platform.email_verification_email_sent",
        "platform.password_reset_email_sent",
      ].map((action) => this.activityLogService.listActivityLogs({
        action,
        limit: 25,
        resource_id: userId,
        resource_type: "user",
      })),
    ]);
    const securityTimeline = securityActivityGroups
      .flatMap((group) => group.items)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, 25);
    const now = new Date();
    const authMethods = [
      ...(user.passwordCredential ? ["password"] : []),
      ...user.identities.map((identity) => identity.provider),
    ];
    const activeSessions = user.authSessions.filter((session) => !session.revokedAt && session.expiresAt > now);

    return {
      ...mapPlatformUserSummary(user),
      active_session_count: activeSessions.length,
      auth_methods: [...new Set(authMethods)],
      last_login_at: user.authSessions[0]?.createdAt.toISOString() ?? null,
      notification_contacts: user.notificationContacts.map((contact) => ({
        address: contact.address,
        created_at: contact.createdAt.toISOString(),
        id: contact.id,
        type: contact.type,
        updated_at: contact.updatedAt.toISOString(),
        verified_at: contact.verifiedAt?.toISOString() ?? null,
      })),
      notification_preferences: user.notificationPreferences.map((preference) => ({
        channel: preference.channel,
        delay_seconds: preference.delaySeconds,
        enabled: preference.enabled,
      })),
      recent_activity: recentActivity.items,
      security_timeline: securityTimeline,
      sessions: user.authSessions.map((session) => ({
        created_at: session.createdAt.toISOString(),
        expires_at: session.expiresAt.toISOString(),
        id: session.id,
        ip_address: maskIpAddress(session.ipAddress),
        is_active: !session.revokedAt && session.expiresAt > now,
        user_agent: session.userAgent,
      })),
      workspace_memberships: user.workspaceMemberships.map((member) => ({
        created_at: member.createdAt.toISOString(),
        role: member.role as WorkspaceRole,
        roles: roleKeysForMember(member.roles),
        updated_at: member.updatedAt.toISOString(),
        workspace_id: member.workspace.id,
        workspace_name: member.workspace.name,
      })),
    };
  }

  async suspendUser(actorUserId: string, userId: string, reason: string): Promise<PlatformUserDetail> {
    await this.assertPlatformAdmin(actorUserId);

    if (actorUserId === userId) {
      throw new PlatformError("cannot_suspend_self", "Platform admins cannot suspend themselves");
    }

    const target = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        platformAdminRoles: {
          where: {
            role: "platform_admin",
          },
          select: {
            role: true,
          },
        },
      },
    });

    if (!target) {
      throw new PlatformError("user_not_found", "User not found");
    }

    if (target.platformAdminRoles.length > 0) {
      const activeAdminCount = await this.db.platformAdminRole.count({
        where: {
          role: "platform_admin",
          user: {
            suspendedAt: null,
          },
        },
      });

      if (activeAdminCount <= 1) {
        throw new PlatformError("cannot_suspend_last_platform_admin", "Cannot suspend the last active platform admin");
      }
    }

    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          suspendedAt: new Date(),
          suspendedByUserId: actorUserId,
          suspensionReason: reason,
        },
      });

      await tx.authSession.updateMany({
        where: {
          revokedAt: null,
          userId,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await recordActivityLog(tx, {
        action: "platform.user_suspended",
        actorUserId,
        message: "User suspended by platform admin",
        metadata: {
          reason,
        },
        resourceId: userId,
        resourceType: "user",
      });
    });

    return this.getUser(actorUserId, userId);
  }

  async restoreUser(actorUserId: string, userId: string, reason: string): Promise<PlatformUserDetail> {
    await this.assertPlatformAdmin(actorUserId);
    await this.ensureUserExists(userId);

    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          suspendedAt: null,
          suspendedByUserId: null,
          suspensionReason: null,
        },
      });

      await recordActivityLog(tx, {
        action: "platform.user_restored",
        actorUserId,
        message: "User restored by platform admin",
        metadata: {
          reason,
        },
        resourceId: userId,
        resourceType: "user",
      });
    });

    return this.getUser(actorUserId, userId);
  }

  async revokeUserSessions(actorUserId: string, userId: string, reason: string): Promise<PlatformUserDetail> {
    await this.assertPlatformAdmin(actorUserId);
    await this.ensureUserExists(userId);

    await this.db.$transaction(async (tx) => {
      const result = await tx.authSession.updateMany({
        where: {
          expiresAt: { gt: new Date() },
          revokedAt: null,
          userId,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await recordActivityLog(tx, {
        action: "platform.user_sessions_revoked",
        actorUserId,
        message: "User sessions revoked by platform admin",
        metadata: {
          reason,
          revoked_count: result.count,
        },
        resourceId: userId,
        resourceType: "user",
      });
    });

    return this.getUser(actorUserId, userId);
  }

  async listWorkspaces(
    actorUserId: string,
    query: PlatformListWorkspacesQuery,
  ): Promise<PaginatedPlatformWorkspaces> {
    await this.assertPlatformAdmin(actorUserId);
    const where: Prisma.WorkspaceWhereInput = {
      ...(query.status === "active" ? { suspendedAt: null } : {}),
      ...(query.status === "suspended" ? { suspendedAt: { not: null } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { slug: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.db.workspace.findMany({
      where,
      include: {
        _count: {
          select: {
            incidents: true,
            members: true,
            services: true,
          },
        },
        quotaSettings: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
    });
    const visibleRows = rows.slice(0, query.limit);
    const openIncidentCountByWorkspaceId = await this.getOpenIncidentCounts(visibleRows.map((workspace) => workspace.id));
    const items = visibleRows.map((workspace) =>
      mapPlatformWorkspaceSummary(workspace, openIncidentCountByWorkspaceId.get(workspace.id) ?? 0),
    );

    return {
      items,
      next_cursor: rows.length > query.limit ? items.at(-1)?.id ?? null : null,
    };
  }

  async getWorkspace(actorUserId: string, workspaceId: string): Promise<PlatformWorkspaceDetail> {
    await this.assertPlatformAdmin(actorUserId);
    const workspace = await this.db.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      include: {
        _count: {
          select: {
            incidents: true,
            members: true,
            services: true,
          },
        },
        quotaSettings: true,
        invites: {
          include: {
            roles: {
              orderBy: {
                roleKey: "asc",
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        members: {
          include: {
            roles: {
              orderBy: {
                roleKey: "asc",
              },
            },
            user: {
              select: {
                email: true,
                id: true,
                name: true,
                suspendedAt: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        notificationProviderSettings: {
          orderBy: {
            provider: "asc",
          },
        },
      },
    });

    if (!workspace) {
      throw new PlatformError("workspace_not_found", "Workspace not found");
    }

    const [
      usage,
      recentActivity,
      escalationPolicies,
      onCallSchedules,
      openIncidents,
      workflows,
      timelineIncidents,
      timelineNotifications,
      timelineWebhooks,
      timelineWorkerRuns,
    ] = await Promise.all([
      this.quotaService.getWorkspaceUsage(workspaceId),
      this.activityLogService.listActivityLogs({ limit: 25, workspace_id: workspaceId }),
      this.db.escalationPolicy.count({ where: { workspaceId } }),
      this.db.onCallSchedule.count({ where: { workspaceId } }),
      this.db.incident.count({ where: { status: { in: ["triggered", "acknowledged"] }, workspaceId } }),
      this.db.workflow.count({ where: { workspaceId } }),
      this.db.incident.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 15 }),
      this.db.notificationLog.findMany({
        where: { incident: { workspaceId } },
        include: { incident: { select: { title: true } } },
        orderBy: { updatedAt: "desc" },
        take: 15,
      }),
      this.db.activityLog.findMany({
        where: {
          action: { in: ["webhook.ingestion_failed", "webhook.ingestion_succeeded"] },
          workspaceId,
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      this.db.workflowRun.findMany({
        where: { workspaceId },
        include: { workflow: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 15,
      }),
    ]);
    const operationalTimeline: PlatformWorkspaceDetail["operational_timeline"] = [
      ...timelineIncidents.map((incident) => ({
        detail: incident.description,
        id: incident.id,
        kind: "incident" as const,
        occurred_at: incident.updatedAt.toISOString(),
        related_id: incident.id,
        status: incident.status,
        title: incident.title,
      })),
      ...timelineNotifications.map((notification) => ({
        detail: notification.errorMessage,
        id: notification.id,
        kind: "notification" as const,
        occurred_at: notification.updatedAt.toISOString(),
        related_id: notification.incidentId,
        status: notification.status,
        title: `${notification.channel} · ${notification.incident.title}`,
      })),
      ...timelineWebhooks.map((event) => ({
        detail: getMetadataString(event.metadata, "error_code") ?? getMetadataString(event.metadata, "action"),
        id: event.id,
        kind: "webhook" as const,
        occurred_at: event.createdAt.toISOString(),
        related_id: getMetadataUuid(event.metadata, "incident_id"),
        status: event.action.endsWith("succeeded") ? "succeeded" : "failed",
        title: getMetadataString(event.metadata, "endpoint_name") ?? "Webhook ingestion",
      })),
      ...timelineWorkerRuns.map((run) => ({
        detail: run.errorMessage,
        id: run.id,
        kind: "worker" as const,
        occurred_at: run.updatedAt.toISOString(),
        related_id: run.workflowId,
        status: run.status,
        title: run.workflow.name,
      })),
    ].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)).slice(0, 30);

    return {
      ...mapPlatformWorkspaceSummary(workspace, openIncidents),
      invites: workspace.invites.map((invite) => ({
        created_at: invite.createdAt.toISOString(),
        expires_at: invite.expiresAt.toISOString(),
        id: invite.id,
        invited_by_user_id: invite.invitedByUserId,
        invited_user_email: invite.invitedEmail,
        invited_user_id: invite.invitedUserId,
        role: invite.role as WorkspaceRole,
        roles: roleKeysForMember(invite.roles),
        status: invite.status,
        updated_at: invite.updatedAt.toISOString(),
      })),
      members: workspace.members.map((member) => ({
        created_at: member.createdAt.toISOString(),
        email: member.user.email,
        name: member.user.name,
        role: member.role as WorkspaceRole,
        roles: roleKeysForMember(member.roles),
        suspended_at: member.user.suspendedAt?.toISOString() ?? null,
        updated_at: member.updatedAt.toISOString(),
        user_id: member.user.id,
      })),
      notification_provider_settings: workspace.notificationProviderSettings.map((setting) => ({
        config: redactSecretConfig(setting.config),
        created_at: setting.createdAt.toISOString(),
        enabled: setting.enabled,
        provider: setting.provider,
        updated_at: setting.updatedAt.toISOString(),
      })),
      operational_timeline: operationalTimeline,
      quota_health: ["members", "services", "on_call_schedules", "escalation_policies"].map((resource) => {
        const key = resource as WorkspaceQuotaResource;
        const current = usage.usage[key];
        const limit = usage.limits[key];
        const remaining = limit === null ? null : Math.max(0, limit - current);
        const state = limit === null
          ? "unlimited" as const
          : current > limit
            ? "exceeded" as const
            : current >= Math.ceil(limit * 0.8)
              ? "near_limit" as const
              : "healthy" as const;

        return { current, limit, remaining, resource, state };
      }),
      recent_activity: recentActivity.items,
      resource_counts: {
        escalation_policies: escalationPolicies,
        incidents: workspace._count.incidents,
        on_call_schedules: onCallSchedules,
        services: workspace._count.services,
        workflows,
      },
      usage,
    };
  }

  async updateWorkspaceQuotaOverride(
    actorUserId: string,
    workspaceId: string,
    input: { expiresAt: string | null; limit: number | null; reason: string; resource: WorkspaceQuotaResource },
  ): Promise<PlatformWorkspaceDetail> {
    await this.assertPlatformAdmin(actorUserId);
    await this.ensureWorkspaceExists(workspaceId);
    const existing = await this.db.workspaceQuotaSettings.findUnique({ where: { workspaceId } });
    const overrides = normalizeQuotaOverrides(existing?.quotaOverrides);

    if (input.limit === null) {
      delete overrides[input.resource];
    } else {
      const expiresAt = new Date(input.expiresAt ?? "");

      if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
        throw new PlatformError("invalid_quota_override", "Quota override expiration must be in the future");
      }

      overrides[input.resource] = { expires_at: expiresAt.toISOString(), limit: input.limit };
    }

    await this.db.$transaction(async (tx) => {
      await tx.workspaceQuotaSettings.upsert({
        where: { workspaceId },
        create: {
          quotaOverrides: overrides,
          updatedByUserId: actorUserId,
          workspaceId,
        },
        update: {
          quotaOverrides: overrides,
          updatedByUserId: actorUserId,
        },
      });
      await recordActivityLog(tx, {
        action: input.limit === null ? "platform.workspace_quota_override_removed" : "platform.workspace_quota_override_updated",
        actorUserId,
        message: input.limit === null ? "Workspace quota override removed" : "Workspace quota override updated",
        metadata: {
          expires_at: input.expiresAt,
          limit: input.limit,
          reason: input.reason,
          resource: input.resource,
        },
        resourceId: workspaceId,
        resourceType: "workspace",
        workspaceId,
      });
    });

    return this.getWorkspace(actorUserId, workspaceId);
  }

  async suspendWorkspace(
    actorUserId: string,
    workspaceId: string,
    reason: string,
  ): Promise<PlatformWorkspaceDetail> {
    await this.assertPlatformAdmin(actorUserId);
    await this.ensureWorkspaceExists(workspaceId);

    await this.db.$transaction(async (tx) => {
      await tx.workspace.update({
        where: {
          id: workspaceId,
        },
        data: {
          suspendedAt: new Date(),
          suspendedByUserId: actorUserId,
          suspensionReason: reason,
        },
      });

      await recordActivityLog(tx, {
        action: "platform.workspace_suspended",
        actorUserId,
        message: "Workspace suspended by platform admin",
        metadata: {
          reason,
        },
        resourceId: workspaceId,
        resourceType: "workspace",
        workspaceId,
      });
    });

    return this.getWorkspace(actorUserId, workspaceId);
  }

  async restoreWorkspace(
    actorUserId: string,
    workspaceId: string,
    reason: string,
  ): Promise<PlatformWorkspaceDetail> {
    await this.assertPlatformAdmin(actorUserId);
    await this.ensureWorkspaceExists(workspaceId);

    await this.db.$transaction(async (tx) => {
      await tx.workspace.update({
        where: {
          id: workspaceId,
        },
        data: {
          suspendedAt: null,
          suspendedByUserId: null,
          suspensionReason: null,
        },
      });

      await recordActivityLog(tx, {
        action: "platform.workspace_restored",
        actorUserId,
        message: "Workspace restored by platform admin",
        metadata: {
          reason,
        },
        resourceId: workspaceId,
        resourceType: "workspace",
        workspaceId,
      });
    });

    return this.getWorkspace(actorUserId, workspaceId);
  }

  async updateWorkspaceMemberRoles(
    actorUserId: string,
    workspaceId: string,
    userId: string,
    roles: WorkspaceRoleKey[],
    reason: string,
  ): Promise<PlatformWorkspaceDetail> {
    await this.assertPlatformAdmin(actorUserId);
    await this.workspaceService.updateMemberRoles(workspaceId, userId, { roles }, actorUserId);
    await recordActivityLog(this.db, {
      action: "platform.workspace_member_roles_updated",
      actorUserId,
      message: "Workspace member roles changed by platform admin",
      metadata: {
        reason,
        roles,
        user_id: userId,
      },
      resourceId: workspaceId,
      resourceType: "workspace",
      workspaceId,
    });

    return this.getWorkspace(actorUserId, workspaceId);
  }

  private async ensureUserExists(userId: string) {
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new PlatformError("user_not_found", "User not found");
    }
  }

  private async ensureWorkspaceExists(workspaceId: string) {
    const workspace = await this.db.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
      },
    });

    if (!workspace) {
      throw new PlatformError("workspace_not_found", "Workspace not found");
    }
  }

  private async getOpenIncidentCounts(workspaceIds: string[]): Promise<Map<string, number>> {
    if (workspaceIds.length === 0) {
      return new Map();
    }

    const rows = await this.db.incident.groupBy({
      by: ["workspaceId"],
      where: {
        status: {
          in: ["triggered", "acknowledged"],
        },
        workspaceId: {
          in: workspaceIds,
        },
      },
      _count: {
        _all: true,
      },
    });

    return new Map(rows.map((row) => [row.workspaceId, row._count._all]));
  }
}

export async function isPlatformAdmin(db: PrismaClient, userId: string): Promise<boolean> {
  const admin = await db.platformAdminRole.findFirst({
    where: {
      role: "platform_admin",
      userId,
      user: {
        suspendedAt: null,
      },
    },
    select: {
      userId: true,
    },
  });

  return Boolean(admin);
}

export function platformAdminWorkspaceRoleKeys(): WorkspaceRoleKey[] {
  return [...workspaceRoleKeys];
}

function mapPlatformUserSummary(user: PlatformUserRecord): PlatformUserSummary {
  const platformRoles = user.platformAdminRoles.map((role) => role.role as "platform_admin");

  return {
    created_at: user.createdAt.toISOString(),
    email: user.email,
    email_verified: Boolean(user.emailVerifiedAt),
    id: user.id,
    name: user.name,
    platform_roles: platformRoles,
    suspended_at: user.suspendedAt?.toISOString() ?? null,
    suspended_by_user_id: user.suspendedByUserId,
    suspension_reason: user.suspensionReason,
    updated_at: user.updatedAt.toISOString(),
    workspace_count: user._count.workspaceMemberships,
  };
}

function mapPlatformWorkspaceSummary(
  workspace: PlatformWorkspaceRecord,
  openIncidentCount = 0,
): PlatformWorkspaceSummary {
  return {
    created_at: workspace.createdAt.toISOString(),
    created_by_user_id: workspace.createdByUserId,
    id: workspace.id,
    member_count: workspace._count.members,
    name: workspace.name,
    open_incident_count: openIncidentCount,
    service_count: workspace._count.services,
    slug: workspace.slug,
    suspended_at: workspace.suspendedAt?.toISOString() ?? null,
    suspended_by_user_id: workspace.suspendedByUserId,
    suspension_reason: workspace.suspensionReason,
    updated_at: workspace.updatedAt.toISOString(),
  };
}

function roleKeysForMember(roles: Array<{ roleKey: string }>): WorkspaceRoleKey[] {
  return roles
    .map((role) => role.roleKey)
    .filter((roleKey): roleKey is WorkspaceRoleKey => workspaceRoleKeys.includes(roleKey as WorkspaceRoleKey));
}

function redactSecretConfig(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecretConfig);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSecretConfigKey(key) ? "[redacted]" : redactSecretConfig(entry),
    ]),
  );
}

function isSecretConfigKey(key: string) {
  const normalized = key.toLowerCase();
  return normalized.includes("password")
    || normalized.includes("secret")
    || normalized.includes("token");
}

function maskIpAddress(value: string | null) {
  if (!value) {
    return null;
  }

  const ipv4Parts = value.split(".");

  if (ipv4Parts.length === 4) {
    return `${ipv4Parts[0]}.${ipv4Parts[1]}.x.x`;
  }

  const ipv6Parts = value.split(":");
  return ipv6Parts.length > 2 ? `${ipv6Parts.slice(0, 2).join(":")}:…` : "[masked]";
}

function getMetadataString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.length > 0 ? entry : null;
}

function getMetadataUuid(value: unknown, key: string) {
  const entry = getMetadataString(value, key);
  return entry && UuidPattern.test(entry) ? entry : null;
}

const UuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function maskInspectorTarget(value: string) {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      return `${new URL(value).origin}/***`;
    } catch {
      return "***";
    }
  }

  const [localPart, domain] = value.split("@");
  return localPart && domain ? `${localPart.slice(0, 2)}***@${domain}` : "***";
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function buildNotificationTrend(
  notifications: Array<{ createdAt: Date; sentAt: Date | null; status: string; updatedAt: Date }>,
  now: Date,
): PlatformOverview["notification_trend"] {
  const hourMs = 60 * 60 * 1000;
  const currentBucketMs = Math.floor(now.getTime() / hourMs) * hourMs;

  return Array.from({ length: 24 }, (_, index) => {
    const bucketMs = currentBucketMs - (23 - index) * hourMs;
    const bucketEndMs = bucketMs + hourMs;
    const bucketNotifications = notifications.filter((notification) => {
      const occurredAt = notification.updatedAt.getTime();
      return occurredAt >= bucketMs && occurredAt < bucketEndMs;
    });
    const sent = bucketNotifications.filter((notification) =>
      notification.status === "sent" || notification.status === "sent_after_ack");
    const latencies = sent
      .filter((notification) => notification.sentAt)
      .map((notification) => notification.sentAt!.getTime() - notification.createdAt.getTime());

    return {
      average_latency_ms: average(latencies),
      bucket: new Date(bucketMs).toISOString(),
      failed: bucketNotifications.filter((notification) => notification.status === "failed").length,
      sent: sent.length,
    };
  });
}

function normalizeQuotaOverrides(value: unknown): Record<string, { expires_at: string; limit: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).flatMap(([resource, entry]) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    return typeof record.expires_at === "string" && Number.isInteger(record.limit)
      ? [[resource, { expires_at: record.expires_at, limit: Number(record.limit) }]]
      : [];
  }));
}
