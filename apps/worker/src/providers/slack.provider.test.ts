import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationProviderMessage } from "./notification-provider";
import { SlackProvider } from "./slack.provider";

describe("SlackProvider", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("throws retry metadata when Slack incoming webhook is rate limited", async () => {
    process.env.NOTIFICATION_DELIVERY_MODE = "live";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", {
      status: 429,
      headers: {
        "retry-after": "7",
      },
    })));

    await expect(new SlackProvider().send(createMessage({
      targetAddress: "https://hooks.slack.com/services/test",
    }))).rejects.toMatchObject({
      retryAfterSeconds: 7,
    });
  });

  it("requires a registered Slack incoming webhook URL in live mode", async () => {
    process.env.NOTIFICATION_DELIVERY_MODE = "live";
    await expect(new SlackProvider().send(createMessage({
      targetAddress: "#alerts",
    }))).rejects.toThrow("slack provider is not configured");
  });

  it("uses project Slack webhook only for team channel targets", async () => {
    process.env.NOTIFICATION_DELIVERY_MODE = "live";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new SlackProvider().send(createMessage({
      providerSettings: {
        slack: {
          webhookUrl: "https://hooks.slack.com/services/project",
        },
      },
      targetAddress: "#alerts",
    }));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/services/project", expect.any(Object));
  });

  it("does not use project Slack webhook for personal targets", async () => {
    process.env.NOTIFICATION_DELIVERY_MODE = "live";

    await expect(new SlackProvider().send(createMessage({
      notification: {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        channel: "slack",
        targetType: "primary_on_call",
        targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        repeatIteration: 0,
        attempt: 0,
      },
      providerSettings: {
        slack: {
          webhookUrl: "https://hooks.slack.com/services/project",
        },
      },
      targetAddress: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    }))).rejects.toThrow("slack provider is not configured");
  });
});

function createMessage(overrides: Partial<NotificationProviderMessage> = {}): NotificationProviderMessage {
  return {
    targetAddress: "https://hooks.slack.com/services/test",
    subject: "[CRITICAL] Checkout API: latency spike",
    body: "Incident details",
    incident: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      title: "Checkout API latency spike",
      description: null,
      severity: "critical",
      priority: "P1",
      status: "triggered",
      source: "webhook",
      fingerprint: "checkout-api-latency",
      createdAt: new Date().toISOString(),
      service: {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Checkout API",
      },
    },
    notification: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      channel: "slack",
      targetType: "team_channel",
      targetId: "alerts",
      repeatIteration: 0,
      attempt: 0,
    },
    ...overrides,
  };
}
