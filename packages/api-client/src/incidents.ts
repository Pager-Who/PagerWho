import type {
  CreateIncidentRequest,
  Incident,
  IncidentDetail,
  IncidentEscalationState,
  IncidentFilter,
  IncidentNotificationsQuery,
  IncidentTimelineQuery,
  ManualEscalationRequest,
  PaginatedIncidentNotifications,
  PaginatedIncidentTimelineEntries,
  PaginatedIncidents,
  UpdateIncidentPriorityRequest,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createIncidentApi(client: ApiClient) {
  return {
    listIncidents(filters: Partial<IncidentFilter> = {}) {
      return client.request<PaginatedIncidents>(`/incidents${buildQueryString(filters)}`);
    },
    createIncident(input: CreateIncidentRequest) {
      return client.request<Incident>("/incidents", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    getIncident(incidentId: string) {
      return client.request<Incident>(`/incidents/${incidentId}`);
    },
    getIncidentDetail(incidentId: string) {
      return client.request<IncidentDetail>(`/incidents/${incidentId}/detail`);
    },
    acknowledgeIncident(incidentId: string) {
      return client.request<Incident>(`/incidents/${incidentId}/ack`, {
        method: "POST",
      });
    },
    resolveIncident(incidentId: string) {
      return client.request<Incident>(`/incidents/${incidentId}/resolve`, {
        method: "POST",
      });
    },
    updateIncidentPriority(incidentId: string, input: UpdateIncidentPriorityRequest) {
      return client.request<Incident>(`/incidents/${incidentId}/priority`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    getIncidentTimeline(incidentId: string, query: Partial<IncidentTimelineQuery> = {}) {
      return client.request<PaginatedIncidentTimelineEntries>(
        `/incidents/${incidentId}/timeline${buildQueryString(query)}`,
      );
    },
    getIncidentNotifications(incidentId: string, query: Partial<IncidentNotificationsQuery> = {}) {
      return client.request<PaginatedIncidentNotifications>(
        `/incidents/${incidentId}/notifications${buildQueryString(query)}`,
      );
    },
    getIncidentEscalation(incidentId: string) {
      return client.request<IncidentEscalationState | null>(`/incidents/${incidentId}/escalation`);
    },
    triggerManualEscalation(incidentId: string, input: ManualEscalationRequest) {
      return client.request<IncidentEscalationState>(`/incidents/${incidentId}/escalation/manual-trigger`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  };
}

function buildQueryString(filters: Record<string, unknown>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  return query.size > 0 ? `?${query.toString()}` : "";
}
