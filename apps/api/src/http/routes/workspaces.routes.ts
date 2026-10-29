import { Router } from "express";

import {
  createWorkspaceHandler,
  createWorkspaceInviteHandler,
  getWorkspaceUsageHandler,
  listWorkspaceNotificationProviderSettingsHandler,
  listWorkspaceInvitesHandler,
  listWorkspaceMembersHandler,
  listWorkspaceWebhookIntegrationsHandler,
  revokeWorkspaceInviteHandler,
  updateWorkspaceMemberRolesHandler,
  updateWorkspaceNotificationProviderSettingHandler,
  updateWorkspaceWebhookIntegrationHandler,
} from "../handlers/workspaces.handler";

export const workspacesRoutes = Router();

workspacesRoutes.post("/", createWorkspaceHandler);
workspacesRoutes.get("/:workspaceId/usage", getWorkspaceUsageHandler);
workspacesRoutes.get("/:workspaceId/members", listWorkspaceMembersHandler);
workspacesRoutes.get("/:workspaceId/invites", listWorkspaceInvitesHandler);
workspacesRoutes.post("/:workspaceId/invites", createWorkspaceInviteHandler);
workspacesRoutes.delete("/:workspaceId/invites/:inviteId", revokeWorkspaceInviteHandler);
workspacesRoutes.patch("/:workspaceId/members/:userId/roles", updateWorkspaceMemberRolesHandler);
workspacesRoutes.get("/:workspaceId/notification-provider-settings", listWorkspaceNotificationProviderSettingsHandler);
workspacesRoutes.put("/:workspaceId/notification-provider-settings/:provider", updateWorkspaceNotificationProviderSettingHandler);
workspacesRoutes.get("/:workspaceId/webhook-integrations", listWorkspaceWebhookIntegrationsHandler);
workspacesRoutes.put("/:workspaceId/webhook-integrations/:type", updateWorkspaceWebhookIntegrationHandler);
