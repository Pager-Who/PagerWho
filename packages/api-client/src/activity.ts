import type { ActivityLog, ActivityLogQuery, AuditLogQuery, PaginatedActivityLogs } from "@im/contracts";

import type { ApiClient } from "./client";

export function createActivityLogApi(client: ApiClient) {
  return {
    listActivityLogs(filters: Partial<ActivityLogQuery> = {}) {
      return client.request<PaginatedActivityLogs>(`/activity-logs${buildQueryString(filters)}`);
    },
    listActivityLogsForResource(resourceType: ActivityLog["resource_type"], resourceId: string) {
      return client.request<PaginatedActivityLogs>(
        `/activity-logs${buildQueryString({ resource_type: resourceType, resource_id: resourceId })}`,
      );
    },
  };
}

export function createAuditLogApi(client: ApiClient) {
  return {
    listAuditLogs(filters: Partial<AuditLogQuery> = {}) {
      return client.request<PaginatedActivityLogs>(`/audit-logs${buildQueryString(filters)}`);
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
