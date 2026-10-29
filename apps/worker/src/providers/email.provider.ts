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
    });

    return {
      providerMessageId: result.messageId,
    };
  }
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
