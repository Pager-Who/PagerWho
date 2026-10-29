import {
  CreateWorkspaceInviteRequestSchema,
  CreateWorkspaceRequestSchema,
  UpdateWorkspaceMemberRolesRequestSchema,
  UpdateWorkspaceNotificationProviderSettingRequestSchema,
  UpdateWorkspaceWebhookIntegrationRequestSchema,
  UuidSchema,
  WorkspaceNotificationProviderSchema,
  WorkspaceWebhookIntegrationTypeSchema,
} from "@im/contracts";
import { QuotaService, WorkspaceError, WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { HttpError } from "../errors/http-error";

const workspaceService = new WorkspaceService(prisma);
const quotaService = new QuotaService(prisma);

export const createWorkspaceHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const parsedBody = CreateWorkspaceRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_workspace_request", "Invalid workspace request", parsedBody.error.flatten());
    }

    const workspace = await workspaceService.createWorkspace(parsedBody.data, actorUserId);
    res.status(201).json({ data: workspace });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const listMyWorkspacesHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaces = await workspaceService.listUserWorkspaces(actorUserId);
    res.json({ data: workspaces });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const listMyWorkspaceInvitesHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const invites = await workspaceService.listUserInvites(actorUserId);
    res.json({ data: invites });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const acceptWorkspaceInviteHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const inviteId = parseUuidParam(req.params.inviteId, "invite");
    const member = await workspaceService.acceptInvite(inviteId, actorUserId);
    res.json({ data: member });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const declineWorkspaceInviteHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const inviteId = parseUuidParam(req.params.inviteId, "invite");
    const invite = await workspaceService.declineInvite(inviteId, actorUserId);
    res.json({ data: invite });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const listWorkspaceMembersHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    const members = await workspaceService.listMembers(workspaceId, actorUserId);
    res.json({ data: members });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const listWorkspaceInvitesHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    const invites = await workspaceService.listWorkspaceInvites(workspaceId, actorUserId);
    res.json({ data: invites });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const getWorkspaceUsageHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    await workspaceService.assertMember(workspaceId, actorUserId);
    const usage = await quotaService.getWorkspaceUsage(workspaceId);
    res.json({ data: usage });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const createWorkspaceInviteHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    const parsedBody = CreateWorkspaceInviteRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_workspace_invite_request", "Invalid workspace invite request", parsedBody.error.flatten());
    }

    const invite = await workspaceService.createInvite(workspaceId, parsedBody.data, actorUserId);
    res.status(201).json({ data: invite });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const revokeWorkspaceInviteHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    const inviteId = parseUuidParam(req.params.inviteId, "invite");
    const invite = await workspaceService.revokeInvite(workspaceId, inviteId, actorUserId);
    res.json({ data: invite });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const updateWorkspaceMemberRolesHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    const userId = parseUuidParam(req.params.userId, "user");
    const parsedBody = UpdateWorkspaceMemberRolesRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_workspace_member_roles_request", "Invalid workspace member roles request", parsedBody.error.flatten());
    }

    const member = await workspaceService.updateMemberRoles(workspaceId, userId, parsedBody.data, actorUserId);
    res.json({ data: member });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const listWorkspaceNotificationProviderSettingsHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    const settings = await workspaceService.listNotificationProviderSettings(workspaceId, actorUserId);
    res.json({ data: settings });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const updateWorkspaceNotificationProviderSettingHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    const parsedProvider = WorkspaceNotificationProviderSchema.safeParse(req.params.provider);
    const parsedBody = UpdateWorkspaceNotificationProviderSettingRequestSchema.safeParse(req.body);

    if (!parsedProvider.success) {
      throw new HttpError(400, "invalid_notification_provider", "Invalid notification provider", parsedProvider.error.flatten());
    }

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_notification_provider_setting_request", "Invalid notification provider setting request", parsedBody.error.flatten());
    }

    const setting = await workspaceService.updateNotificationProviderSetting(
      workspaceId,
      parsedProvider.data,
      parsedBody.data,
      actorUserId,
    );
    res.json({ data: setting });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const listWorkspaceWebhookIntegrationsHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    const integrations = await workspaceService.listWebhookIntegrations(workspaceId, actorUserId);
    res.json({ data: integrations });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

export const updateWorkspaceWebhookIntegrationHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const workspaceId = parseUuidParam(req.params.workspaceId, "workspace");
    const parsedType = WorkspaceWebhookIntegrationTypeSchema.safeParse(req.params.type);
    const parsedBody = UpdateWorkspaceWebhookIntegrationRequestSchema.safeParse(req.body);
    if (!parsedType.success || !parsedBody.success) {
      throw new HttpError(400, "invalid_webhook_integration_request", "Invalid webhook integration request");
    }
    const integration = await workspaceService.updateWebhookIntegration(
      workspaceId,
      parsedType.data,
      parsedBody.data,
      actorUserId,
    );
    res.json({ data: integration });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

function parseUuidParam(value: string | undefined, label: string) {
  const parsed = UuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpError(400, `invalid_${label}_id`, `Invalid ${label} id`, parsed.error.flatten());
  }

  return parsed.data;
}

export function mapWorkspaceError(error: unknown) {
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return new HttpError(409, "workspace_slug_exists", "Workspace slug already exists");
  }

  if (error instanceof WorkspaceError) {
    if (
      error.code === "user_not_found"
      || error.code === "invited_user_not_found"
      || error.code === "workspace_invite_not_found"
      || error.code === "workspace_member_not_found"
    ) {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "workspace_access_denied" || error.code === "workspace_suspended") {
      return new HttpError(403, error.code, error.message);
    }

    if (error.code === "workspace_admin_required" || error.code === "workspace_permission_required") {
      return new HttpError(403, error.code, error.message);
    }

    if (error.code === "workspace_owner_required") {
      return new HttpError(403, error.code, error.message);
    }

    if (
      error.code === "cannot_invite_self"
      || error.code === "workspace_member_exists"
      || error.code === "workspace_invite_not_pending"
      || error.code === "workspace_invite_expired"
    ) {
      return new HttpError(409, error.code, error.message);
    }
  }

  return error;
}
