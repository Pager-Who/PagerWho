import type { RequestHandler } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkerReadinessHandler, listWorkerRunsHandler } from "./workers.handler";
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
    assertPlatformAdmin: vi.fn(),
  },
  quotaService: {
    getWorkspaceUsage: vi.fn(),
  },
  workerObservabilityService: {
    getReadiness: vi.fn(),
    listRunLogs: vi.fn(),
  },
  workspaceService: {
    assertMember: vi.fn(),
    listUserWorkspaces: vi.fn(),
  },
}));

vi.mock("@im/backend-core", () => ({
  PlatformError: mocks.PlatformError,
  PlatformService: vi.fn(() => mocks.platformService),
  QuotaService: vi.fn(() => mocks.quotaService),
  WorkspaceService: vi.fn(() => mocks.workspaceService),
  WorkerObservabilityService: vi.fn(() => mocks.workerObservabilityService),
}));

vi.mock("@im/db", () => ({
  prisma: {},
}));

describe("getWorkerReadinessHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platformService.assertPlatformAdmin.mockResolvedValue(undefined);
    mocks.workerObservabilityService.getReadiness.mockResolvedValue({
      checked_at: "2026-06-17T00:00:00.000Z",
      latest_runs: [],
      max_run_age_seconds: 120,
      ready: false,
      stale_workers: ["escalation-worker"],
    });
  });

  it("returns 503 when workers are not ready by default", async () => {
    const response = await invokeHandler(getWorkerReadinessHandler, {
      query: {
        max_run_age_seconds: "120",
      },
    });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      data: {
        ready: false,
        stale_workers: ["escalation-worker"],
      },
    });
  });

  it("returns 200 for UI polling when response_status is always_200", async () => {
    const response = await invokeHandler(getWorkerReadinessHandler, {
      query: {
        max_run_age_seconds: "120",
        response_status: "always_200",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        ready: false,
        stale_workers: ["escalation-worker"],
      },
    });
  });
});

describe("listWorkerRunsHandler", () => {
  const actorUserId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platformService.assertPlatformAdmin.mockResolvedValue(undefined);
    mocks.workerObservabilityService.listRunLogs.mockResolvedValue({
      items: [],
      next_cursor: null,
    });
  });

  it("requires authentication before listing worker run logs", async () => {
    const response = await invokeHandler(listWorkerRunsHandler);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: {
        code: "authentication_required",
      },
    });
    expect(mocks.platformService.assertPlatformAdmin).not.toHaveBeenCalled();
    expect(mocks.workerObservabilityService.listRunLogs).not.toHaveBeenCalled();
  });

  it("rejects non-platform admins before listing worker run logs", async () => {
    mocks.platformService.assertPlatformAdmin.mockRejectedValueOnce(
      new mocks.PlatformError("platform_admin_required", "Platform admin access required"),
    );

    const response = await invokeHandler(listWorkerRunsHandler, {
      actorUserId,
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: {
        code: "platform_admin_required",
      },
    });
    expect(mocks.platformService.assertPlatformAdmin).toHaveBeenCalledWith(actorUserId);
    expect(mocks.workerObservabilityService.listRunLogs).not.toHaveBeenCalled();
  });

  it("lists worker run logs for platform admins", async () => {
    const response = await invokeHandler(listWorkerRunsHandler, {
      actorUserId,
      query: {
        limit: "10",
        status: "failed",
        worker_name: "notification-worker",
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.platformService.assertPlatformAdmin).toHaveBeenCalledWith(actorUserId);
    expect(mocks.workerObservabilityService.listRunLogs).toHaveBeenCalledWith({
      limit: 10,
      status: "failed",
      worker_name: "notification-worker",
    });
    expect(response.body).toEqual({
      data: {
        items: [],
        next_cursor: null,
      },
    });
  });
});

async function invokeHandler(
  handler: RequestHandler,
  input: {
    actorUserId?: string;
    query?: Record<string, string>;
  } = {},
): Promise<{
  body: unknown;
  status: number;
}> {
  const req = {
    actorUserId: input.actorUserId,
    authSource: input.actorUserId ? "session" : undefined,
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
