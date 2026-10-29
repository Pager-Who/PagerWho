import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationProviderMessage } from "./notification-provider";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
  default: {
    createTransport,
  },
}));

const { EmailProvider } = await import("./email.provider");

describe("EmailProvider", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("sends incident email through the workspace SMTP account", async () => {
    process.env.NOTIFICATION_DELIVERY_MODE = "live";
    sendMail.mockResolvedValue({ messageId: "smtp-message-1" });

    const result = await new EmailProvider().send(createMessage());

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: "alerts@example.com",
        pass: "app-password",
      },
    }));
    expect(sendMail).toHaveBeenCalledWith({
      from: { name: "PagerWho Alerts", address: "alerts@example.com" },
      to: "responder@example.com",
      subject: "[P1] Checkout API is down",
      text: "Incident details",
    });
    expect(result.providerMessageId).toBe("smtp-message-1");
  });

  it("rejects live delivery without workspace SMTP credentials", async () => {
    process.env.NOTIFICATION_DELIVERY_MODE = "live";
    const message = createMessage();
    delete message.providerSettings;

    await expect(new EmailProvider().send(message)).rejects.toThrow("email provider is not configured");
    expect(createTransport).not.toHaveBeenCalled();
  });
});

function createMessage(): NotificationProviderMessage {
  return {
    targetAddress: "responder@example.com",
    subject: "[P1] Checkout API is down",
    body: "Incident details",
    incident: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      title: "Checkout API is down",
      description: null,
      severity: "critical",
      priority: "P1",
      status: "triggered",
      source: "webhook",
      fingerprint: "checkout-api-down",
      createdAt: new Date().toISOString(),
      service: {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Checkout API",
      },
    },
    notification: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      channel: "email",
      targetType: "primary_on_call",
      targetId: "11111111-1111-4111-8111-111111111111",
      repeatIteration: 0,
      attempt: 0,
    },
    providerSettings: {
      email: {
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpSecurity: "starttls",
        smtpUsername: "alerts@example.com",
        smtpPassword: "app-password",
        fromName: "PagerWho Alerts",
        fromEmail: "alerts@example.com",
      },
    },
  };
}
