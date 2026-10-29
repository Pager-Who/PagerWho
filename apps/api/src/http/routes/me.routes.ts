import { Router } from "express";

import {
  acceptWorkspaceInviteHandler,
  declineWorkspaceInviteHandler,
  listMyWorkspaceInvitesHandler,
  listMyWorkspacesHandler,
} from "../handlers/workspaces.handler";

export const meRoutes = Router();

meRoutes.get("/workspaces", listMyWorkspacesHandler);
meRoutes.get("/invites", listMyWorkspaceInvitesHandler);
meRoutes.post("/invites/:inviteId/accept", acceptWorkspaceInviteHandler);
meRoutes.post("/invites/:inviteId/decline", declineWorkspaceInviteHandler);
