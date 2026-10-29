import type {
  NotificationProvider,
  NotificationProviderMessage,
  NotificationProviderResult,
} from "./notification-provider";
import {
  assertProviderConfigured,
  buildProviderHttpError,
  createLoggedProviderResult,
  fetchWithProviderTimeout,
  shouldUseLogDelivery,
} from "./notification-provider";

export class SlackProvider implements NotificationProvider {
  async send(message: NotificationProviderMessage): Promise<NotificationProviderResult> {
    const webhookUrl = resolveSlackWebhookUrl(message);
    const isConfigured = Boolean(webhookUrl);

    assertProviderConfigured("slack", isConfigured);

    if (shouldUseLogDelivery(isConfigured)) {
      return createLoggedProviderResult("slack", message);
    }

    if (webhookUrl) {
      await postSlackIncomingWebhook(webhookUrl, message);
      return {
        providerMessageId: `slack-webhook-${Date.now()}`,
      };
    }

    return createLoggedProviderResult("slack", message);
  }
}

function resolveSlackWebhookUrl(message: NotificationProviderMessage): string | null {
  if (isSlackIncomingWebhookUrl(message.targetAddress)) {
    return message.targetAddress;
  }

  if (message.notification.targetType !== "team_channel") {
    return null;
  }

  const projectWebhookUrl = message.providerSettings?.slack?.webhookUrl;
  return projectWebhookUrl && isSlackIncomingWebhookUrl(projectWebhookUrl) ? projectWebhookUrl : null;
}

async function postSlackIncomingWebhook(
  webhookUrl: string,
  message: NotificationProviderMessage,
): Promise<void> {
  const response = await fetchWithProviderTimeout(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: message.subject,
      blocks: buildSlackBlocks(message),
    }),
  });

  if (!response.ok) {
    throw buildProviderHttpError("Slack webhook", response, await response.text());
  }
}

function buildSlackBlocks(message: NotificationProviderMessage): Record<string, unknown>[] {
  const fields = [
    `*Service:*\n${message.incident.service.name}`,
    `*Severity:*\n${message.incident.severity}`,
    `*Priority:*\n${message.incident.priority}`,
    `*Status:*\n${message.incident.status}`,
    `*Source:*\n${message.incident.source}`,
    `*Target:*\n${message.notification.targetType}`,
    `*Repeat:*\n${message.notification.repeatIteration}`,
  ].map((text) => ({
    type: "mrkdwn",
    text,
  }));
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: truncate(message.subject, 150),
      },
    },
    {
      type: "section",
      fields,
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Incident ID:* \`${message.incident.id}\``,
          `*Fingerprint:* \`${message.incident.fingerprint}\``,
          message.incident.description ? `*Description:* ${message.incident.description}` : null,
        ].filter((line): line is string => Boolean(line)).join("\n"),
      },
    },
  ];

  if (message.incident.url) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Open incident",
          },
          url: message.incident.url,
        },
      ],
    });
  }

  return blocks;
}

function isSlackIncomingWebhookUrl(value: string): boolean {
  return value.startsWith("https://hooks.slack.com/services/");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
