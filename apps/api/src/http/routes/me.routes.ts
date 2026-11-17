import { Router } from "express";

import {
  acceptWorkspaceInviteHandler,
  declineWorkspaceInviteHandler,
  listMyWorkspaceInvitesHandler,
  listMyWorkspacesHandler,
} from "../handlers/workspaces.handler";
import {
  deleteCalendarFeedHandler,
  getCalendarFeedStatusHandler,
  rotateCalendarFeedHandler,
} from "../handlers/calendar-feed.handler";

export const meRoutes = Router();

meRoutes.get("/workspaces", listMyWorkspacesHandler);
meRoutes.get("/invites", listMyWorkspaceInvitesHandler);
meRoutes.post("/invites/:inviteId/accept", acceptWorkspaceInviteHandler);
meRoutes.post("/invites/:inviteId/decline", declineWorkspaceInviteHandler);
meRoutes.get("/calendar-feed", getCalendarFeedStatusHandler);
meRoutes.post("/calendar-feed", rotateCalendarFeedHandler);
meRoutes.delete("/calendar-feed", deleteCalendarFeedHandler);
