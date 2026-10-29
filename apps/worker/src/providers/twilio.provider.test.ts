import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationProviderMessage } from "./notification-provider";
import { TwilioPhoneProvider, TwilioSmsProvider } from "./twilio.provider";

describe("Twilio providers", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("sends SMS through Twilio Messages API", async () => {
    process.env.NOTIFICATION_DELIVERY_MODE = "live";
    const messagesCreate = vi.fn().mockResolvedValue({ sid: "SM123" });
    const createClient = vi.fn(() => ({
      messages: {
        create: messagesCreate,
      },
      calls: {
        create: vi.fn(),
      },
    }));

    const result = await new TwilioSmsProvider(createClient).send(createMessage());

    expect(result.providerMessageId).toBe("SM123");
    expect(createClient).toHaveBeenCalledWith("AC00000000000000000000000000000000", "auth-token", {
      timeout: 10_000,
    });
    expect(messagesCreate).toHaveBeenCalledWith({
      to: "+15551234567",
      from: "+15550000000",
      body: expect.stringContaining("[CRITICAL] Checkout API: latency spike"),
    });
  });

  it("sends phone calls through Twilio Calls API", async () => {
    process.env.NOTIFICATION_DELIVERY_MODE = "live";
    const callsCreate = vi.fn().mockResolvedValue({ sid: "CA123" });
    const createClient = vi.fn(() => ({
      messages: {
        create: vi.fn(),
      },
      calls: {
        create: callsCreate,
      },
    }));

    const result = await new TwilioPhoneProvider(createClient).send(createMessage());

    expect(result.providerMessageId).toBe("CA123");
    expect(createClient).toHaveBeenCalledWith("AC00000000000000000000000000000000", "auth-token", {
      timeout: 10_000,
    });
    expect(callsCreate).toHaveBeenCalledWith({
      to: "+15551234567",
      from: "+15550000000",
      twiml: expect.stringContaining("<Response><Say>"),
    });
  });

  it("does not fall back to server Twilio environment variables", async () => {
    process.env.NOTIFICATION_DELIVERY_MODE = "live";
    process.env.TWILIO_ACCOUNT_SID = "AC-server-fallback";
    process.env.TWILIO_AUTH_TOKEN = "server-fallback-token";
    process.env.TWILIO_FROM_PHONE_NUMBER = "+15550000000";
    const messageWithoutWorkspaceConfig = createMessage();
    delete messageWithoutWorkspaceConfig.providerSettings;

    await expect(new TwilioSmsProvider().send(messageWithoutWorkspaceConfig))
      .rejects.toThrow("twilio sms provider is not configured");
  });
});

function createMessage(overrides: Partial<NotificationProviderMessage> = {}): NotificationProviderMessage {
  return {
    targetAddress: "+15551234567",
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
      url: "http://localhost:5173/incidents/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    },
    notification: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      channel: "sms",
      targetType: "primary_on_call",
      targetId: "11111111-1111-4111-8111-111111111111",
      repeatIteration: 0,
      attempt: 0,
    },
    providerSettings: {
      twilio: {
        accountSid: "AC00000000000000000000000000000000",
        authToken: "auth-token",
        fromPhoneNumber: "+15550000000",
      },
    },
    ...overrides,
  };
}
