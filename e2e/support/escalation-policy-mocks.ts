import type { Page } from "@playwright/test";
import { apiPattern, fulfillJson, fulfillUnhandledApi } from "./api";
import {
  e2eActiveWorkspace,
  e2eEscalationPolicyId,
  e2eEscalationPolicyStepOneId,
  e2eEscalationPolicyStepTwoId,
  e2eNow,
  e2eOnCallScheduleId,
  e2eServiceId,
  e2eUserId,
  e2eWorkspaceId,
} from "./test-data";

type PolicyStepInput = {
  delay_seconds: number;
  id?: string;
  step_order: number;
  target_id?: string | null;
  target_type: string;
};

type PolicyInput = {
  name: string;
  repeat_enabled: boolean;
  repeat_interval_seconds?: number | null;
  repeat_limit?: number | null;
  steps: PolicyStepInput[];
  workspace_id: string;
};

export async function mockEscalationPolicyCreateFlow(page: Page) {
  let policy: ReturnType<typeof createPolicy> | null = null;

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

    if (method === "GET" && path === "/api/v1/escalation-policies") {
      return fulfillJson(route, {
        data: policy ? [policy] : [],
      });
    }

    if (method === "POST" && path === "/api/v1/escalation-policies") {
      policy = createPolicy(request.postDataJSON() as PolicyInput);

      return fulfillJson(route, {
        data: policy,
      }, 201);
    }

    if (method === "GET" && path === "/api/v1/on-call/schedules") {
      return fulfillJson(route, {
        data: [e2eOnCallSchedule],
      });
    }

    if (method === "GET" && path === "/api/v1/services") {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/teams") {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/users") {
      return fulfillJson(route, {
        data: [e2eResponderUser],
      });
    }

    if (method === "GET" && path === `/api/v1/workspaces/${e2eWorkspaceId}/members`) {
      return fulfillJson(route, {
        data: [{
          workspace_id: e2eWorkspaceId,
          user_id: e2eUserId,
          role: "responder",
          created_at: e2eNow,
          updated_at: e2eNow,
        }],
      });
    }

    return fulfillUnhandledApi(route);
  });
}

const e2eOnCallSchedule = {
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

const e2eResponderUser = {
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

function createPolicy(input: PolicyInput) {
  return {
    id: e2eEscalationPolicyId,
    workspace_id: input.workspace_id,
    name: input.name,
    repeat_enabled: input.repeat_enabled,
    repeat_interval_seconds: input.repeat_interval_seconds ?? null,
    repeat_limit: input.repeat_limit ?? null,
    steps: input.steps.map((step, index) => ({
      id: index === 0 ? e2eEscalationPolicyStepOneId : e2eEscalationPolicyStepTwoId,
      policy_id: e2eEscalationPolicyId,
      step_order: step.step_order,
      delay_seconds: step.delay_seconds,
      target_type: step.target_type,
      target_id: step.target_id ?? null,
    })),
    created_at: e2eNow,
    updated_at: e2eNow,
  };
}
