import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { authRateLimit } from "./auth-rate-limit.middleware";

describe("auth rate limit middleware", () => {
  it("limits repeated login attempts by IP and account", () => {
    const middleware = authRateLimit("login");
    const request = {
      body: { email: "limited-user@example.com" },
      ip: "192.0.2.10",
    } as Request;
    const response = {
      setHeader: () => response,
    } as unknown as Response;
    const next = () => undefined;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      middleware(request, response, next);
    }

    let error: unknown;
    middleware(request, response, (nextError) => {
      error = nextError;
    });

    expect(error).toMatchObject({
      code: "auth_rate_limited",
      statusCode: 429,
    });
  });
});
