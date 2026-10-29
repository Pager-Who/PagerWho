import {
  DEFAULT_INSTALLATION_LIMITS,
  type InstallationLimits,
  type WorkspaceQuotaResource,
  type WorkspaceUsage,
  type WorkspaceUsageCounts,
} from "@im/contracts";
import type { Prisma, PrismaClient } from "@im/db";

import { recordActivityLog } from "../activity";

const quotaResources = [
  "workspaces",
  "members",
  "services",
  "on_call_schedules",
  "escalation_policies",
] as const satisfies readonly WorkspaceQuotaResource[];

export type QuotaCheckInput = {
  actorUserId?: string | null;
  resource: WorkspaceQuotaResource;
  workspaceId?: string;
};

export class QuotaError extends Error {
  readonly code = "quota_exceeded";

  constructor(
    public readonly details: {
      current: number;
      limit: number;
      resource: WorkspaceQuotaResource;
    },
  ) {
    super(quotaMessage(details.resource, details.limit));
    this.name = "QuotaError";
  }
}

export class QuotaService {
  private readonly limits: InstallationLimits;

  constructor(private readonly db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
    this.limits = readInstallationLimits(env);
  }

  async getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
    const [quotaSettings, usage] = await Promise.all([
      this.getWorkspaceQuotaSettings(workspaceId),
      this.getWorkspaceUsageCounts(workspaceId),
    ]);
    const limits = applyQuotaOverrides(this.limits, quotaSettings.quota_overrides);

    return {
      quota_settings: quotaSettings,
      exceeded: exceededForUsage(usage, limits),
      limits,
      usage,
      workspace_id: workspaceId,
    };
  }

  async assertCanCreateWorkspace(actorUserId: string): Promise<void> {
    const limit = this.limits.workspaces;

    if (limit === null) {
      return;
    }

    const current = await this.db.workspaceMember.count({
      where: {
        userId: actorUserId,
        role: "owner",
      },
    });

    if (current >= limit) {
      throw new QuotaError({
        current,
        limit,
        resource: "workspaces",
      });
    }
  }

  async assertCanCreateWorkspaceResource(input: QuotaCheckInput): Promise<void> {
    if (!input.workspaceId) {
      return;
    }

    const usage = await this.getWorkspaceUsage(input.workspaceId);
    const limit = usage.limits[input.resource];

    if (limit !== null && usage.usage[input.resource] >= limit) {
      throw new QuotaError({
        current: usage.usage[input.resource],
        limit,
        resource: input.resource,
      });
    }
  }

  async runRetention(now = new Date()): Promise<RetentionSummary> {
    const workspaces = await this.db.workspace.findMany({
      select: {
        id: true,
      },
    });
    const summary: RetentionSummary = {
      activity_logs: 0,
      incidents: 0,
      notification_logs: 0,
      processed_workspaces: 0,
      workflow_events: 0,
      workflow_runs: 0,
    };

    for (const workspace of workspaces) {
      const result = await this.runWorkspaceRetention(workspace.id, now);
      summary.activity_logs += result.activity_logs;
      summary.incidents += result.incidents;
      summary.notification_logs += result.notification_logs;
      summary.processed_workspaces += 1;
      summary.workflow_events += result.workflow_events;
      summary.workflow_runs += result.workflow_runs;
    }

    return summary;
  }

  private async runWorkspaceRetention(workspaceId: string, now: Date): Promise<Omit<RetentionSummary, "processed_workspaces">> {
    const cutoff = new Date(now.getTime() - this.limits.retention_days * 24 * 60 * 60 * 1000);

    return this.db.$transaction(async (tx) => {
      const notificationLogs = await tx.notificationLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoff,
          },
          incident: {
            workspaceId,
          },
        },
      });
      const workflowRuns = await tx.workflowRun.deleteMany({
        where: {
          createdAt: {
            lt: cutoff,
          },
          workspaceId,
        },
      });
      const workflowEvents = await tx.workflowEvent.deleteMany({
        where: {
          occurredAt: {
            lt: cutoff,
          },
          processedAt: {
            not: null,
          },
          workspaceId,
        },
      });
      const incidents = await tx.incident.deleteMany({
        where: {
          resolvedAt: {
            lt: cutoff,
          },
          status: "resolved",
          workspaceId,
        },
      });
      const activityLogs = await tx.activityLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoff,
          },
          workspaceId,
        },
      });

      const totalDeleted = notificationLogs.count
        + workflowRuns.count
        + workflowEvents.count
        + incidents.count
        + activityLogs.count;

      if (totalDeleted > 0) {
        await recordActivityLog(tx, {
          workspaceId,
          resourceType: "workspace",
          resourceId: workspaceId,
          action: "workspace.retention_executed",
          message: `Retention cleanup deleted ${totalDeleted} records`,
          metadata: {
            cutoff: cutoff.toISOString(),
            deleted: {
              activity_logs: activityLogs.count,
              incidents: incidents.count,
              notification_logs: notificationLogs.count,
              workflow_events: workflowEvents.count,
              workflow_runs: workflowRuns.count,
            },
          },
        });
      }

      return {
        activity_logs: activityLogs.count,
        incidents: incidents.count,
        notification_logs: notificationLogs.count,
        workflow_events: workflowEvents.count,
        workflow_runs: workflowRuns.count,
      };
    });
  }

  private async getWorkspaceQuotaSettings(workspaceId: string): Promise<WorkspaceUsage["quota_settings"]> {
    const quotaSettings = await this.db.workspaceQuotaSettings.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!quotaSettings) {
      return {
        updated_at: null,
        updated_by_user_id: null,
        quota_overrides: [],
      };
    }

    return {
      updated_at: quotaSettings.updatedAt.toISOString(),
      updated_by_user_id: quotaSettings.updatedByUserId,
      quota_overrides: parseQuotaOverrides(quotaSettings.quotaOverrides),
    };
  }

  private async getWorkspaceUsageCounts(workspaceId: string): Promise<WorkspaceUsageCounts> {
    const [activeMembers, pendingInvites, services, schedules, policies] = await Promise.all([
      this.db.workspaceMember.count({
        where: {
          workspaceId,
        },
      }),
      this.db.workspaceInvite.count({
        where: {
          status: "pending",
          workspaceId,
        },
      }),
      this.db.service.count({
        where: {
          workspaceId,
        },
      }),
      this.db.onCallSchedule.count({
        where: {
          workspaceId,
        },
      }),
      this.db.escalationPolicy.count({
        where: {
          workspaceId,
        },
      }),
    ]);

    return {
      active_members: activeMembers,
      escalation_policies: policies,
      members: activeMembers + pendingInvites,
      on_call_schedules: schedules,
      pending_invites: pendingInvites,
      services,
      workspaces: 1,
    };
  }
}

