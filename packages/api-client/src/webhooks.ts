import type { WebhookEndpoint, WebhookEndpointWithSecret, WebhookIngestionResult } from "@im/contracts";

import type { ApiClient } from "./client";

export function createWebhookApi(client: ApiClient) {
  return {
    receiveWebhook(endpointId: string, payload: unknown, token?: string) {
      const suffix = token ? `?token=${encodeURIComponent(token)}` : "";

      return client.request<WebhookIngestionResult>(`/webhooks/${endpointId}${suffix}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    testWebhookEndpoint(endpointId: string, payload: unknown) {
      return client.request<WebhookIngestionResult>(`/webhooks/endpoints/${endpointId}/test`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    rotateWebhookEndpointSecret(endpointId: string) {
      return client.request<WebhookEndpointWithSecret>(`/webhooks/endpoints/${endpointId}/rotate-secret`, {
        method: "POST",
      });
    },
    deleteWebhookEndpoint(endpointId: string) {
      return client.request<WebhookEndpoint>(`/webhooks/endpoints/${endpointId}`, {
        method: "DELETE",
      });
    },
    disableWebhookEndpoint(endpointId: string) {
      return client.request<WebhookEndpoint>(`/webhooks/endpoints/${endpointId}/disable`, {
        method: "POST",
      });
    },
  };
}
