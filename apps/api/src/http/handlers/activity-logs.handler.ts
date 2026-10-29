import { ActivityLogQuerySchema } from "@im/contracts";
import { ActivityLogService } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { assertActorWorkspaceMember, getActorWorkspaceIds } from "../auth/workspace-access";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const activityLogService = new ActivityLogService(prisma);

export const listActivityLogsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = ActivityLogQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_activity_log_filter", "Invalid activity log filter", parsedQuery.error.flatten());
    }

    const workspaceIds = parsedQuery.data.workspace_id
      ? undefined
      : await getActorWorkspaceIds(req);

    if (parsedQuery.data.workspace_id) {
      await assertActorWorkspaceMember(req, parsedQuery.data.workspace_id);
    }

    const logs = await activityLogService.listActivityLogs(parsedQuery.data, {
      ...(workspaceIds ? { workspaceIds } : {}),
    });
    res.json({ data: logs });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};
