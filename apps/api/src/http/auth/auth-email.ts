import nodemailer from "nodemailer";

import { apiLogger } from "../../logger";

type AuthEmailKind = "email_verification" | "password_reset";

type SendAuthEmailInput = {
  email: string;
  kind: AuthEmailKind;
  name: string;
  token: string;
};

export async function sendAuthEmail(input: SendAuthEmailInput) {
  const smtpConfig = readSmtpConfig();

  if (!smtpConfig) {
    apiLogger.info("Auth email SMTP is not configured", {
      auth_email_kind: input.kind,
    });
    return;
  }

  const linkUrl = buildAuthUrl(input.kind, input.token);
  const subject = input.kind === "email_verification"
    ? "Verify your Pager Who email"
    : "Reset your Pager Who password";
  const action = input.kind === "email_verification" ? "verify your email" : "reset your password";
  const buttonLabel = input.kind === "email_verification" ? "Verify email" : "Reset password";
  const safeName = escapeHtml(input.name);
  const safeLinkUrl = escapeHtml(linkUrl);

  try {
    const transporter = nodemailer.createTransport({
      auth: {
        pass: smtpConfig.password,
        user: smtpConfig.user,
      },
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
    });

    await transporter.sendMail({
      from: smtpConfig.user,
      html: `
        <div style="margin:0 auto;max-width:560px;padding:32px 20px;font-family:Arial,sans-serif;color:#171717">
          <h1 style="margin:0 0 20px;font-size:24px">${subject}</h1>
          <p style="margin:0 0 24px;line-height:1.6">Hi ${safeName},</p>
          <p style="margin:0 0 24px;line-height:1.6">Use the button below to ${action}.</p>
          <a href="${safeLinkUrl}" style="display:inline-block;border-radius:8px;background:#171717;color:#ffffff;padding:12px 20px;text-decoration:none;font-weight:700">${buttonLabel}</a>
          <p style="margin:24px 0 8px;line-height:1.6;color:#525252">If the button does not work, copy and paste this link into your browser:</p>
          <p style="margin:0;word-break:break-all"><a href="${safeLinkUrl}">${safeLinkUrl}</a></p>
          <p style="margin:24px 0 0;line-height:1.6;color:#525252">If you did not request this, you can ignore this email.</p>
        </div>
      `.trim(),
      subject,
      text: `Hi ${input.name},\n\nUse the following link to ${action}:\n${linkUrl}\n\nIf you did not request this, you can ignore this email.`,
      to: input.email,
    });
  } catch {
    apiLogger.warn("Auth email SMTP delivery failed", {
      auth_email_kind: input.kind,
    });
  }
}

function readSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();

  if (!host || !user || !password) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);

  return {
    host,
    password,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user,
  };
}

function buildAuthUrl(kind: AuthEmailKind, token: string) {
  const baseUrl = new URL(process.env.WEB_APP_URL?.trim() || "http://127.0.0.1:5173");
  const mode = kind === "email_verification" ? "verify-email" : "reset-password";
  const path = `/login?mode=${mode}&token=${encodeURIComponent(token)}`;

  return new URL(path, baseUrl).toString();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
