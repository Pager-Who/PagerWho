import type { RequestHandler } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAuditLogsHandler } from "./audit-logs.handler";
import { errorMiddleware } from "../middleware/error.middleware";

const mocks = vi.hoisted(() => {
  class WorkspaceError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "WorkspaceError";
    }
  }

  return {
    activityLogService: {
      listActivityLogs: vi.fn(),
    },
    prisma: {},
    quotaService: {
      getWorkspaceUsage: vi.fn(),
    },
    workspaceService: {
      assertWorkspacePermission: vi.fn(),
    },
    WorkspaceError,
  };
});

vi.mock("@im/backend-core", () => ({
  ActivityLogService: vi.fn(() => mocks.activityLogService),
  QuotaService: vi.fn(() => mocks.quotaService),
  WorkspaceError: mocks.WorkspaceError,
  WorkspaceService: vi.fn(() => mocks.workspaceService),
}));

vi.mock("@im/db", () => ({
  prisma: mocks.prisma,
}));

describe("audit log handlers", () => {
  const actorUserId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  const logId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceService.assertWorkspacePermission.mockResolvedValue(["project_admin"]);
    mocks.activityLogService.listActivityLogs.mockResolvedValue({
      items: [
        {
          id: logId,
          workspace_id: workspaceId,
          resource_type: "service",
          resource_id: "44444444-4444-4444-8444-444444444444",
          action: "service.updated",
          message: "Service updated",
          actor_user_id: actorUserId,
          metadata: { name: "API" },
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      next_cursor: null,
    });
  });

  it("requires an actor header", async () => {
    const response = await invokeHandler(listAuditLogsHandler, {
      query: {
        workspace_id: workspaceId,
      },
    });

    expect(response.status).toBe(401);
    expect(mocks.activityLogService.listActivityLogs).not.toHaveBeenCalled();
  });

  it("requires workspace_id", async () => {
    const response = await invokeHandler(listAuditLogsHandler, {
      actorUserId,
      query: {
        limit: "10",
      },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "invalid_audit_log_filter",
      },
    });
    expect(mocks.workspaceService.assertWorkspacePermission).not.toHaveBeenCalled();
  });

  it("requires project management permission for the workspace", async () => {
    mocks.workspaceService.assertWorkspacePermission.mockRejectedValueOnce(
      new mocks.WorkspaceError("workspace_permission_required", "Workspace permission required"),
    );

    const response = await invokeHandler(listAuditLogsHandler, {
      actorUserId,
      query: {
        workspace_id: workspaceId,
      },
    });

    expect(response.status).toBe(403);
    expect(mocks.workspaceService.assertWorkspacePermission).toHaveBeenCalledWith(workspaceId, actorUserId, "project.manage");
    expect(mocks.activityLogService.listActivityLogs).not.toHaveBeenCalled();
  });

  it("lists audit logs with supported filters", async () => {
    const response = await invokeHandler(listAuditLogsHandler, {
      actorUserId,
      query: {
        action: "service.updated",
        actor_user_id: actorUserId,
        from: "2026-01-01T00:00:00.000Z",
        limit: "10",
        resource_type: "service",
        search: "Service",
        to: "2026-01-02T00:00:00.000Z",
        workspace_id: workspaceId,
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.workspaceService.assertWorkspacePermission).toHaveBeenCalledWith(workspaceId, actorUserId, "project.manage");
    expect(mocks.activityLogService.listActivityLogs).toHaveBeenCalledWith({
      action: "service.updated",
      actor_user_id: actorUserId,
      from: "2026-01-01T00:00:00.000Z",
      limit: 10,
      resource_type: "service",
      search: "Service",
      to: "2026-01-02T00:00:00.000Z",
      workspace_id: workspaceId,
    });
    expect(response.body).toMatchObject({
      data: {
        items: [
          {
            id: logId,
            action: "service.updated",
          },
        ],
      },
    });
  });
});

async function invokeHandler(
  handler: RequestHandler,
  input: {
    actorUserId?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
): Promise<{
  body: unknown;
  status: number;
}> {
  const req = {
    actorUserId: input.actorUserId,
    authSource: input.actorUserId ? "session" : undefined,
    body: {},
    header(name: string) {
      return input.headers?.[name.toLowerCase()];
    },
    params: {},
    query: input.query ?? {},
  };
  const res = createResponse();
  const next = vi.fn((error?: unknown) => {
    if (error) {
      errorMiddleware(error, req as never, res as never, vi.fn());
    }
  });

  await handler(req as never, res as never, next);

  return {
    body: res.body,
    status: res.statusCode,
  };
}

function createResponse() {
  return {
    body: null as unknown,
    locals: {
      requestId: "test-request-id",
    },
    statusCode: 200,
    json(body: unknown) {
      this.body = body;
      return this;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
  };
}
