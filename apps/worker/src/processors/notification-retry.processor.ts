import type { NotificationLog } from "@im/contracts";
import { createIncidentActionToken, decryptProviderCredential, NotificationService } from "@im/backend-core";
import { prisma, type PrismaClient } from "@im/db";

import { EmailProvider } from "../providers/email.provider";
import {
  NotificationProviderError,
  type NotificationProvider,
  type NotificationProviderSettings,
  type NotificationResponseActions,
} from "../providers/notification-provider";
import { SlackProvider } from "../providers/slack.provider";
import { TwilioPhoneProvider, TwilioSmsProvider } from "../providers/twilio.provider";
import { WebhookProvider } from "../providers/webhook.provider";

type IncidentNotificationContext = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  severity: string;
  priority: string;
  status: string;
  source: string;
  fingerprint: string;
  createdAt: Date;
  service: {
    id: string;
    name: string;
  };
};

type NotificationServicePort = Pick<
  NotificationService,
  | "claimDueNotifications"
  | "markFailed"
  | "markSent"
  | "markSkipped"
  | "shouldSkipNotification"
  | "startDeliveryAttempt"
>;

type NotificationRetryProcessorOptions = {
  db?: PrismaClient;
  notificationService?: NotificationServicePort;
  providers?: Partial<Record<NotificationLog["channel"], NotificationProvider>>;
};

export class NotificationRetryProcessor {
  private readonly db: PrismaClient;
  private readonly notificationService: NotificationServicePort;
  private readonly providers: Record<NotificationLog["channel"], NotificationProvider>;

  constructor(options: NotificationRetryProcessorOptions = {}) {
    this.db = options.db ?? prisma;
    this.notificationService = options.notificationService ?? new NotificationService(this.db);
    this.providers = {
      email: new EmailProvider(),
      phone: new TwilioPhoneProvider(),
      slack: new SlackProvider(),
      sms: new TwilioSmsProvider(),
      webhook: new WebhookProvider(),
      ...options.providers,
    };
  }

  async tick(): Promise<number> {
    const maxNotificationsPerTick = Number(process.env.WORKER_NOTIFICATION_BATCH_SIZE ?? 25);
    const leaseSeconds = Number(process.env.WORKER_NOTIFICATION_LEASE_SECONDS ?? 120);
    const notifications = await this.notificationService.claimDueNotifications(
      maxNotificationsPerTick,
      leaseSeconds,
    );

    for (const notification of notifications) {
      await this.sendNotification(notification);
    }

    return notifications.length;
  }

