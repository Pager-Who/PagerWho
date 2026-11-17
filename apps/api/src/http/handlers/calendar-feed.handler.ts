import { MyOnCallShiftsQuerySchema, type CalendarFeedStatus } from "@im/contracts";
import { buildOnCallIcs, OnCallService, WorkspaceError, WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import crypto from "node:crypto";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { assertActorWorkspaceMember, getActorWorkspaceIds } from "../auth/workspace-access";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const onCallService = new OnCallService(prisma);
const workspaceService = new WorkspaceService(prisma);
const dayMs = 24 * 60 * 60 * 1000;
const feedPastDays = 7;
const feedFutureDays = 31;
const feedTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export const listMyOnCallShiftsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = MyOnCallShiftsQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_my_shifts_query", "Invalid on-call shifts query", parsedQuery.error.flatten());
    }

    const actorUserId = getRequiredActorUserId(req);
    const { workspace_id: workspaceId } = parsedQuery.data;

    if (workspaceId) {
      await assertActorWorkspaceMember(req, workspaceId);
    }

    const workspaceIds = workspaceId ? [workspaceId] : await getActorWorkspaceIds(req);
    const from = new Date();
    const shifts = await onCallService.listUserShifts(actorUserId, {
      workspaceIds,
      from,
      to: new Date(from.getTime() + parsedQuery.data.days * dayMs),
    });

    res.json({ data: shifts });
  } catch (error) {
    next(error instanceof WorkspaceError ? mapWorkspaceError(error) : error);
  }
};

export const getCalendarFeedStatusHandler: RequestHandler = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: getRequiredActorUserId(req) },
      select: { calendarFeedTokenHash: true },
    });
    const status: CalendarFeedStatus = { enabled: Boolean(user?.calendarFeedTokenHash), url: null };

    res.json({ data: status });
  } catch (error) {
    next(error);
  }
};

// Issues a new subscription URL; any previously shared URL stops working immediately.
export const rotateCalendarFeedHandler: RequestHandler = async (req, res, next) => {
  try {
    const token = crypto.randomBytes(32).toString("base64url");

    await prisma.user.update({
      where: { id: getRequiredActorUserId(req) },
      data: { calendarFeedTokenHash: hashFeedToken(token) },
    });

    const status: CalendarFeedStatus = { enabled: true, url: `${getPublicApiBaseUrl()}/api/v1/calendar-feeds/${token}/on-call.ics` };
    res.status(201).json({ data: status });
  } catch (error) {
    next(error);
  }
};

export const deleteCalendarFeedHandler: RequestHandler = async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: getRequiredActorUserId(req) },
      data: { calendarFeedTokenHash: null },
    });

    const status: CalendarFeedStatus = { enabled: false, url: null };
    res.json({ data: status });
  } catch (error) {
    next(error);
  }
};

// Public: calendar apps cannot send session cookies, so the URL secret is the credential.
export const getCalendarFeedIcsHandler: RequestHandler = async (req, res, next) => {
  try {
    const token = req.params.token ?? "";

    if (!feedTokenPattern.test(token)) {
      throw new HttpError(404, "calendar_feed_not_found", "Calendar feed not found");
    }

    const user = await prisma.user.findUnique({
      where: { calendarFeedTokenHash: hashFeedToken(token) },
      select: { id: true, suspendedAt: true },
    });

    if (!user || user.suspendedAt) {
      throw new HttpError(404, "calendar_feed_not_found", "Calendar feed not found");
    }

    const workspaceIds = (await workspaceService.listUserWorkspaces(user.id)).map((workspace) => workspace.id);
    const now = new Date();
    const shifts = workspaceIds.length === 0 ? [] : await onCallService.listUserShifts(user.id, {
      workspaceIds,
      from: new Date(now.getTime() - feedPastDays * dayMs),
      to: new Date(now.getTime() + feedFutureDays * dayMs),
    });

    res
      .status(200)
      .type("text/calendar; charset=utf-8")
      .set("Cache-Control", "private, max-age=300")
      .send(buildOnCallIcs(shifts, now));
  } catch (error) {
    next(error);
  }
};

function hashFeedToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getPublicApiBaseUrl() {
  return (process.env.WEBHOOK_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
}
