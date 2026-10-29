import type { RequestHandler } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createServiceHandler,
  deleteServiceHandler,
  getServiceHandler,
  listServicesHandler,
} from "./services.handler";
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

  class ServiceCatalogError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "ServiceCatalogError";
    }
  }

  return {
    incidentService: {
      listIncidentsForService: vi.fn(),
    },
    prisma: {
      team: {
        findUnique: vi.fn(),
      },
    },
    quotaService: {
      getWorkspaceUsage: vi.fn(),
    },
    serviceCatalogService: {
      createService: vi.fn(),
      createServiceWebhookEndpoint: vi.fn(),
      deleteService: vi.fn(),
      getService: vi.fn(),
      getServiceWebhookEndpoint: vi.fn(),
      listServiceWebhookEndpoints: vi.fn(),
      listServices: vi.fn(),
      updateService: vi.fn(),
    },
    ServiceCatalogError,
    workspaceService: {
      assertMember: vi.fn(),
      assertWorkspacePermission: vi.fn(),
      listUserWorkspaces: vi.fn(),
    },
    WorkspaceError,
  };
});

vi.mock("@im/backend-core", () => ({
  IncidentService: vi.fn(() => mocks.incidentService),
  QuotaService: vi.fn(() => mocks.quotaService),
  ServiceCatalogError: mocks.ServiceCatalogError,
  ServiceCatalogService: vi.fn(() => mocks.serviceCatalogService),
  WorkspaceError: mocks.WorkspaceError,
  WorkspaceService: vi.fn(() => mocks.workspaceService),
}));

vi.mock("@im/db", () => ({
  prisma: mocks.prisma,
}));

describe("services handlers", () => {
  const actorUserId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  const serviceId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceService.assertMember.mockResolvedValue(actorUserId);
    mocks.workspaceService.assertWorkspacePermission.mockResolvedValue(["service_manager"]);
    mocks.workspaceService.listUserWorkspaces.mockResolvedValue([
      {
        id: workspaceId,
      },
    ]);
    mocks.serviceCatalogService.createService.mockResolvedValue(createServiceResponse({
      id: serviceId,
      workspace_id: workspaceId,
    }));
    mocks.serviceCatalogService.getService.mockResolvedValue(createService({
      id: serviceId,
      workspace_id: workspaceId,
    }));
    mocks.serviceCatalogService.deleteService.mockResolvedValue(createService({
      id: serviceId,
      workspace_id: workspaceId,
    }));
    mocks.serviceCatalogService.listServices.mockResolvedValue({
      items: [
        createService({
          id: serviceId,
          workspace_id: workspaceId,
        }),
      ],
      next_cursor: null,
    });
  });

  it("requires an actor header before listing services", async () => {
    const response = await invokeHandler(listServicesHandler);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: {
        code: "authentication_required",
      },
    });
    expect(mocks.serviceCatalogService.listServices).not.toHaveBeenCalled();
  });

  it("scopes service listing to the actor workspaces when no workspace filter is provided", async () => {
    const response = await invokeHandler(listServicesHandler, {
      actorUserId,
      query: {
        limit: "10",
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.workspaceService.listUserWorkspaces).toHaveBeenCalledWith(actorUserId);
    expect(mocks.serviceCatalogService.listServices).toHaveBeenCalledWith({
      limit: 10,
      workspaceIds: [workspaceId],
    });
  });

  it("forwards the health filter to the service listing", async () => {
    const response = await invokeHandler(listServicesHandler, {
      actorUserId,
      query: { health: "impacted", limit: "10" },
    });

    expect(response.status).toBe(200);
    expect(mocks.serviceCatalogService.listServices).toHaveBeenCalledWith({
      health: "impacted",
      limit: 10,
      workspaceIds: [workspaceId],
    });
  });

  it("creates a service only after service management permission passes", async () => {
    const response = await invokeHandler(createServiceHandler, {
      body: {
        name: "Checkout API",
        workspace_id: workspaceId,
      },
      actorUserId,
    });

    expect(response.status).toBe(201);
    expect(mocks.workspaceService.assertWorkspacePermission).toHaveBeenCalledWith(workspaceId, actorUserId, "service.manage");
    expect(mocks.serviceCatalogService.createService).toHaveBeenCalledWith({
      name: "Checkout API",
      workspace_id: workspaceId,
    });
    expect(response.body).toMatchObject({
      data: {
        service: {
          id: serviceId,
          name: "Checkout API",
        },
      },
    });
  });

  it("maps workspace permission failures to a 403 response", async () => {
    mocks.workspaceService.assertWorkspacePermission.mockRejectedValueOnce(
      new mocks.WorkspaceError("workspace_permission_required", "Workspace permission required"),
    );

    const response = await invokeHandler(createServiceHandler, {
      body: {
        name: "Checkout API",
        workspace_id: workspaceId,
      },
      actorUserId,
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: {
        code: "workspace_permission_required",
        message: "Workspace permission required",
      },
    });
    expect(mocks.serviceCatalogService.createService).not.toHaveBeenCalled();
  });

  it("validates service id route params before service lookup", async () => {
    const response = await invokeHandler(getServiceHandler, {
      actorUserId,
      params: {
        serviceId: "not-a-uuid",
      },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "invalid_service_id",
      },
    });
    expect(mocks.serviceCatalogService.getService).not.toHaveBeenCalled();
  });

  it("returns 404 when the service does not exist", async () => {
    mocks.serviceCatalogService.getService.mockResolvedValueOnce(null);

    const response = await invokeHandler(getServiceHandler, {
      actorUserId,
      params: {
        serviceId,
      },
    });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: "service_not_found",
      },
    });
  });

  it("deletes a service only after service management permission passes", async () => {
    const response = await invokeHandler(deleteServiceHandler, {
      actorUserId,
      params: {
        serviceId,
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.workspaceService.assertWorkspacePermission).toHaveBeenCalledWith(workspaceId, actorUserId, "service.manage");
    expect(mocks.serviceCatalogService.deleteService).toHaveBeenCalledWith(serviceId);
    expect(response.body).toMatchObject({
      data: {
        id: serviceId,
      },
    });
  });
});

async function invokeHandler(
  handler: RequestHandler,
  input: {
    actorUserId?: string;
    body?: unknown;
    headers?: Record<string, string>;
    params?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
): Promise<{
  body: unknown;
  status: number;
}> {
  const req = {
    actorUserId: input.actorUserId,
    authSource: input.actorUserId ? "session" : undefined,
    body: input.body ?? {},
    header(name: string) {
      return input.headers?.[name.toLowerCase()];
    },
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

function createService(overrides: {
  id: string;
  workspace_id: string;
}) {
  return {
    id: overrides.id,
    workspace_id: overrides.workspace_id,
    name: "Checkout API",
    description: null,
    team_id: null,
    escalation_policy_id: null,
    status: "normal",
    open_incident_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function createServiceResponse(overrides: {
  id: string;
  workspace_id: string;
}) {
  return {
    default_webhook_endpoint: {
      id: "44444444-4444-4444-8444-444444444444",
      service_id: overrides.id,
      name: "Service Webhook",
      url: "https://example.com/webhooks/44444444-4444-4444-8444-444444444444",
      secret: "secret",
      created_at: "2026-01-01T00:00:00.000Z",
      disabled_at: null,
    },
    service: createService(overrides),
  };
}
