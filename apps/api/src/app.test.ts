import { afterEach, describe, expect, it } from "vitest";

import { resolveCorsOrigin } from "./app";

describe("app CORS origin", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reflects wildcard CORS origins for credentialed requests", () => {
    process.env.CORS_ORIGIN = "*";
    const origin = resolveOrigin("http://localhost:5173");

    expect(origin).toBe("http://localhost:5173");
  });

  it("allows localhost when 127.0.0.1 is configured", () => {
    process.env.CORS_ORIGIN = "http://127.0.0.1:5173";
    const origin = resolveOrigin("http://localhost:5173");

    expect(origin).toBe("http://localhost:5173");
  });

  it("rejects untrusted origins", () => {
    process.env.CORS_ORIGIN = "https://app.example.com";
    const origin = resolveOrigin("https://evil.example.com");

    expect(origin).toBe(false);
  });
});

function resolveOrigin(requestOrigin: string) {
  const corsOrigin = resolveCorsOrigin();
  let resolvedOrigin: boolean | string | undefined;

  corsOrigin(requestOrigin, (error, origin) => {
    if (error) {
      throw error;
    }

    resolvedOrigin = origin;
  });

  return resolvedOrigin;
}
