import type { RequestHandler } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { receiveWebhookHandler } from "./webhooks.handler";

const endpointId = "00000000-0000-4000-8000-000000000401";
const incidentId = "00000000-0000-4000-8000-000000000402";
const workspaceId = "00000000-0000-4000-8000-000000000403";

const mocks = vi.hoisted(() => ({
  receive: vi.fn(),
  recordActivityLog: vi.fn(),
  findWebhookEndpoint: vi.fn(),
}));

vi.mock("@im/backend-core", () => {
  class WebhookIngestionError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  }

  return {
    QuotaService: vi.fn(() => ({})),
    recordActivityLog: mocks.recordActivityLog,
    ServiceCatalogError: class ServiceCatalogError extends Error {
      constructor(readonly code: string, message: string) {
        super(message);
      }
    },
    ServiceCatalogService: vi.fn(() => ({})),
    WebhookIngestionError,
    WebhookIngestionService: vi.fn(() => ({ receive: mocks.receive })),
    WorkspaceError: class WorkspaceError extends Error {},
    WorkspaceService: vi.fn(() => ({})),
  };
});

vi.mock("@im/db", () => ({
  prisma: {
    webhookEndpoint: {
      findUnique: mocks.findWebhookEndpoint,
    },
  },
}));

describe("receiveWebhookHandler observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findWebhookEndpoint.mockResolvedValue({
      name: "Primary monitor",
      service: { workspaceId },
    });
  });

  it("records a successful ingestion with its request id", async () => {
    mocks.receive.mockResolvedValue({
      action: "created",
      event_id: "00000000-0000-4000-8000-000000000404",
      incident: { id: incidentId },
      normalized_event: {},
    });

    const result = await invoke(receiveWebhookHandler);

    expect(result.status).toBe(201);
    expect(mocks.recordActivityLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "webhook.ingestion_succeeded",
      metadata: expect.objectContaining({
        action: "created",
        incident_id: incidentId,
        request_id: "request-123",
      }),
      resourceId: endpointId,
      workspaceId,
    }));
  });

  it("records an ingestion failure without storing the payload or token", async () => {
    const { WebhookIngestionError } = await import("@im/backend-core");
    mocks.receive.mockRejectedValue(new WebhookIngestionError("webhook_secret_invalid", "Invalid webhook secret"));

    await invoke(receiveWebhookHandler);

    const activity = mocks.recordActivityLog.mock.calls[0]?.[1];
    expect(activity).toMatchObject({
      action: "webhook.ingestion_failed",
      metadata: expect.objectContaining({
        error_code: "webhook_secret_invalid",
        request_id: "request-123",
      }),
    });
    expect(JSON.stringify(activity)).not.toContain("top-secret");
    expect(JSON.stringify(activity)).not.toContain("sensitive payload");
  });
});

async function invoke(handler: RequestHandler) {
  const req = {
    body: { message: "sensitive payload" },
    header: (name: string) => name === "x-webhook-token" ? "top-secret" : undefined,
    params: { endpointId },
    query: {},
  };
  const res = {
    body: null as unknown,
    locals: { requestId: "request-123" },
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
  const next = vi.fn();

  await handler(req as never, res as never, next);

  return { next, status: res.statusCode };
}
