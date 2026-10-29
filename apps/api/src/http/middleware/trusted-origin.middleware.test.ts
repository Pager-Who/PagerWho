import { afterEach, describe, expect, it, vi } from "vitest";

import { trustedOriginMiddleware } from "./trusted-origin.middleware";

describe("trustedOriginMiddleware", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects mutating browser requests from untrusted origins", () => {
    process.env.CORS_ORIGIN = "https://app.example.com";
    const next = vi.fn();

    trustedOriginMiddleware(createRequest({
      method: "POST",
      origin: "https://evil.example.com",
      path: "/api/v1/services",
    }) as never, {} as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: "untrusted_origin",
      statusCode: 403,
    }));
  });

  it("allows mutating browser requests from trusted origins", () => {
    process.env.CORS_ORIGIN = "https://app.example.com";
    const next = vi.fn();

    trustedOriginMiddleware(createRequest({
      method: "POST",
      origin: "https://app.example.com",
      path: "/api/v1/services",
    }) as never, {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("allows mutating requests with a trusted referer when origin is missing", () => {
    process.env.CORS_ORIGIN = "https://app.example.com";
    const next = vi.fn();

    trustedOriginMiddleware(createRequest({
      method: "POST",
      path: "/api/v1/services",
      referer: "https://app.example.com/services",
    }) as never, {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects mutating requests when origin and referer are missing", () => {
    process.env.CORS_ORIGIN = "https://app.example.com";
    const next = vi.fn();

    trustedOriginMiddleware(createRequest({
      method: "POST",
      path: "/api/v1/services",
    }) as never, {} as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: "missing_origin",
      statusCode: 403,
    }));
  });

  it("allows localhost when the matching 127.0.0.1 origin is configured", () => {
    process.env.CORS_ORIGIN = "http://127.0.0.1:5173";
    const next = vi.fn();

    trustedOriginMiddleware(createRequest({
      method: "POST",
      origin: "http://localhost:5173",
      path: "/api/v1/services",
    }) as never, {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("allows wildcard origins without requiring an Access-Control-Allow-Origin wildcard", () => {
    process.env.CORS_ORIGIN = "*";
    const next = vi.fn();

    trustedOriginMiddleware(createRequest({
      method: "POST",
      origin: "http://localhost:5173",
      path: "/api/v1/services",
    }) as never, {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("allows webhook ingestion without origin checks", () => {
    process.env.CORS_ORIGIN = "https://app.example.com";
    const next = vi.fn();

    trustedOriginMiddleware(createRequest({
      method: "POST",
      path: "/api/v1/webhooks/77777777-7777-4777-8777-777777777777",
    }) as never, {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });
});

function createRequest(input: { method: string; origin?: string; path: string; referer?: string }) {
  return {
    header(name: string) {
      if (name.toLowerCase() === "origin") {
        return input.origin;
      }

      if (name.toLowerCase() === "referer") {
        return input.referer;
      }

      return undefined;
    },
    method: input.method,
    path: input.path,
  };
}
