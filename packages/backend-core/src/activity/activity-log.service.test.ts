import type { PrismaClient } from "@im/db";
import { describe, expect, it, vi } from "vitest";

import { ActivityLogService } from "./activity-log.service";

describe("ActivityLogService", () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const actorUserId = "22222222-2222-4222-8222-222222222222";

  it("builds actor, resource, date, and text search filters", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ActivityLogService(createDb(findMany));

    await service.listActivityLogs({
      action: "service.updated",
      actor_user_id: actorUserId,
      from: "2026-01-01T00:00:00.000Z",
      limit: 25,
      resource_type: "service",
      search: "updated",
      to: "2026-01-02T00:00:00.000Z",
      workspace_id: workspaceId,
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        action: "service.updated",
        actorUserId,
        createdAt: {
          gte: new Date("2026-01-01T00:00:00.000Z"),
          lte: new Date("2026-01-02T00:00:00.000Z"),
        },
        resourceType: "service",
        workspaceId,
        OR: [
          { action: { contains: "updated", mode: "insensitive" } },
          { message: { contains: "updated", mode: "insensitive" } },
        ],
      }),
    }));
  });

  it("adds resource id search only when the search value is a UUID", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ActivityLogService(createDb(findMany));

    await service.listActivityLogs({
      limit: 25,
      search: "33333333-3333-4333-8333-333333333333",
      workspace_id: workspaceId,
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { resourceId: { equals: "33333333-3333-4333-8333-333333333333" } },
        ]),
      }),
    }));
  });
});

function createDb(findMany: ReturnType<typeof vi.fn>) {
  return {
    activityLog: {
      findMany,
    },
  } as unknown as PrismaClient;
}
