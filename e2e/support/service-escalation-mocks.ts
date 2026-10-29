import type { Page } from "@playwright/test";
import type { Service } from "@im/contracts";
import { apiPattern, fulfillJson, fulfillUnhandledApi } from "./api";
import {
  e2eActiveWorkspace,
  e2eEscalationPolicyId,
  e2eEscalationPolicyStepOneId,
  e2eEscalationPolicyStepTwoId,
  e2eNow,
  e2eOnCallScheduleId,
  e2eSecondaryUserId,
  e2eService,
  e2eServiceId,
  e2eUserId,
  e2eWorkspaceId,
} from "./test-data";

type UpdateServiceInput = {
  description?: string | null;
  escalation_policy_id?: string | null;
  name?: string;
  team_id?: string | null;
};

export async function mockServiceEscalationPolicyFlow(page: Page) {
  let service: Service = createService(null);

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

    if (method === "GET" && path === "/api/v1/incidents") {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/services") {
      return fulfillJson(route, {
        data: {
          items: [service],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === `/api/v1/services/${e2eServiceId}`) {
      return fulfillJson(route, {
        data: service,
      });
    }

    if (method === "PUT" && path === `/api/v1/services/${e2eServiceId}`) {
      const input = request.postDataJSON() as UpdateServiceInput;
      service = {
        ...service,
        description: input.description ?? service.description,
        escalation_policy_id: input.escalation_policy_id ?? null,
        name: input.name ?? service.name,
        team_id: input.team_id ?? null,
        updated_at: e2eNow,
      };

      return fulfillJson(route, {
        data: service,
      });
    }

    if (method === "GET" && path === `/api/v1/services/${e2eServiceId}/incidents`) {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === `/api/v1/services/${e2eServiceId}/webhook-endpoints`) {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/teams") {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/users") {
      return fulfillJson(route, {
        data: e2eServiceEscalationUsers,
      });
    }

    if (method === "GET" && path === "/api/v1/escalation-policies") {
      return fulfillJson(route, {
        data: [e2eServiceEscalationPolicy],
      });
    }

    if (method === "GET" && path === `/api/v1/escalation-policies/${e2eEscalationPolicyId}`) {
      return fulfillJson(route, {
        data: e2eServiceEscalationPolicy,
      });
    }

    if (method === "GET" && path === "/api/v1/on-call/schedules") {
      return fulfillJson(route, {
        data: [e2eServiceOnCallSchedule],
      });
    }

    if (method === "GET" && path === "/api/v1/on-call") {
      return fulfillJson(route, {
        data: {
          primary_user_id: e2eUserId,
          secondary_user_id: e2eSecondaryUserId,
          resolved_at: e2eNow,
        },
      });
    }

    return fulfillUnhandledApi(route);
  });
}

const e2eServiceEscalationPolicy = {
  id: e2eEscalationPolicyId,
  workspace_id: e2eWorkspaceId,
  name: "Checkout escalation",
  repeat_enabled: true,
  repeat_interval_seconds: 600,
  repeat_limit: 3,
  steps: [
    {
      id: e2eEscalationPolicyStepOneId,
      policy_id: e2eEscalationPolicyId,
      step_order: 1,
      delay_seconds: 0,
      target_type: "primary_on_call",
      target_id: e2eOnCallScheduleId,
    },
    {
      id: e2eEscalationPolicyStepTwoId,
      policy_id: e2eEscalationPolicyId,
      step_order: 2,
      delay_seconds: 300,
      target_type: "secondary_on_call",
      target_id: e2eOnCallScheduleId,
    },
  ],
  created_at: e2eNow,
  updated_at: e2eNow,
};

const e2eServiceOnCallSchedule = {
  id: e2eOnCallScheduleId,
  workspace_id: e2eWorkspaceId,
  name: "Checkout responders",
  team_id: null,
  service_id: e2eServiceId,
  timezone: "Asia/Seoul",
  rotations: [],
  overrides: [],
  created_at: e2eNow,
  updated_at: e2eNow,
};

const e2eServiceEscalationUsers = [
  {
    id: e2eUserId,
    email: "primary@example.com",
    name: "Primary Responder",
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
  },
  {
    id: e2eSecondaryUserId,
    email: "secondary@example.com",
    name: "Secondary Responder",
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
  },
];

function createService(escalationPolicyId: string | null): Service {
  return {
    ...e2eService,
    escalation_policy_id: escalationPolicyId,
    open_incident_count: 0,
    status: "normal",
  };
}
