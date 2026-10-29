import type { ActivityLog, ActivityLogQuery, PaginatedResponse } from "@im/contracts";
import { Prisma, type PrismaClient, type TransactionClient } from "@im/db";

import { getActivityOrigin } from "./activity-origin-context";

type ActivityLogRecord = {
  id: string;
  workspaceId: string | null;
  resourceType: string;
  resourceId: string | null;
  action: string;
  message: string;
  actorUserId: string | null;
  metadata: unknown;
  createdAt: Date;
};

type RecordActivityLogInput = {
  action: string;
  actorUserId?: string | null;
  message: string;
  metadata?: unknown;
  origin?: string;
  resourceId?: string | null;
  resourceType: ActivityLog["resource_type"];
  workspaceId?: string | null;
};

type ActivityLogScopeOptions = {
  workspaceIds?: string[];
};

export class ActivityLogService {
  constructor(private readonly db: PrismaClient) {}

  async listActivityLogs(
    query: ActivityLogQuery,
    options: ActivityLogScopeOptions = {},
  ): Promise<PaginatedResponse<ActivityLog>> {
    const limit = query.limit;
    const searchFilters = query.search ? createSearchFilters(query.search) : [];
    const rows = await this.db.activityLog.findMany({
      where: {
        ...(query.workspace_id
          ? { workspaceId: query.workspace_id }
          : options.workspaceIds
            ? { workspaceId: { in: options.workspaceIds } }
            : {}),
        ...(query.resource_type ? { resourceType: query.resource_type } : {}),
        ...(query.resource_id ? { resourceId: query.resource_id } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.actor_user_id ? { actorUserId: query.actor_user_id } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(searchFilters.length > 0 ? { OR: searchFilters } : {}),
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
      items: items.map(mapActivityLog),
      next_cursor: next,
    };
  }
}

function createSearchFilters(search: string): Prisma.ActivityLogWhereInput[] {
  const filters: Prisma.ActivityLogWhereInput[] = [
    { action: { contains: search, mode: "insensitive" } },
    { message: { contains: search, mode: "insensitive" } },
  ];

  if (UuidSearchPattern.test(search)) {
    filters.push({ resourceId: { equals: search } });
  }

  return filters;
}

const UuidSearchPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function recordActivityLog(
  db: PrismaClient | TransactionClient,
  input: RecordActivityLogInput,
): Promise<ActivityLog> {
  const metadata = sanitizeActivityMetadata(input.metadata);
  const record = await db.activityLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      message: input.message,
      metadata,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType,
      workspaceId: input.workspaceId ?? null,
    },
  });

  if (record.workspaceId) {
    await db.workflowEvent.create({
      data: {
        activityLogId: record.id,
        action: record.action,
        actorUserId: record.actorUserId,
        metadata,
        origin: input.origin ?? getActivityOrigin(),
        occurredAt: record.createdAt,
        resourceId: record.resourceId,
        resourceType: record.resourceType,
        workspaceId: record.workspaceId,
      },
    });
  }

  return mapActivityLog(record);
}

function mapActivityLog(log: ActivityLogRecord): ActivityLog {
  return {
    id: log.id,
    workspace_id: log.workspaceId,
    resource_type: log.resourceType as ActivityLog["resource_type"],
    resource_id: log.resourceId,
    action: log.action,
    message: log.message,
    actor_user_id: log.actorUserId,
    metadata: log.metadata ?? null,
    created_at: log.createdAt.toISOString(),
  };
}

function sanitizeActivityMetadata(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }

  return sanitizeJsonValue(value);
}

function sanitizeJsonValue(value: unknown): Prisma.InputJsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item)) as Prisma.InputJsonArray;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null || typeof value !== "object") {
    return maskSensitiveString(value);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? "[redacted]" : sanitizeJsonValue(entry),
    ]),
  ) as Prisma.InputJsonObject;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.includes("secret")
    || normalized.includes("token")
    || normalized.includes("password")
    || normalized.includes("authorization")
    || normalized === "url_with_secret";
}

function maskSensitiveString(value: unknown): Prisma.InputJsonValue {
  if (typeof value !== "string") {
    if (value === null) {
      return null as unknown as Prisma.InputJsonValue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    return String(value);
  }

  if (value.startsWith("https://hooks.slack.com/services/")) {
    return "https://hooks.slack.com/***";
  }

  return value;
}
