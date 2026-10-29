import type { Page } from "@playwright/test";
import { apiPattern, fulfillJson, fulfillUnhandledApi } from "./api";
import {
  e2eActiveWorkspace,
  e2eEscalationPolicyId,
  e2eIncidentId,
  e2eNow,
  e2eService,
  e2eServiceId,
  e2eUserId,
  e2eWebhookEndpointId,
  e2eWebhookEventId,
  e2eWorkspaceId,
} from "./test-data";

type WebhookPayload = {
  description?: string;
  event_key?: string;
  priority?: "P1" | "P2" | "P3" | "P4" | "P5";
  severity?: "critical" | "high" | "medium" | "low";
  source?: string;
  title?: string;
};

export async function mockServiceWebhookFlow(page: Page) {
  let webhookIncident: ReturnType<typeof createWebhookIncident> | null = null;

  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path === "/api/v1/me/workspaces") {
      return fulfillJson(route, {
        data: [e2eActiveWorkspace],
      });
    }

    if (method === "GET" && path === "/api/v1/me/invites") {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/services") {
      return fulfillJson(route, {
        data: {
          items: [createServiceWithIncidentCount(webhookIncident ? 1 : 0)],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === `/api/v1/services/${e2eServiceId}`) {
      return fulfillJson(route, {
        data: createServiceWithIncidentCount(webhookIncident ? 1 : 0),
      });
    }

    if (method === "GET" && path === `/api/v1/services/${e2eServiceId}/incidents`) {
      return fulfillJson(route, {
        data: {
          items: webhookIncident ? [webhookIncident] : [],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === `/api/v1/services/${e2eServiceId}/webhook-endpoints`) {
      return fulfillJson(route, {
        data: [e2eWebhookEndpoint],
      });
    }

    if (method === "POST" && path === `/api/v1/webhooks/endpoints/${e2eWebhookEndpointId}/rotate-secret`) {
      return fulfillJson(route, {
        data: {
          ...e2eWebhookEndpoint,
          secret: "e2e-webhook-secret",
          url_with_secret: `${e2eWebhookEndpoint.url}?token=e2e-webhook-secret`,
        },
      });
    }

    if (method === "GET" && path === `/api/v1/services/${e2eServiceId}/webhook-integrations`) {
      return fulfillJson(route, { data: [] });
    }

    if (method === "GET" && path === "/api/v1/teams") {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/users") {
      return fulfillJson(route, {
        data: [e2eUser],
      });
    }

    if (method === "GET" && path === "/api/v1/escalation-policies") {
      return fulfillJson(route, {
        data: [e2eEscalationPolicy],
      });
    }

    if (method === "GET" && path === `/api/v1/escalation-policies/${e2eEscalationPolicyId}`) {
      return fulfillJson(route, {
        data: e2eEscalationPolicy,
      });
    }

    if (method === "GET" && path === "/api/v1/on-call/schedules") {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/on-call") {
      return fulfillJson(route, {
        data: {
          primary_user_id: e2eUserId,
          secondary_user_id: null,
          resolved_at: e2eNow,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/incidents") {
      const shouldReturnTriggered = url.searchParams.get("status") === "triggered";

      return fulfillJson(route, {
        data: {
          items: shouldReturnTriggered && webhookIncident ? [webhookIncident] : [],
          next_cursor: null,
        },
      });
    }

    if (method === "POST" && path === `/api/v1/webhooks/endpoints/${e2eWebhookEndpointId}/test`) {
      const payload = request.postDataJSON() as WebhookPayload;
      webhookIncident = createWebhookIncident(payload);

      return fulfillJson(route, {
        data: {
          event_id: e2eWebhookEventId,
          incident: webhookIncident,
          normalized_event: {
            title: webhookIncident.title,
            description: webhookIncident.description,
            severity: webhookIncident.severity,
            priority: webhookIncident.priority,
            source: webhookIncident.source,
            event_key: payload.event_key ?? "service-webhook-smoke-e2e",
            fingerprint: webhookIncident.fingerprint,
            raw_payload: payload,
          },
          action: "created",
        },
      });
    }

    if (method === "GET" && path === `/api/v1/incidents/${e2eIncidentId}/detail`) {
      return fulfillJson(route, {
        data: {
          incident: webhookIncident,
          escalation: {
            incident_id: e2eIncidentId,
            policy_id: e2eEscalationPolicyId,
            current_step: 1,
            repeat_iteration: 0,
            next_run_at: e2eNow,
            status: "active",
            created_at: e2eNow,
            updated_at: e2eNow,
          },
          timeline_summary: {
            total: 1,
            latest_created_at: e2eNow,
          },
          notification_summary: {
            total: 0,
            by_status: [],
          },
        },
      });
    }

    if (method === "GET" && path === `/api/v1/incidents/${e2eIncidentId}/timeline`) {
      return fulfillJson(route, {
        data: {
          items: [{
            id: "00000000-0000-4000-8000-000000000801",
            incident_id: e2eIncidentId,
            type: "incident_created",
            message: "Incident created from webhook",
            metadata: null,
            actor_user_id: null,
            created_at: e2eNow,
          }],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === `/api/v1/incidents/${e2eIncidentId}/notifications`) {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    return fulfillUnhandledApi(route);
  });
}

const e2eWebhookEndpoint = {
  id: e2eWebhookEndpointId,
  service_id: e2eServiceId,
  name: "Default webhook",
  url: `http://127.0.0.1:3000/api/v1/webhooks/${e2eWebhookEndpointId}`,
  has_secret: true,
  created_at: e2eNow,
  disabled_at: null,
};

const e2eEscalationPolicy = {
  id: e2eEscalationPolicyId,
  workspace_id: e2eWorkspaceId,
  name: "Checkout escalation",
  repeat_enabled: true,
  repeat_interval_seconds: 600,
  repeat_limit: 3,
  steps: [],
  created_at: e2eNow,
  updated_at: e2eNow,
};

const e2eUser = {
  id: e2eUserId,
  email: "responder@example.com",
  name: "E2E Responder",
  notification_settings: {
    contacts: {
      has_slack_webhook_url: false,
      has_email_delivery_webhook_url: false,
      has_phone_number: false,
      phone_number_verified: false,
      phone_number_masked: null,
    },
    preferences: [],
  },
  created_at: e2eNow,
  updated_at: e2eNow,
};

function createServiceWithIncidentCount(openIncidentCount: number) {
  return {
    ...e2eService,
    open_incident_count: openIncidentCount,
    status: openIncidentCount > 0 ? "critical" : "normal",
  };
}

function createWebhookIncident(payload: WebhookPayload = {}) {
  return {
    id: e2eIncidentId,
    workspace_id: e2eWorkspaceId,
    service_id: e2eServiceId,
    title: payload.title ?? "Checkout API latency spike",
    description: payload.description ?? "Created from the service webhook test panel",
    severity: payload.severity ?? "critical",
    priority: payload.priority ?? "P1",
    status: "triggered",
    source: payload.source ?? "service-detail-test",
    fingerprint: payload.event_key ?? "service-webhook-smoke-e2e",
    dedup_key: payload.event_key ?? "service-webhook-smoke-e2e",
    acknowledged_by: null,
    acknowledged_at: null,
    resolved_by: null,
    resolved_at: null,
    created_at: e2eNow,
    updated_at: e2eNow,
  };
}