  private async sendNotification(notification: NotificationLog) {
    const deliveryAttempt = await this.notificationService.startDeliveryAttempt(
      notification.id,
      providerNameForChannel(notification.channel),
      {
        worker: "notification-retry",
      },
    );

    if (await this.notificationService.shouldSkipNotification(notification.id, {
      deliveryAttemptId: deliveryAttempt.id,
    })) {
      return;
    }

    const provider = this.providers[notification.channel];

    try {
      const incident = await this.getIncidentContext(notification.incident_id);
      const providerSettings = await this.getProviderSettings(incident.workspaceId);

      if (notification.event_action === "incident.created"
        && (incident.status === "acknowledged" || incident.status === "resolved")) {
        await this.notificationService.markSkipped(notification.id, `Incident is ${incident.status}`, {
          deliveryAttemptId: deliveryAttempt.id,
        });
        return;
      }

      const incidentUrl = buildIncidentUrl(incident.id);
      const actions = buildResponseActions(notification, incident);

      const result = await provider.send({
        targetAddress: notification.target_address,
        subject: buildNotificationSubject(notification.event_action, incident),
        body: buildNotificationBody(notification, incident, actions),
        incident: {
          id: incident.id,
          title: incident.title,
          description: incident.description,
          severity: incident.severity,
          priority: incident.priority,
          status: incident.status,
          source: incident.source,
          fingerprint: incident.fingerprint,
          createdAt: incident.createdAt.toISOString(),
          service: incident.service,
          ...(incidentUrl ? { url: incidentUrl } : {}),
        },
        notification: {
          id: notification.id,
          channel: notification.channel,
          targetType: notification.target_type,
          targetId: notification.target_id,
          repeatIteration: notification.repeat_iteration ?? 0,
          attempt: notification.attempt,
          eventAction: notification.event_action,
        },
        ...(actions ? { actions } : {}),
        providerSettings,
      });

      await this.notificationService.markSent(notification.id, result.providerMessageId, {
        deliveryAttemptId: deliveryAttempt.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown notification provider error";
      await this.notificationService.markFailed(notification.id, message, {
        deliveryAttemptId: deliveryAttempt.id,
        ...(error instanceof NotificationProviderError && error.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: error.retryAfterSeconds }
          : {}),
      });
    }
  }

  private async getIncidentContext(incidentId: string): Promise<IncidentNotificationContext> {
    const incident = await this.db.incident.findUnique({
      where: {
        id: incidentId,
      },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        description: true,
        severity: true,
        priority: true,
        status: true,
        source: true,
        fingerprint: true,
        createdAt: true,
        service: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    return incident;
  }

  private async getProviderSettings(workspaceId: string): Promise<NotificationProviderSettings> {
    const rows = await this.db.workspaceNotificationProviderSetting.findMany({
      where: {
        workspaceId,
        enabled: true,
      },
    });
    const settings: NotificationProviderSettings = {};

    for (const row of rows) {
      const config = readProviderConfig(row.config);

      if (row.provider === "slack") {
        settings.slack = {
          ...(typeof config.webhook_url === "string" ? { webhookUrl: config.webhook_url } : {}),
        };
      }

      if (row.provider === "email") {
        settings.email = {
          ...(typeof config.smtp_host === "string" ? { smtpHost: config.smtp_host } : {}),
          ...(typeof config.smtp_port === "number" ? { smtpPort: config.smtp_port } : {}),
          ...(config.smtp_security === "starttls" || config.smtp_security === "tls" ? { smtpSecurity: config.smtp_security } : {}),
          ...(typeof config.smtp_username === "string" ? { smtpUsername: config.smtp_username } : {}),
          ...(typeof config.smtp_password === "string" ? { smtpPassword: decryptProviderCredential(config.smtp_password) } : {}),
          ...(typeof config.from_name === "string" ? { fromName: config.from_name } : {}),
          ...(typeof config.from_email === "string" ? { fromEmail: config.from_email } : {}),
        };
      }

      if (row.provider === "twilio") {
        settings.twilio = {
          ...(typeof config.account_sid === "string" ? { accountSid: config.account_sid } : {}),
          ...(typeof config.auth_token === "string" ? { authToken: config.auth_token } : {}),
          ...(typeof config.from_phone_number === "string" ? { fromPhoneNumber: config.from_phone_number } : {}),
        };
      }
    }

    return settings;
  }
}

function readProviderConfig(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function buildNotificationSubject(eventAction: string, incident: IncidentNotificationContext): string {
  const eventLabel = eventAction === "incident.acknowledged"
    ? "ACKNOWLEDGED"
    : eventAction === "incident.resolved"
      ? "RESOLVED"
      : eventAction === "incident.priority_updated"
        ? "PRIORITY CHANGED"
        : "INCIDENT";
  return `[${eventLabel}] [${incident.priority} ${incident.severity.toUpperCase()}] ${incident.service.name}: ${incident.title}`;
}

function buildNotificationBody(
  notification: NotificationLog,
  incident: IncidentNotificationContext,
  actions: NotificationResponseActions | null,
): string {
  const incidentUrl = buildIncidentUrl(incident.id);
  const lines = [
    actions ? `Acknowledge: ${actions.ackUrl}` : null,
    actions ? "" : null,
    `Event: ${notification.event_action}`,
    `Incident: ${incident.title}`,
    `Service: ${incident.service.name}`,
    `Severity: ${incident.severity}`,
    `Priority: ${incident.priority}`,
    `Status: ${incident.status}`,
    `Source: ${incident.source}`,
    `Fingerprint: ${incident.fingerprint}`,
    `Target type: ${notification.target_type}`,
    `Repeat iteration: ${notification.repeat_iteration ?? 0}`,
    `Incident ID: ${incident.id}`,
    incidentUrl ? `Open: ${incidentUrl}` : null,
    incident.description ? "" : null,
    incident.description,
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}

function buildIncidentUrl(incidentId: string): string | null {
  const baseUrl = readWebAppBaseUrl();

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/incidents/${incidentId}`;
}

const responderTargetTypes = new Set(["primary_on_call", "secondary_on_call", "user", "team"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only a page to a specific responder about a still-triggered incident gets an acknowledge link;
// channel and webhook targets have no single user the acknowledgement could be attributed to.
export function buildResponseActions(
  notification: Pick<NotificationLog, "event_action" | "target_id" | "target_type">,
  incident: Pick<IncidentNotificationContext, "id" | "status">,
): NotificationResponseActions | null {
  const baseUrl = readWebAppBaseUrl();

  if (
    !baseUrl
    || notification.event_action !== "incident.created"
    || incident.status !== "triggered"
    || !responderTargetTypes.has(notification.target_type)
    || !notification.target_id
    || !uuidPattern.test(notification.target_id)
  ) {
    return null;
  }

  const token = createIncidentActionToken({ incidentId: incident.id, userId: notification.target_id });

  return {
    ackUrl: `${baseUrl}/ack/${token}`,
    // ponytail: assumes the API is served under the web origin at /api/v1 (true for dev/prod nginx); add an API base URL env if that changes.
    voiceAckUrl: `${baseUrl}/api/v1/incident-actions/voice/${token}`,
  };
}

function readWebAppBaseUrl(): string | null {
  const baseUrl = process.env.WEB_APP_BASE_URL ?? process.env.APP_BASE_URL;
  return baseUrl ? baseUrl.replace(/\/+$/, "") : null;
}

function providerNameForChannel(channel: NotificationLog["channel"]): string {
  if (channel === "sms") {
    return "twilio_sms";
  }

  if (channel === "phone") {
    return "twilio_phone";
  }

  return channel;
}
