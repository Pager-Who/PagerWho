import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "./client";

describe("ApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends session credentials and an access token, then unwraps successful data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: "incident-1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient({ baseUrl: "https://pagerwho.test/api", getAccessToken: () => "token-1" });

    await expect(client.request("/incidents", { method: "POST", body: "{}" }))
      .resolves.toEqual({ id: "incident-1" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://pagerwho.test/api/incidents");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-1");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("preserves structured API error details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "quota_exceeded", message: "Limit reached", details: { limit: 2 }, request_id: "req-1" },
    }, 429)));
    const client = new ApiClient({ baseUrl: "https://pagerwho.test/api" });

    await expect(client.request("/services")).rejects.toMatchObject({
      code: "quota_exceeded",
      details: { limit: 2 },
      message: "Limit reached",
      requestId: "req-1",
      status: 429,
    });
  });

  it("rejects successful responses that do not use the API envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: "incident-1" })));
    const client = new ApiClient({ baseUrl: "https://pagerwho.test/api" });

    await expect(client.request("/incidents")).rejects.toMatchObject({
      code: "invalid_api_response",
      status: 200,
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
