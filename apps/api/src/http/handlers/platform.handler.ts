import {
  PlatformListUsersQuerySchema,
  PlatformDiagnosticsQuerySchema,
  PlatformInspectorQuerySchema,
  PlatformResourceListQuerySchema,
  PlatformListWorkspacesQuerySchema,
  PlatformReasonRequestSchema,
  PlatformSendAuthEmailRequestSchema,
  PlatformUpdateWorkspaceMemberRolesRequestSchema,
  PlatformUpdateWorkspaceQuotaOverrideRequestSchema,
  UuidSchema,
} from "@im/contracts";
import { PlatformError, PlatformService, WorkspaceError, recordActivityLog } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { sendAuthEmail } from "../auth/auth-email";
import { createAuthToken, hashAuthToken } from "../auth/password-credentials";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const platformService = new PlatformService(prisma);
const emailVerificationTtlMs = 1000 * 60 * 60 * 24;
const passwordResetTtlMs = 1000 * 60 * 30;

export const getPlatformMeHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const me = await platformService.getPlatformMe(actorUserId);
    res.json({ data: me });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const getPlatformOverviewHandler: RequestHandler = async (req, res, next) => {
  try {
    const overview = await platformService.getOverview(getRequiredActorUserId(req));
    res.json({ data: overview });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const getPlatformDiagnosticsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = PlatformDiagnosticsQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_platform_diagnostics_query", "Invalid diagnostics query", parsedQuery.error.flatten());
    }

    const diagnostics = await platformService.getDiagnostics(getRequiredActorUserId(req), parsedQuery.data);
    res.json({ data: diagnostics });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const getPlatformInspectorHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = PlatformInspectorQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_platform_inspector_query", "Invalid inspector query", parsedQuery.error.flatten());
    }

    const result = await platformService.inspectResource(getRequiredActorUserId(req), parsedQuery.data);
    res.json({ data: result });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const listPlatformResourcesHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = PlatformResourceListQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_platform_resource_list_query", "Invalid resource list query", parsedQuery.error.flatten());
    }

    const result = await platformService.listResources(getRequiredActorUserId(req), parsedQuery.data);
    res.json({ data: result });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const retryPlatformNotificationHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = PlatformReasonRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_platform_notification_retry_request", "Invalid notification retry request", parsedBody.error.flatten());
    }

    const diagnostics = await platformService.retryNotification(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.notificationId, "notification"),
      parsedBody.data.reason,
    );
    res.json({ data: diagnostics });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const listPlatformUsersHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = PlatformListUsersQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_platform_user_query", "Invalid platform user query", parsedQuery.error.flatten());
    }

    const users = await platformService.listUsers(getRequiredActorUserId(req), parsedQuery.data);
    res.json({ data: users });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const getPlatformUserHandler: RequestHandler = async (req, res, next) => {
  try {
    const user = await platformService.getUser(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.userId, "user"),
    );
    res.json({ data: user });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const suspendPlatformUserHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = PlatformReasonRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_platform_user_suspend_request", "Invalid platform user suspend request", parsedBody.error.flatten());
    }

    const user = await platformService.suspendUser(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.userId, "user"),
      parsedBody.data.reason,
    );
    res.json({ data: user });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const restorePlatformUserHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = PlatformReasonRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_platform_user_restore_request", "Invalid platform user restore request", parsedBody.error.flatten());
    }

    const user = await platformService.restoreUser(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.userId, "user"),
      parsedBody.data.reason,
    );
    res.json({ data: user });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const revokePlatformUserSessionsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = PlatformReasonRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_platform_user_session_revoke_request", "Invalid session revoke request", parsedBody.error.flatten());
    }

    const user = await platformService.revokeUserSessions(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.userId, "user"),
      parsedBody.data.reason,
    );
    res.json({ data: user });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const sendPlatformUserAuthEmailHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const userId = parseUuidParam(req.params.userId, "user");
    const parsedBody = PlatformSendAuthEmailRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_platform_auth_email_request", "Invalid auth email request", parsedBody.error.flatten());
    }

    await platformService.assertPlatformAdmin(actorUserId);
    const token = createAuthToken();
    const user = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        include: { passwordCredential: { select: { userId: true } } },
      });

      if (!target) {
        throw new PlatformError("user_not_found", "User not found");
      }

      if (parsedBody.data.kind === "email_verification") {
        if (target.emailVerifiedAt) {
          throw new HttpError(409, "email_already_verified", "User email is already verified");
        }

        await tx.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } });
        await tx.emailVerificationToken.create({
          data: {
            expiresAt: new Date(Date.now() + emailVerificationTtlMs),
            sentToEmail: target.email,
            tokenHash: hashAuthToken(token),
            userId,
          },
        });
      } else {
        if (!target.passwordCredential) {
          throw new HttpError(409, "password_login_not_configured", "User does not have password login configured");
        }

        await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
        await tx.passwordResetToken.create({
          data: {
            expiresAt: new Date(Date.now() + passwordResetTtlMs),
            tokenHash: hashAuthToken(token),
            userId,
          },
        });
      }

      await recordActivityLog(tx, {
        action: `platform.${parsedBody.data.kind}_email_sent`,
        actorUserId,
        message: "Authentication email sent by platform admin",
        metadata: { kind: parsedBody.data.kind, reason: parsedBody.data.reason },
        resourceId: userId,
        resourceType: "user",
      });

      return target;
    });

    await sendAuthEmail({
      email: user.email,
      kind: parsedBody.data.kind,
      name: user.name,
      token,
    });
    res.json({ data: await platformService.getUser(actorUserId, userId) });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const listPlatformWorkspacesHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = PlatformListWorkspacesQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_platform_workspace_query", "Invalid platform workspace query", parsedQuery.error.flatten());
    }

    const workspaces = await platformService.listWorkspaces(getRequiredActorUserId(req), parsedQuery.data);
    res.json({ data: workspaces });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const getPlatformWorkspaceHandler: RequestHandler = async (req, res, next) => {
  try {
    const workspace = await platformService.getWorkspace(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.workspaceId, "workspace"),
    );
    res.json({ data: workspace });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const updateWorkspaceQuotaOverrideHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = PlatformUpdateWorkspaceQuotaOverrideRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_workspace_quota_override_request", "Invalid quota override request", parsedBody.error.flatten());
    }

    const workspace = await platformService.updateWorkspaceQuotaOverride(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.workspaceId, "workspace"),
      {
        expiresAt: parsedBody.data.expires_at,
        limit: parsedBody.data.limit,
        reason: parsedBody.data.reason,
        resource: parsedBody.data.resource,
      },
    );
    res.json({ data: workspace });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const suspendPlatformWorkspaceHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = PlatformReasonRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_platform_workspace_suspend_request", "Invalid platform workspace suspend request", parsedBody.error.flatten());
    }

    const workspace = await platformService.suspendWorkspace(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.workspaceId, "workspace"),
      parsedBody.data.reason,
    );
    res.json({ data: workspace });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const restorePlatformWorkspaceHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = PlatformReasonRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_platform_workspace_restore_request", "Invalid platform workspace restore request", parsedBody.error.flatten());
    }

    const workspace = await platformService.restoreWorkspace(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.workspaceId, "workspace"),
      parsedBody.data.reason,
    );
    res.json({ data: workspace });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

export const updatePlatformWorkspaceMemberRolesHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = PlatformUpdateWorkspaceMemberRolesRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_platform_workspace_member_roles_request", "Invalid platform workspace member roles request", parsedBody.error.flatten());
    }

    const workspace = await platformService.updateWorkspaceMemberRoles(
      getRequiredActorUserId(req),
      parseUuidParam(req.params.workspaceId, "workspace"),
      parseUuidParam(req.params.userId, "user"),
      parsedBody.data.roles,
      parsedBody.data.reason,
    );
    res.json({ data: workspace });
  } catch (error) {
    next(mapPlatformError(error));
  }
};

function parseUuidParam(value: string | undefined, label: string) {
  const parsed = UuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpError(400, `invalid_${label}_id`, `Invalid ${label} id`, parsed.error.flatten());
  }

  return parsed.data;
}

function mapPlatformError(error: unknown) {
  if (error instanceof PlatformError) {
    if (error.code === "platform_admin_required") {
      return new HttpError(403, error.code, error.message);
    }

    if (error.code === "user_not_found" || error.code === "workspace_not_found" || error.code === "notification_not_found" || error.code === "resource_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    return new HttpError(409, error.code, error.message);
  }

  if (error instanceof WorkspaceError) {
    return mapWorkspaceError(error);
  }

  return error;
}
