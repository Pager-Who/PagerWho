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
  isHttpUrl,
  shouldUseLogDelivery,
} from "./notification-provider";

export class WebhookProvider implements NotificationProvider {
  async send(message: NotificationProviderMessage): Promise<NotificationProviderResult> {
    const isConfigured = isHttpUrl(message.targetAddress);

    assertProviderConfigured("webhook", isConfigured);

    if (!isConfigured || shouldUseLogDelivery(isConfigured)) {
      return createLoggedProviderResult("webhook", message);
    }

    const response = await fetchWithProviderTimeout(message.targetAddress, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        subject: message.subject,
        body: message.body,
        incident: message.incident,
        notification: message.notification,
      }),
    });

    if (!response.ok) {
      throw buildProviderHttpError("Webhook notification", response, await response.text());
    }

    return {
      providerMessageId: `webhook-${response.status}-${Date.now()}`,
    };
  }
}
