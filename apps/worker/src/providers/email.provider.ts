import nodemailer from "nodemailer";

import type {
  NotificationProvider,
  NotificationProviderMessage,
  NotificationProviderResult,
  NotificationProviderSettings,
} from "./notification-provider";
import {
  assertProviderConfigured,
  createLoggedProviderResult,
  shouldUseLogDelivery,
} from "./notification-provider";

type SmtpSettings = NonNullable<NotificationProviderSettings["email"]> & {
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "starttls" | "tls";
  smtpUsername: string;
  smtpPassword: string;
  fromEmail: string;
};

export class EmailProvider implements NotificationProvider {
  async send(message: NotificationProviderMessage): Promise<NotificationProviderResult> {
    const smtp = resolveSmtpSettings(message);
    const isConfigured = Boolean(smtp);

    assertProviderConfigured("email", isConfigured);

    if (!smtp || shouldUseLogDelivery(isConfigured)) {
      return createLoggedProviderResult("email", message);
    }

    const transporter = nodemailer.createTransport({
      host: smtp.smtpHost,
      port: smtp.smtpPort,
      secure: smtp.smtpSecurity === "tls",
      requireTLS: smtp.smtpSecurity === "starttls",
      auth: {
        user: smtp.smtpUsername,
        pass: smtp.smtpPassword,
      },
      connectionTimeout: readTimeout("NOTIFICATION_SMTP_CONNECTION_TIMEOUT_MS", 10_000),
      greetingTimeout: readTimeout("NOTIFICATION_SMTP_GREETING_TIMEOUT_MS", 10_000),
      socketTimeout: readTimeout("NOTIFICATION_SMTP_SOCKET_TIMEOUT_MS", 30_000),
    });
    const from = smtp.fromName
      ? { name: smtp.fromName, address: smtp.fromEmail }
      : smtp.fromEmail;
    const result = await transporter.sendMail({
      from,
      to: message.targetAddress,
      subject: message.subject,
      text: message.body,
      html: buildIncidentEmailHtml(message),
    });

    return {
      providerMessageId: result.messageId,
    };
  }
}

const priorityColors: Record<string, string> = {
  P1: "#d92d20",
  P2: "#e8590c",
  P3: "#b08800",
  P4: "#1c7ed6",
  P5: "#5c6370",
};

// Table-based inline-styled markup because mail clients ignore stylesheets. Every incident field can come from an
// external webhook, so all interpolated values are escaped; only http(s) links become buttons.
export function buildIncidentEmailHtml(message: NotificationProviderMessage): string {
  const { incident } = message;
  const priorityColor = priorityColors[incident.priority] ?? "#5c6370";
  const buttons = [
    message.actions?.ackUrl && isHttpUrl(message.actions.ackUrl)
      ? emailButton(message.actions.ackUrl, "Acknowledge", "#d92d20", "#ffffff")
      : "",
    incident.url && isHttpUrl(incident.url)
      ? emailButton(incident.url, "Open incident", "#ffffff", "#111418", "border:1px solid #d0d5dd;")
      : "",
  ].join("");
  const description = incident.description
    ? `<p style="margin:16px 0 0;color:#344054;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(incident.description)}</p>`
    : "";
  const details = [
    ["Service", incident.service.name],
    ["Status", incident.status],
    ["Severity", incident.severity],
    ["Source", incident.source],
  ].map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#667085;font-size:13px;">${escapeHtml(label ?? "")}</td><td style="padding:4px 0;color:#111418;font-size:13px;">${escapeHtml(value ?? "")}</td></tr>`).join("");

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f2f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #eaecf0;">
<tr><td style="padding:24px;">
<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${priorityColor};color:#ffffff;font-size:12px;font-weight:700;">${escapeHtml(incident.priority)}</span>
<h1 style="margin:12px 0 0;color:#111418;font-size:20px;line-height:1.3;">${escapeHtml(incident.title)}</h1>
${description}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;">${details}</table>
${buttons ? `<div style="margin-top:24px;">${buttons}</div>` : ""}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eaecf0;color:#98a2b3;font-size:12px;">Sent by PagerWho because you are a responder for this service.</td></tr>
</table>
</body></html>`;
}

function emailButton(href: string, label: string, background: string, color: string, extraStyle = ""): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:8px;background:${background};color:${color};font-size:14px;font-weight:600;text-decoration:none;${extraStyle}">${escapeHtml(label)}</a>`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveSmtpSettings(message: NotificationProviderMessage): SmtpSettings | null {
  const smtp = message.providerSettings?.email;

  if (!smtp?.smtpHost
    || !smtp.smtpPort
    || !smtp.smtpSecurity
    || !smtp.smtpUsername
    || !smtp.smtpPassword
    || !smtp.fromEmail) {
    return null;
  }

  return smtp as SmtpSettings;
}

function readTimeout(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
