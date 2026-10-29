import { ActivityLogService, WorkspaceService } from "@im/backend-core";
import { AuditLogQuerySchema } from "@im/contracts";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const activityLogService = new ActivityLogService(prisma);
const workspaceService = new WorkspaceService(prisma);

export const listAuditLogsHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const parsedQuery = AuditLogQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_audit_log_filter", "Invalid audit log filter", parsedQuery.error.flatten());
    }

    await workspaceService.assertWorkspacePermission(parsedQuery.data.workspace_id, actorUserId, "project.manage");
    const logs = await activityLogService.listActivityLogs(parsedQuery.data);
    res.json({ data: logs });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};
