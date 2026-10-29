import type { WorkflowEvent, WorkflowTrigger } from "@im/contracts";
import { describe, expect, it } from "vitest";

import { WorkflowError } from "./workflow.errors";
import { matchesTrigger, normalizeWorkflowDefinition } from "./workflow.service";

const baseEvent: WorkflowEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  activity_log_id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "33333333-3333-4333-8333-333333333333",
  action: "incident.created",
  resource_type: "incident",
  resource_id: "44444444-4444-4444-8444-444444444444",
  actor_user_id: "55555555-5555-4555-8555-555555555555",
  metadata: {
    priority: "P1",
    service_id: "66666666-6666-4666-8666-666666666666",
    nested: {
      value: "match",
    },
  },
  origin: "activity",
  occurred_at: "2026-06-19T00:00:00.000Z",
  processed_at: null,
  created_at: "2026-06-19T00:00:00.000Z",
};

const baseTrigger: WorkflowTrigger = {
  id: "77777777-7777-4777-8777-777777777777",
  workflow_id: "88888888-8888-4888-8888-888888888888",
  trigger_key: "trigger_1",
  event_action: "incident.created",
  resource_type: "incident",
  filters: [],
  entry_action_key: "action_1",
  created_at: "2026-06-19T00:00:00.000Z",
};

describe("matchesTrigger", () => {
  it("matches action and resource type without filters", () => {
    expect(matchesTrigger(baseEvent, baseTrigger)).toBe(true);
  });

  it("rejects non-matching action or resource type", () => {
    expect(matchesTrigger(baseEvent, { ...baseTrigger, event_action: "incident.resolved" })).toBe(false);
    expect(matchesTrigger(baseEvent, { ...baseTrigger, resource_type: "service" })).toBe(false);
  });

  it("matches metadata equals, in, and exists filters", () => {
    expect(matchesTrigger(baseEvent, {
      ...baseTrigger,
      filters: [
        {
          field: "metadata.priority",
          operator: "equals",
          value: "P1",
        },
        {
          field: "metadata.service_id",
          operator: "in",
          value: ["66666666-6666-4666-8666-666666666666"],
        },
        {
          field: "metadata.nested.value",
          operator: "exists",
        },
      ],
    })).toBe(true);
  });

  it("rejects when any metadata filter misses", () => {
    expect(matchesTrigger(baseEvent, {
      ...baseTrigger,
      filters: [
        {
          field: "metadata.priority",
          operator: "equals",
          value: "P5",
        },
      ],
    })).toBe(false);
  });
});

