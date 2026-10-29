import type {
  PaginatedPlatformUsers,
  PaginatedPlatformWorkspaces,
  PlatformListUsersQuery,
  PlatformListWorkspacesQuery,
  PlatformDiagnostics,
  PlatformDiagnosticsQuery,
  PlatformInspectorQuery,
  PlatformInspectorResult,
  PlatformResourceList,
  PlatformResourceListQuery,
  PlatformMe,
  PlatformOverview,
  PlatformReasonRequest,
  PlatformSendAuthEmailRequest,
  PlatformUpdateWorkspaceMemberRolesRequest,
  PlatformUpdateWorkspaceQuotaOverrideRequest,
  PlatformUserDetail,
  PlatformWorkspaceDetail,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createPlatformApi(client: ApiClient) {
  return {
    getMe() {
      return client.request<PlatformMe>("/platform/me");
    },
    getOverview() {
      return client.request<PlatformOverview>("/platform/overview");
    },
    getDiagnostics(query: Partial<PlatformDiagnosticsQuery> = {}) {
      return client.request<PlatformDiagnostics>(`/platform/diagnostics${buildQueryString(query)}`);
    },
    inspect(query: PlatformInspectorQuery) {
      return client.request<PlatformInspectorResult>(`/platform/inspect${buildQueryString(query)}`);
    },
    listResources(query: PlatformResourceListQuery) {
      return client.request<PlatformResourceList>(`/platform/resources${buildQueryString(query)}`);
    },
    listUsers(query: Partial<PlatformListUsersQuery> = {}) {
      return client.request<PaginatedPlatformUsers>(`/platform/users${buildQueryString(query)}`);
    },
    getUser(userId: string) {
      return client.request<PlatformUserDetail>(`/platform/users/${userId}`);
    },
    suspendUser(userId: string, input: PlatformReasonRequest) {
      return client.request<PlatformUserDetail>(`/platform/users/${userId}/suspend`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    restoreUser(userId: string, input: PlatformReasonRequest) {
      return client.request<PlatformUserDetail>(`/platform/users/${userId}/restore`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    revokeUserSessions(userId: string, input: PlatformReasonRequest) {
      return client.request<PlatformUserDetail>(`/platform/users/${userId}/sessions/revoke`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    sendAuthEmail(userId: string, input: PlatformSendAuthEmailRequest) {
      return client.request<PlatformUserDetail>(`/platform/users/${userId}/auth-email`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    retryNotification(notificationId: string, input: PlatformReasonRequest) {
      return client.request<PlatformDiagnostics>(`/platform/diagnostics/notifications/${notificationId}/retry`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    listWorkspaces(query: Partial<PlatformListWorkspacesQuery> = {}) {
      return client.request<PaginatedPlatformWorkspaces>(`/platform/workspaces${buildQueryString(query)}`);
    },
    getWorkspace(workspaceId: string) {
      return client.request<PlatformWorkspaceDetail>(`/platform/workspaces/${workspaceId}`);
    },
    updateWorkspaceQuotaOverride(workspaceId: string, input: PlatformUpdateWorkspaceQuotaOverrideRequest) {
      return client.request<PlatformWorkspaceDetail>(`/platform/workspaces/${workspaceId}/quota-override`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    suspendWorkspace(workspaceId: string, input: PlatformReasonRequest) {
      return client.request<PlatformWorkspaceDetail>(`/platform/workspaces/${workspaceId}/suspend`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    restoreWorkspace(workspaceId: string, input: PlatformReasonRequest) {
      return client.request<PlatformWorkspaceDetail>(`/platform/workspaces/${workspaceId}/restore`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    updateWorkspaceMemberRoles(
      workspaceId: string,
      userId: string,
      input: PlatformUpdateWorkspaceMemberRolesRequest,
    ) {
      return client.request<PlatformWorkspaceDetail>(`/platform/workspaces/${workspaceId}/members/${userId}/roles`, {
        method: "PATCH",
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
