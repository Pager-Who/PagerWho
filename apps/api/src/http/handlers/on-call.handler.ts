import {
  CreateOnCallOverrideRequestSchema,
  CreateOnCallScheduleRequestSchema,
  CurrentOnCallQuerySchema,
  OnCallSchedulePreviewQuerySchema,
  UpdateOnCallScheduleRequestSchema,
  UuidSchema,
} from "@im/contracts";
import { OnCallError, OnCallService, WorkspaceError, WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { assertActorWorkspaceMember, getActorWorkspaceIds } from "../auth/workspace-access";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const onCallService = new OnCallService(prisma);
const workspaceService = new WorkspaceService(prisma);

export const getCurrentOnCallHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = CurrentOnCallQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_current_on_call_query", "Invalid current on-call query", parsedQuery.error.flatten());
    }

    await assertServiceMemberAccess(req, parsedQuery.data.service_id);

    const currentOnCall = await onCallService.getCurrentOnCall(
      parsedQuery.data.service_id,
      parsedQuery.data.at ? new Date(parsedQuery.data.at) : new Date(),
    );

    res.json({ data: currentOnCall });
  } catch (error) {
    next(mapOnCallError(error));
  }
};

export const previewOnCallScheduleHandler: RequestHandler = async (req, res, next) => {
  try {
    const scheduleId = parseUuid(req.params.scheduleId, "invalid_on_call_schedule_id", "Invalid on-call schedule id");
    const parsedQuery = OnCallSchedulePreviewQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_on_call_preview_query", "Invalid on-call preview query", parsedQuery.error.flatten());
    }

    const existing = await onCallService.getSchedule(scheduleId);

    if (!existing) {
      throw new HttpError(404, "on_call_schedule_not_found", "On-call schedule not found");
    }

    await assertActorWorkspaceMember(req, existing.workspace_id);

    const preview = await onCallService.previewSchedule(scheduleId, parsedQuery.data);

    if (!preview) {
      throw new HttpError(404, "on_call_schedule_not_found", "On-call schedule not found");
    }

    res.json({ data: preview });
  } catch (error) {
    next(mapOnCallError(error));
  }
};

export const listOnCallSchedulesHandler: RequestHandler = async (req, res, next) => {
  try {
    const workspaceId = parseOptionalWorkspaceId(req.query.workspace_id);

    const workspaceIds = workspaceId ? undefined : await getActorWorkspaceIds(req);

    if (workspaceId) {
      await assertActorWorkspaceMember(req, workspaceId);
    }

    const schedules = await onCallService.listSchedules({
      ...(workspaceId ? { workspaceId } : {}),
      ...(workspaceIds ? { workspaceIds } : {}),
    });
    res.json({ data: schedules });
  } catch (error) {
    next(mapOnCallError(error));
  }
};

export const getOnCallScheduleHandler: RequestHandler = async (req, res, next) => {
  try {
    const scheduleId = parseUuid(req.params.scheduleId, "invalid_on_call_schedule_id", "Invalid on-call schedule id");
    const schedule = await onCallService.getSchedule(scheduleId);

    if (!schedule) {
      throw new HttpError(404, "on_call_schedule_not_found", "On-call schedule not found");
    }

    await assertActorWorkspaceMember(req, schedule.workspace_id);

    res.json({ data: schedule });
  } catch (error) {
    next(mapOnCallError(error));
  }
};

export const createOnCallScheduleHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = CreateOnCallScheduleRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_on_call_schedule_request", "Invalid on-call schedule request", parsedBody.error.flatten());
    }

    await workspaceService.assertWorkspacePermission(parsedBody.data.workspace_id, getRequiredActorUserId(req), "on_call.manage");

    const schedule = await onCallService.createSchedule(parsedBody.data);
    res.status(201).json({ data: schedule });
  } catch (error) {
    next(mapOnCallError(error));
  }
};

export const updateOnCallScheduleHandler: RequestHandler = async (req, res, next) => {
  try {
    const scheduleId = parseUuid(req.params.scheduleId, "invalid_on_call_schedule_id", "Invalid on-call schedule id");
    const parsedBody = UpdateOnCallScheduleRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_on_call_schedule_request", "Invalid on-call schedule request", parsedBody.error.flatten());
    }

    const existing = await onCallService.getSchedule(scheduleId);

    if (!existing) {
      throw new HttpError(404, "on_call_schedule_not_found", "On-call schedule not found");
    }

    await workspaceService.assertWorkspacePermission(existing.workspace_id, getRequiredActorUserId(req), "on_call.manage");

    const schedule = await onCallService.updateSchedule(scheduleId, parsedBody.data);
    res.json({ data: schedule });
  } catch (error) {
    next(mapOnCallError(error));
  }
};