export type RetentionSummary = {
  activity_logs: number;
  incidents: number;
  notification_logs: number;
  processed_workspaces: number;
  workflow_events: number;
  workflow_runs: number;
};

export function quotaErrorDetails(error: QuotaError): Prisma.InputJsonObject {
  return {
    current: error.details.current,
    limit: error.details.limit,
    resource: error.details.resource,
  };
}

function exceededForUsage(
  usage: WorkspaceUsageCounts,
  limits: InstallationLimits,
): Record<WorkspaceQuotaResource, boolean> {
  return Object.fromEntries(quotaResources.map((resource) => {
    const limit = limits[resource];
    return [resource, limit !== null && usage[resource] > limit];
  })) as Record<WorkspaceQuotaResource, boolean>;
}

function quotaMessage(resource: WorkspaceQuotaResource, limit: number) {
  return `Installation limit allows up to ${limit} ${resourceLabel(resource)}.`;
}

function resourceLabel(resource: WorkspaceQuotaResource) {
  switch (resource) {
    case "escalation_policies":
      return "escalation policies";
    case "members":
      return "members and pending invites";
    case "on_call_schedules":
      return "on-call schedules";
    case "services":
      return "services";
    case "workspaces":
      return "projects";
  }
}

function parseQuotaOverrides(value: unknown): WorkspaceUsage["quota_settings"]["quota_overrides"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const now = Date.now();
  return Object.entries(value).flatMap(([resource, entry]) => {
    if (resource === "workspaces" || !quotaResources.includes(resource as WorkspaceQuotaResource)
      || !entry
      || typeof entry !== "object"
      || Array.isArray(entry)) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const limit = record.limit;
    const expiresAt = record.expires_at;

    if (!Number.isInteger(limit) || Number(limit) <= 0 || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now) {
      return [];
    }

    return [{
      expires_at: new Date(expiresAt).toISOString(),
      limit: Number(limit),
      resource: resource as WorkspaceQuotaResource,
    }];
  });
}

function applyQuotaOverrides(
  baseLimits: InstallationLimits,
  overrides: WorkspaceUsage["quota_settings"]["quota_overrides"],
): InstallationLimits {
  const limits: InstallationLimits = { ...baseLimits };

  for (const override of overrides) {
    limits[override.resource] = override.limit;
  }

  return limits;
}

export function readInstallationLimits(env: NodeJS.ProcessEnv): InstallationLimits {
  const limits: InstallationLimits = { ...DEFAULT_INSTALLATION_LIMITS };
  for (const resource of quotaResources) {
    const key = `PAGERWHO_LIMIT_${resource.toUpperCase()}`;
    const raw = env[key];
    if (raw === undefined) continue;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative safe integer (0 means unlimited)`);
    }
    limits[resource] = value === 0 ? null : value;
  }
  const raw = env.PAGERWHO_RETENTION_DAYS;
  if (raw !== undefined) {
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0 || value > 36500) {
      throw new Error("PAGERWHO_RETENTION_DAYS must be an integer between 1 and 36500");
    }
    limits.retention_days = value;
  }
  return limits;
}
