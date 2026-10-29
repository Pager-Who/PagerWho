import type { Page } from "@playwright/test";
import { apiPattern, fulfillJson, fulfillUnhandledApi } from "./api";
import {
  e2eActiveWorkspace,
  e2eIncidentId,
  e2eNow,
  e2eService,
  e2eServiceId,
  e2eUserId,
  e2eWorkspaceId,
} from "./test-data";

type IncidentStatus = "triggered" | "acknowledged" | "resolved";

type MockIncident = {
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  dedup_key: string | null;
  description: string | null;
  fingerprint: string;
  id: string;
  priority: "P1" | "P2" | "P3" | "P4" | "P5";
  resolved_at: string | null;
  resolved_by: string | null;
  service_id: string;
  severity: "critical" | "high" | "medium" | "low";
  source: string;
  status: IncidentStatus;
  title: string;
  updated_at: string;
  workspace_id: string;
};

type MockTimelineEntry = {
  actor_user_id: string | null;
  created_at: string;
  id: string;
  incident_id: string;
  message: string;
  metadata: unknown;
  type: string;
};

type CreateIncidentBody = {
  description?: string | null;
  priority?: MockIncident["priority"];
  service_id: string;
  severity: MockIncident["severity"];
  source?: string;
  title: string;
};

export async function mockIncidentLifecycleFlow(page: Page, options: { seedIncident?: boolean } = {}) {
  let incident: MockIncident | null = options.seedIncident
    ? createIncident({
      priority: "P1",
      service_id: e2eServiceId,
      severity: "critical",
      source: "overview-smoke",
      title: "Checkout API is failing",
    })
    : null;
  let timeline: MockTimelineEntry[] = incident
    ? [createTimelineEntry("incident_created", "Incident created", incident.id)]
    : [];
  let currentEscalationStep = 1;

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
          items: [{
            ...e2eService,
            open_incident_count: incident && incident.status !== "resolved" ? 1 : 0,
            status: incident && incident.status !== "resolved" ? "major" : "normal",
          }],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/on-call/schedules") {
      return fulfillJson(route, { data: [] });
    }

    if (method === "GET" && path === "/api/v1/escalation-policies") {
      return fulfillJson(route, { data: [] });
    }

    if (method === "GET" && path === `/api/v1/workspaces/${e2eWorkspaceId}/members`) {
      return fulfillJson(route, { data: [] });
    }

    if (method === "GET" && path === "/api/v1/users") {
      return fulfillJson(route, { data: [] });
    }

    if (method === "GET" && path === "/api/v1/notifications/dead-letter") {
      return fulfillJson(route, { data: { items: [], next_cursor: null } });
    }

    if (method === "GET" && path === "/api/v1/workers/stuck-escalations") {
      return fulfillJson(route, { data: { items: [], next_cursor: null } });
    }

    if (method === "GET" && path === "/api/v1/on-call/current") {
      return fulfillJson(route, { data: null });
    }

    if (method === "GET" && path === "/api/v1/incidents") {
      return fulfillJson(route, {
        data: {
          items: filterIncidents(incident ? [incident] : [], url),
          next_cursor: null,
        },
      });
    }

    if (method === "POST" && path === "/api/v1/incidents") {
      const input = request.postDataJSON() as CreateIncidentBody;
      incident = createIncident(input);
      timeline = [
        createTimelineEntry("incident_created", "Incident created", incident.id),
      ];

      return fulfillJson(route, {
        data: incident,
      }, 201);
    }

    if (method === "GET" && path === `/api/v1/incidents/${e2eIncidentId}/detail`) {
      return fulfillJson(route, {
        data: createIncidentDetail(incident, currentEscalationStep),
      });
    }

    if (method === "GET" && path === `/api/v1/incidents/${e2eIncidentId}/timeline`) {
      return fulfillJson(route, {
        data: {
          items: timeline,
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

    if (method === "POST" && path === `/api/v1/incidents/${e2eIncidentId}/ack`) {
      incident = updateIncidentStatus(incident, "acknowledged");
      timeline = [
        ...timeline,
        createTimelineEntry("incident_acknowledged", "Incident acknowledged", incident.id, e2eUserId),
      ];

      return fulfillJson(route, {
        data: incident,
      });
    }

    if (method === "POST" && path === `/api/v1/incidents/${e2eIncidentId}/resolve`) {
      incident = updateIncidentStatus(incident, "resolved");
      timeline = [
        ...timeline,
        createTimelineEntry("incident_resolved", "Incident resolved", incident.id, e2eUserId),
      ];

      return fulfillJson(route, {
        data: incident,
      });
    }

    if (method === "POST" && path === `/api/v1/incidents/${e2eIncidentId}/escalation/manual-trigger`) {
      const input = request.postDataJSON() as {
        action?: "trigger_current_step" | "advance_to_next_step";
        reason?: string;
        update_current_step?: boolean;
      };
      if (input.action === "advance_to_next_step" || input.update_current_step) {
        currentEscalationStep += 1;
      }
      timeline = [
        ...timeline,
        createTimelineEntry(
          "manual_escalation",
          input.reason ? `Manual escalation: ${input.reason}` : "Manual escalation triggered",
          e2eIncidentId,
          e2eUserId,
        ),
      ];

      return fulfillJson(route, {
        data: createEscalationState(incident, currentEscalationStep),
      });
    }

    if (method === "PATCH" && path === `/api/v1/incidents/${e2eIncidentId}/priority`) {
      const input = request.postDataJSON() as { priority?: MockIncident["priority"] };
      incident = {
        ...(incident ?? createIncident({
          service_id: e2eServiceId,
          title: "Checkout API latency",
          severity: "critical",
        })),
        priority: input.priority ?? "P3",
        updated_at: e2eNow,
      };
      timeline = [
        ...timeline,
        createTimelineEntry("incident_priority_changed", `Priority changed to ${incident.priority}`, incident.id, e2eUserId),
      ];

      return fulfillJson(route, { data: incident });
    }

    return fulfillUnhandledApi(route);
  });
}

function createIncident(input: CreateIncidentBody): MockIncident {
  return {
    id: e2eIncidentId,
    workspace_id: e2eWorkspaceId,
    service_id: input.service_id || e2eServiceId,
    title: input.title,
    description: input.description ?? null,
    severity: input.severity,
    priority: input.priority ?? "P3",
    status: "triggered",
    source: input.source ?? "manual",
    fingerprint: `manual:${e2eIncidentId}`,
    dedup_key: null,
    acknowledged_by: null,
    acknowledged_at: null,
    resolved_by: null,
    resolved_at: null,
    created_at: e2eNow,
    updated_at: e2eNow,
  };
}

function createIncidentDetail(incident: MockIncident | null, currentEscalationStep = 1) {
  if (!incident) {
    return {
      incident: createIncident({
        service_id: e2eServiceId,
        title: "Missing mocked incident",
        severity: "medium",
      }),
      escalation: null,
      timeline_summary: {
        total: 0,
        latest_created_at: null,
      },
      notification_summary: {
        total: 0,
        by_status: [],
      },
    };
  }

  return {
    incident,
    escalation: {
      incident_id: incident.id,
      policy_id: e2eService.escalation_policy_id,
      current_step: currentEscalationStep,
      repeat_iteration: 0,
      next_run_at: incident.status === "resolved" ? null : e2eNow,
      status: incident.status === "resolved" ? "completed" : "active",
      created_at: e2eNow,
      updated_at: incident.updated_at,
    },
    timeline_summary: {
      total: 1,
      latest_created_at: incident.updated_at,
    },
    notification_summary: {
      total: 0,
      by_status: [],
    },
  };
}

function createEscalationState(incident: MockIncident | null, currentEscalationStep: number) {
  const currentIncident = incident ?? createIncident({
    service_id: e2eServiceId,
    title: "Checkout API latency",
    severity: "critical",
  });

  return {
    incident_id: currentIncident.id,
    policy_id: e2eService.escalation_policy_id,
    current_step: currentEscalationStep,
    repeat_iteration: 0,
    next_run_at: e2eNow,
    status: "active",
    created_at: e2eNow,
    updated_at: e2eNow,
  };
}

function updateIncidentStatus(incident: MockIncident | null, status: IncidentStatus): MockIncident {
  const currentIncident = incident ?? createIncident({
    service_id: e2eServiceId,
    title: "Checkout API latency",
    severity: "critical",
  });

  return {
    ...currentIncident,
    status,
    acknowledged_by: status === "acknowledged" || status === "resolved"
      ? currentIncident.acknowledged_by ?? e2eUserId
      : currentIncident.acknowledged_by,
    acknowledged_at: status === "acknowledged" || status === "resolved"
      ? currentIncident.acknowledged_at ?? e2eNow
      : currentIncident.acknowledged_at,
    resolved_by: status === "resolved" ? e2eUserId : currentIncident.resolved_by,
    resolved_at: status === "resolved" ? e2eNow : currentIncident.resolved_at,
    updated_at: e2eNow,
  };
}

function createTimelineEntry(
  type: string,
  message: string,
  incidentId: string,
  actorUserId: string | null = null,
): MockTimelineEntry {
  return {
    id: `${incidentId.slice(0, 34)}${String(message.length).padStart(2, "0")}`,
    incident_id: incidentId,
    type,
    message,
    metadata: null,
    actor_user_id: actorUserId,
    created_at: e2eNow,
  };
}

function filterIncidents(incidents: MockIncident[], url: URL) {
  const status = url.searchParams.get("status");
  const serviceId = url.searchParams.get("service_id");
  const severity = url.searchParams.get("severity");
  const priority = url.searchParams.get("priority");

  return incidents.filter((incident) => {
    if (status === "open" && incident.status === "resolved") return false;
    if (status && status !== "open" && incident.status !== status) return false;
    if (serviceId && incident.service_id !== serviceId) return false;
    if (severity && incident.severity !== severity) return false;
    if (priority && incident.priority !== priority) return false;

    return true;
  });
}