describe("normalizeWorkflowDefinition", () => {
  it("normalizes a reusable integration webhook action without storing a URL", () => {
    const definition = normalizeWorkflowDefinition([{
      event_action: "incident.created",
      resource_type: "incident",
      filters: [],
      entry_action_key: "send_slack",
    }], [{
      action_key: "send_slack",
      type: "integration_webhook",
      config: {
        target: { integration_type: "slack" },
        body: { payload: { text: "{{event.metadata.priority}} incident" } },
      },
    }]);

    expect(definition.actions[0]?.config).toEqual({
      target: { integration_type: "slack" },
      body: { payload: { text: "{{event.metadata.priority}} incident" } },
    });
  });

  it("keeps per-trigger entry action keys", () => {
    const definition = normalizeWorkflowDefinition([
      {
        trigger_key: "trigger_p1",
        event_action: "incident.created",
        resource_type: "incident",
        filters: [{ field: "metadata.priority", operator: "equals", value: "P1" }],
        entry_action_key: "page_primary",
      },
      {
        trigger_key: "trigger_p2",
        event_action: "incident.created",
        resource_type: "incident",
        filters: [{ field: "metadata.priority", operator: "equals", value: "P2" }],
        entry_action_key: "notify_webhook",
      },
    ], [
      {
        action_key: "page_primary",
        type: "incident_manual_escalation",
        config: { action: "advance_to_next_step" },
        next_action_key: null,
        failure_action_key: null,
      },
      {
        action_key: "notify_webhook",
        type: "http_request",
        config: { method: "POST", url: "https://example.com/workflow" },
        next_action_key: null,
        failure_action_key: null,
      },
    ]);

    expect(definition.triggers.map((trigger) => trigger.entry_action_key)).toEqual(["page_primary", "notify_webhook"]);
  });

  it("allows triggers without entry actions", () => {
    const definition = normalizeWorkflowDefinition([
      {
        event_action: "incident.created",
        resource_type: "incident",
        filters: [],
      },
    ], [
      {
        action_key: "first_action",
        type: "http_request",
        config: { method: "POST", url: "https://example.com/workflow" },
      },
    ]);

    expect(definition.triggers[0]?.trigger_key).toBe("trigger_1");
    expect(definition.triggers[0]?.entry_action_key).toBeNull();
  });

  it("rejects trigger entries that point to missing actions", () => {
    expect(() => normalizeWorkflowDefinition([
      {
        event_action: "incident.created",
        resource_type: "incident",
        filters: [],
        entry_action_key: "missing_action",
      },
    ], [
      {
        action_key: "action_1",
        type: "http_request",
        config: { method: "POST", url: "https://example.com/workflow" },
        next_action_key: null,
      },
    ])).toThrow(WorkflowError);
  });

  it("rejects action cycles", () => {
    expect(() => normalizeWorkflowDefinition([
      {
        event_action: "incident.created",
        resource_type: "incident",
        filters: [],
        entry_action_key: "action_1",
      },
    ], [
      {
        action_key: "action_1",
        type: "condition",
        config: { field: "metadata.priority", operator: "equals", value: "P1" },
        next_action_key: "action_2",
      },
      {
        action_key: "action_2",
        type: "http_request",
        config: { method: "POST", url: "https://example.com/workflow" },
        next_action_key: "action_1",
      },
    ])).toThrow(/cycle/);
  });

  it("allows actions that are not connected to any trigger", () => {
    const definition = normalizeWorkflowDefinition([
      {
        event_action: "incident.created",
        resource_type: "incident",
        filters: [],
        entry_action_key: "action_1",
      },
    ], [
      {
        action_key: "action_1",
        type: "http_request",
        config: { method: "POST", url: "https://example.com/workflow" },
        next_action_key: null,
      },
      {
        action_key: "orphan",
        type: "incident_ack",
        config: {},
      },
    ]);

    expect(definition.actions.map((action) => action.action_key)).toEqual(["action_1", "orphan"]);
  });

  it("normalizes service create action into structured body config", () => {
    const definition = normalizeWorkflowDefinition([
      {
        event_action: "incident.created",
        resource_type: "incident",
        filters: [],
        entry_action_key: "create_service",
      },
    ], [
      {
        action_key: "create_service",
        type: "service_create",
        config: {
          body: {
            description: "Created by workflow",
            name: "Workflow service",
          },
        },
        next_action_key: null,
      },
    ]);

    expect(definition.actions[0]?.config).toEqual({
      body: {
        description: "Created by workflow",
        name: "Workflow service",
      },
    });
  });

  it("normalizes HTTP request config without mixing request body with method or URL", () => {
    const definition = normalizeWorkflowDefinition([
      {
        event_action: "incident.created",
        resource_type: "incident",
        filters: [],
        entry_action_key: "post_slack",
      },
    ], [
      {
        action_key: "post_slack",
        type: "http_request",
        config: {
          request: {
            method: "POST",
            timeout_ms: 12000,
            url: "https://slack.com/api/chat.postMessage",
          },
          headers: {
            Authorization: "Bearer token",
            "Content-Type": "application/json",
          },
          body: {
            channel: "#alerts",
            text: "Incident: {{event.resource_id}}",
          },
        },
        next_action_key: null,
      },
    ]);

    expect(definition.actions[0]?.config).toEqual({
      request: {
        method: "POST",
        timeout_ms: 12000,
        url: "https://slack.com/api/chat.postMessage",
      },
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: {
        channel: "#alerts",
        text: "Incident: {{event.resource_id}}",
      },
    });
  });

  it("allows templated targets for CRUD actions", () => {
    const definition = normalizeWorkflowDefinition([
      {
        event_action: "service.created",
        resource_type: "service",
        filters: [],
        entry_action_key: "delete_service",
      },
    ], [
      {
        action_key: "delete_service",
        type: "service_delete",
        config: {
          target: {
            service_id: "{{event.resource_id}}",
          },
        },
        next_action_key: null,
      },
    ]);

    expect(definition.actions[0]?.config).toEqual({
      target: {
        service_id: "{{event.resource_id}}",
      },
    });
  });

  it("normalizes escalation and on-call JSON bodies", () => {
    const definition = normalizeWorkflowDefinition([
      {
        event_action: "incident.created",
        resource_type: "incident",
        filters: [],
        entry_action_key: "create_policy",
      },
    ], [
      {
        action_key: "create_policy",
        type: "escalation_policy_create",
        config: {
          body: {
            name: "Workflow policy",
            steps: [
              {
                delay_seconds: 0,
                step_order: 1,
                target_id: "{{event.actor_user_id}}",
                target_type: "user",
              },
            ],
          },
        },
        next_action_key: "create_schedule",
      },
      {
        action_key: "create_schedule",
        type: "on_call_schedule_create",
        config: {
          body: {
            name: "Workflow schedule",
            rotations: [
              {
                layer: "primary",
                participants: [],
                rotation_interval: 1,
                rotation_type: "weekly",
                starts_at: "2026-06-19T00:00:00.000Z",
                timezone: "Asia/Seoul",
              },
            ],
            timezone: "Asia/Seoul",
          },
        },
        next_action_key: null,
      },
    ]);

    expect(definition.actions.map((action) => action.type)).toEqual([
      "escalation_policy_create",
      "on_call_schedule_create",
    ]);
  });
});