export const deleteOnCallScheduleHandler: RequestHandler = async (req, res, next) => {
  try {
    const scheduleId = parseUuid(req.params.scheduleId, "invalid_on_call_schedule_id", "Invalid on-call schedule id");
    const existing = await onCallService.getSchedule(scheduleId);

    if (!existing) {
      throw new HttpError(404, "on_call_schedule_not_found", "On-call schedule not found");
    }

    await workspaceService.assertWorkspacePermission(existing.workspace_id, getRequiredActorUserId(req), "on_call.manage");

    const schedule = await onCallService.deleteSchedule(scheduleId);

    if (!schedule) {
      throw new HttpError(404, "on_call_schedule_not_found", "On-call schedule not found");
    }

    res.json({ data: schedule });
  } catch (error) {
    next(mapOnCallError(error));
  }
};

export const createOnCallOverrideHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = CreateOnCallOverrideRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_on_call_override_request", "Invalid on-call override request", parsedBody.error.flatten());
    }

    const schedule = await onCallService.getSchedule(parsedBody.data.schedule_id);

    if (!schedule) {
      throw new HttpError(404, "on_call_schedule_not_found", "On-call schedule not found");
    }

    await workspaceService.assertWorkspacePermission(schedule.workspace_id, getRequiredActorUserId(req), "on_call.manage");

    const override = await onCallService.createOverride(parsedBody.data);
    res.status(201).json({ data: override });
  } catch (error) {
    next(mapOnCallError(error));
  }
};

export const deleteOnCallOverrideHandler: RequestHandler = async (req, res, next) => {
  try {
    const overrideId = parseUuid(req.params.overrideId, "invalid_on_call_override_id", "Invalid on-call override id");
    const existing = await prisma.onCallOverride.findUnique({
      where: {
        id: overrideId,
      },
      select: {
        schedule: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new HttpError(404, "on_call_override_not_found", "On-call override not found");
    }

    await workspaceService.assertWorkspacePermission(existing.schedule.workspaceId, getRequiredActorUserId(req), "on_call.manage");

    const override = await onCallService.deleteOverride(overrideId);

    if (!override) {
      throw new HttpError(404, "on_call_override_not_found", "On-call override not found");
    }

    res.json({ data: override });
  } catch (error) {
    next(mapOnCallError(error));
  }
};

function parseOptionalWorkspaceId(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_workspace_id", "Invalid workspace id");
  }

  const parsedWorkspaceId = UuidSchema.safeParse(value);

  if (!parsedWorkspaceId.success) {
    throw new HttpError(400, "invalid_workspace_id", "Invalid workspace id", parsedWorkspaceId.error.flatten());
  }

  return parsedWorkspaceId.data;
}

function parseUuid(value: string | undefined, code: string, message: string) {
  const parsedUuid = UuidSchema.safeParse(value);

  if (!parsedUuid.success) {
    throw new HttpError(400, code, message, parsedUuid.error.flatten());
  }

  return parsedUuid.data;
}

async function assertServiceMemberAccess(req: Parameters<RequestHandler>[0], serviceId: string) {
  const service = await prisma.service.findUnique({
    where: {
      id: serviceId,
    },
    select: {
      workspaceId: true,
    },
  });

  if (!service) {
    throw new HttpError(404, "service_not_found", "Service not found");
  }

  await assertActorWorkspaceMember(req, service.workspaceId);
}

function mapOnCallError(error: unknown) {
  if (error instanceof WorkspaceError) {
    return mapWorkspaceError(error);
  }

  if (error instanceof OnCallError) {
    if (
      error.code === "on_call_schedule_not_found"
      || error.code === "service_not_found"
      || error.code === "team_not_found"
      || error.code === "user_not_found"
      || error.code === "workspace_not_found"
    ) {
      return new HttpError(404, error.code, error.message);
    }

    if (
      error.code === "invalid_override_window"
      || error.code === "invalid_preview_window"
      || error.code === "invalid_rotation_cadence"
      || error.code === "invalid_timezone"
      || error.code === "on_call_participant_role_required"
      || error.code === "workspace_member_not_found"
    ) {
      return new HttpError(400, error.code, error.message);
    }

    if (error.code === "workspace_mismatch") {
      return new HttpError(409, error.code, error.message);
    }

    if (error.code === "on_call_schedule_in_use") {
      return new HttpError(409, error.code, error.message);
    }
  }

  return error;
}
