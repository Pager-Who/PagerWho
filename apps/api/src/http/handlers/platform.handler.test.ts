import type { RequestHandler } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPlatformOverviewHandler,
  getPlatformDiagnosticsHandler,
  getPlatformInspectorHandler,
  listPlatformUsersHandler,
  listPlatformResourcesHandler,
  revokePlatformUserSessionsHandler,
  retryPlatformNotificationHandler,
  updateWorkspaceQuotaOverrideHandler,
} from "./platform.handler";
import { errorMiddleware } from "../middleware/error.middleware";

const mocks = vi.hoisted(() => ({
  PlatformError: class PlatformError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "PlatformError";
    }
  },
  platformService: {
    getOverview: vi.fn(),
    getDiagnostics: vi.fn(),
    inspectResource: vi.fn(),
    listUsers: vi.fn(),
    listResources: vi.fn(),
    revokeUserSessions: vi.fn(),
    retryNotification: vi.fn(),
    updateWorkspaceQuotaOverride: vi.fn(),
  },
}));

vi.mock("@im/backend-core", () => ({
  QuotaService: vi.fn(() => ({})),
  PlatformError: mocks.PlatformError,
  PlatformService: vi.fn(() => mocks.platformService),
  WorkspaceError: class WorkspaceError extends Error {},
  WorkspaceService: vi.fn(() => ({})),
}));

vi.mock("@im/db", () => ({
  prisma: {},
}));

describe("platform handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps non-admin access to 403", async () => {
    mocks.platformService.getOverview.mockRejectedValueOnce(
      new mocks.PlatformError("platform_admin_required", "Platform admin access required"),
    );

    const response = await invokeHandler(getPlatformOverviewHandler);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: {
        code: "platform_admin_required",
      },
    });
  });

  it("validates temporary workspace quota overrides", async () => {
    const workspaceId = "00000000-0000-4000-8000-000000000101";
    mocks.platformService.updateWorkspaceQuotaOverride.mockResolvedValueOnce({ id: workspaceId });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const response = await invokeHandler(updateWorkspaceQuotaOverrideHandler, {
      body: {
        expires_at: expiresAt,
        limit: 20,
        reason: "Temporary onboarding capacity",
        resource: "members",
      },
      params: { workspaceId },
    });

    expect(response.status).toBe(200);
    expect(mocks.platformService.updateWorkspaceQuotaOverride).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      workspaceId,
      {
        expiresAt,
        limit: 20,
        reason: "Temporary onboarding capacity",
        resource: "members",
      },
    );
  });

  it("lists platform users for a platform admin actor", async () => {
    mocks.platformService.listUsers.mockResolvedValueOnce({
      items: [],
      next_cursor: null,
    });

    const response = await invokeHandler(listPlatformUsersHandler, {
      query: {
        limit: "10",
        search: "test",
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.platformService.listUsers).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      {
        limit: 10,
        search: "test",
      },
    );
    expect(response.body).toEqual({
      data: {
        items: [],
        next_cursor: null,
      },
    });
  });

  it("revokes user sessions with an admin reason", async () => {
    const userId = "00000000-0000-4000-8000-000000000202";
    mocks.platformService.revokeUserSessions.mockResolvedValueOnce({ id: userId });

    const response = await invokeHandler(revokePlatformUserSessionsHandler, {
      body: { reason: "Account recovery requested" },
      params: { userId },
    });

    expect(response.status).toBe(200);
    expect(mocks.platformService.revokeUserSessions).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      userId,
      "Account recovery requested",
    );
  });

  it("requires a reason before revoking user sessions", async () => {
    const response = await invokeHandler(revokePlatformUserSessionsHandler, {
      body: { reason: "" },
      params: { userId: "00000000-0000-4000-8000-000000000202" },
    });

    expect(response.status).toBe(400);
    expect(mocks.platformService.revokeUserSessions).not.toHaveBeenCalled();
  });

  it("lists filtered platform diagnostics", async () => {
    mocks.platformService.getDiagnostics.mockResolvedValueOnce({ items: [] });

    const response = await invokeHandler(getPlatformDiagnosticsHandler, {
      query: { kind: "notification", limit: "10", search: "timeout" },
    });

    expect(response.status).toBe(200);
    expect(mocks.platformService.getDiagnostics).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      { kind: "notification", limit: 10, search: "timeout" },
    );
  });

  it("retries a notification with an admin reason", async () => {
    const notificationId = "00000000-0000-4000-8000-000000000303";
    mocks.platformService.retryNotification.mockResolvedValueOnce({ items: [] });

    const response = await invokeHandler(retryPlatformNotificationHandler, {
      body: { reason: "Provider outage resolved" },
      params: { notificationId },
    });

    expect(response.status).toBe(200);
    expect(mocks.platformService.retryNotification).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      notificationId,
      "Provider outage resolved",
    );
  });

  it("inspects an allowlisted resource by id", async () => {
    const resourceId = "00000000-0000-4000-8000-000000000505";
    mocks.platformService.inspectResource.mockResolvedValueOnce({ id: resourceId });

    const response = await invokeHandler(getPlatformInspectorHandler, {
      query: { id: resourceId, resource_type: "incident" },
    });

    expect(response.status).toBe(200);
    expect(mocks.platformService.inspectResource).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      { id: resourceId, resource_type: "incident" },
    );
  });

  it("rejects invalid inspector resource types", async () => {
    const response = await invokeHandler(getPlatformInspectorHandler, {
      query: {
        id: "00000000-0000-4000-8000-000000000505",
        resource_type: "raw_table",
      },
    });

    expect(response.status).toBe(400);
    expect(mocks.platformService.inspectResource).not.toHaveBeenCalled();
  });

  it("lists resources without requiring a known id", async () => {
    mocks.platformService.listResources.mockResolvedValueOnce({ items: [] });

    const response = await invokeHandler(listPlatformResourcesHandler, {
      query: { limit: "50", resource_type: "user" },
    });

    expect(response.status).toBe(200);
    expect(mocks.platformService.listResources).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      { limit: 50, resource_type: "user" },
    );
  });
});

async function invokeHandler(
  handler: RequestHandler,
  input: {
    body?: unknown;
    params?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
): Promise<{
  body: unknown;
  status: number;
}> {
  const req = {
    actorUserId: "11111111-1111-4111-8111-111111111111",
    body: input.body ?? {},
    params: input.params ?? {},
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
