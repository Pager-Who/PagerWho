import type {
  PaginatedStuckEscalations,
  PaginatedWorkerRunLogs,
  StuckEscalationQuery,
  WorkerHealth,
  WorkerReadiness,
  WorkerReadinessQuery,
  WorkerRunLogQuery,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createWorkerApi(client: ApiClient) {
  return {
    getWorkerHealth() {
      return client.request<WorkerHealth>("/workers/health");
    },
    getWorkerReadiness(query: Partial<WorkerReadinessQuery> = {}) {
      return client.request<WorkerReadiness>(`/workers/readiness${buildQueryString({
        response_status: "always_200",
        ...query,
      })}`);
    },
    listWorkerRuns(query: Partial<WorkerRunLogQuery> = {}) {
      return client.request<PaginatedWorkerRunLogs>(`/workers/runs${buildQueryString(query)}`);
    },
    listStuckEscalations(query: Partial<StuckEscalationQuery> = {}) {
      return client.request<PaginatedStuckEscalations>(`/workers/stuck-escalations${buildQueryString(query)}`);
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
