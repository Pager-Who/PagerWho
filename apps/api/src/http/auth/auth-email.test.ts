import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport,
  },
}));

import { sendAuthEmail } from "./auth-email";

describe("sendAuthEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_APP_URL = "https://dev.pagerwho.com";
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_USER = "pagerwho.dev@gmail.com";
    process.env.SMTP_PASSWORD = "app-password";
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue({ messageId: "message-id" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sends a password reset email through SMTP", async () => {
    await sendAuthEmail({
      email: "user@example.com",
      kind: "password_reset",
      name: "Example User",
      token: "reset-token",
    });

    expect(mocks.createTransport).toHaveBeenCalledWith({
      auth: {
        pass: "app-password",
        user: "pagerwho.dev@gmail.com",
      },
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: "pagerwho.dev@gmail.com",
      html: expect.stringContaining(">Reset password</a>"),
      subject: "Reset your Pager Who password",
      to: "user@example.com",
      text: expect.stringContaining("https://dev.pagerwho.com/login?mode=reset-password&token=reset-token"),
    }));
  });

  it("does not create a transport when SMTP credentials are missing", async () => {
    delete process.env.SMTP_PASSWORD;

    await sendAuthEmail({
      email: "user@example.com",
      kind: "email_verification",
      name: "Example User",
      token: "verification-token",
    });

    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("does not expose SMTP delivery failures to the auth endpoint", async () => {
    mocks.sendMail.mockRejectedValueOnce(new Error("Authentication failed"));

    await expect(sendAuthEmail({
      email: "user@example.com",
      kind: "password_reset",
      name: "Example User",
      token: "reset-token",
    })).resolves.toBeUndefined();
  });
});
