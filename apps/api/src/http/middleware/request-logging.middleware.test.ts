import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requestLoggingMiddleware } from "./request-logging.middleware";
const mocks = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), record: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../logger", () => ({ apiLogger: { info: mocks.info, warn: mocks.warn, error: mocks.error } }));
vi.mock("@im/backend-core", () => ({ recordActivityLog: mocks.record }));
vi.mock("@im/db", () => ({ prisma: {} }));
describe("request logging privacy", () => {
  it.each([200, 400, 500])("excludes query credentials and client metadata for status %s", (status) => {
    vi.clearAllMocks();
    let finish: (() => void) | undefined;
    const req = { method: "POST", path: "/api/v1/webhooks/endpoint", originalUrl: "/api/v1/webhooks/endpoint?token=synthetic-private-token", ip: "synthetic-client-address", header: () => "synthetic-client-agent" } as unknown as Request;
    const res = { statusCode: status, locals: { requestId: "audit" }, on: (_event: string, callback: () => void) => { finish = callback; } } as unknown as Response;
    requestLoggingMiddleware(req, res, vi.fn());
    finish!();
    const logger = status >= 500 ? mocks.error : status >= 400 ? mocks.warn : mocks.info;
    expect(logger).toHaveBeenCalledWith("HTTP request completed", { request_id: "audit", method: "POST", path: "/api/v1/webhooks/endpoint", status_code: status, duration_ms: expect.any(Number) });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("synthetic-private-token");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("synthetic-client-address");
  });
});
