import type {
  CreateOnCallOverrideRequest,
  CreateOnCallScheduleRequest,
  CurrentOnCall,
  CurrentOnCallQuery,
  OnCallOverride,
  OnCallSchedule,
  OnCallSchedulePreview,
  OnCallSchedulePreviewQuery,
  UpdateOnCallScheduleRequest,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createOnCallApi(client: ApiClient) {
  return {
    getCurrentOnCall(query: string | CurrentOnCallQuery) {
      const filters = typeof query === "string" ? { service_id: query } : query;

      return client.request<CurrentOnCall>(`/on-call${buildQueryString(filters)}`);
    },
    listOnCallSchedules(filters: { workspace_id?: string } = {}) {
      return client.request<OnCallSchedule[]>(`/on-call/schedules${buildQueryString(filters)}`);
    },
    getOnCallSchedule(scheduleId: string) {
      return client.request<OnCallSchedule>(`/on-call/schedules/${scheduleId}`);
    },
    previewOnCallSchedule(scheduleId: string, query: Partial<OnCallSchedulePreviewQuery> = {}) {
      return client.request<OnCallSchedulePreview>(`/on-call/schedules/${scheduleId}/preview${buildQueryString(query)}`);
    },
    createOnCallSchedule(input: CreateOnCallScheduleRequest) {
      return client.request<OnCallSchedule>("/on-call/schedules", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    updateOnCallSchedule(scheduleId: string, input: UpdateOnCallScheduleRequest) {
      return client.request<OnCallSchedule>(`/on-call/schedules/${scheduleId}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
    },
    deleteOnCallSchedule(scheduleId: string) {
      return client.request<OnCallSchedule>(`/on-call/schedules/${scheduleId}`, {
        method: "DELETE",
      });
    },
    createOnCallOverride(input: CreateOnCallOverrideRequest) {
      return client.request<OnCallOverride>("/on-call/overrides", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    deleteOnCallOverride(overrideId: string) {
      return client.request<OnCallOverride>(`/on-call/overrides/${overrideId}`, {
        method: "DELETE",
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
