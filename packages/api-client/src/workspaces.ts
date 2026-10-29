import type {
  CreateWorkspaceInviteRequest,
  CreateWorkspaceRequest,
  UpdateWorkspaceNotificationProviderSettingRequest,
  UpdateWorkspaceWebhookIntegrationRequest,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceNotificationProvider,
  WorkspaceNotificationProviderSetting,
  WorkspaceWebhookIntegration,
  WorkspaceWebhookIntegrationType,
  WorkspaceUsage,
  UpdateWorkspaceMemberRolesRequest,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createWorkspaceApi(client: ApiClient) {
  return {
    createWorkspace(input: CreateWorkspaceRequest) {
      return client.request<Workspace>("/workspaces", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    listMyWorkspaces() {
      return client.request<Workspace[]>("/me/workspaces");
    },
    listMyInvites() {
      return client.request<WorkspaceInvite[]>("/me/invites");
    },
    acceptInvite(inviteId: string) {
      return client.request<WorkspaceMember>(`/me/invites/${inviteId}/accept`, {
        method: "POST",
      });
    },
    declineInvite(inviteId: string) {
      return client.request<WorkspaceInvite>(`/me/invites/${inviteId}/decline`, {
        method: "POST",
      });
    },
    listMembers(workspaceId: string) {
      return client.request<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`);
    },
    listInvites(workspaceId: string) {
      return client.request<WorkspaceInvite[]>(`/workspaces/${workspaceId}/invites`);
    },
    getUsage(workspaceId: string) {
      return client.request<WorkspaceUsage>(`/workspaces/${workspaceId}/usage`);
    },
    createInvite(workspaceId: string, input: CreateWorkspaceInviteRequest) {
      return client.request<WorkspaceInvite>(`/workspaces/${workspaceId}/invites`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    revokeInvite(workspaceId: string, inviteId: string) {
      return client.request<WorkspaceInvite>(`/workspaces/${workspaceId}/invites/${inviteId}`, {
        method: "DELETE",
      });
    },
    updateMemberRoles(workspaceId: string, userId: string, input: UpdateWorkspaceMemberRolesRequest) {
      return client.request<WorkspaceMember>(`/workspaces/${workspaceId}/members/${userId}/roles`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    listNotificationProviderSettings(workspaceId: string) {
      return client.request<WorkspaceNotificationProviderSetting[]>(
        `/workspaces/${workspaceId}/notification-provider-settings`,
      );
    },
    updateNotificationProviderSetting(
      workspaceId: string,
      provider: WorkspaceNotificationProvider,
      input: UpdateWorkspaceNotificationProviderSettingRequest,
    ) {
      return client.request<WorkspaceNotificationProviderSetting>(
        `/workspaces/${workspaceId}/notification-provider-settings/${provider}`,
        {
          method: "PUT",
          body: JSON.stringify(input),
        },
      );
    },
    listWebhookIntegrations(workspaceId: string) {
      return client.request<WorkspaceWebhookIntegration[]>(`/workspaces/${workspaceId}/webhook-integrations`);
    },
    updateWebhookIntegration(
      workspaceId: string,
      type: WorkspaceWebhookIntegrationType,
      input: UpdateWorkspaceWebhookIntegrationRequest,
    ) {
      return client.request<WorkspaceWebhookIntegration>(`/workspaces/${workspaceId}/webhook-integrations/${type}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
    },
  };
}
