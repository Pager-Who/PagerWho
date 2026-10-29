import { Router } from "express";

import {
  addTeamMemberHandler,
  createTeamHandler,
  listTeamMembersHandler,
  listTeamsHandler,
  removeTeamMemberHandler,
} from "../handlers/teams.handler";

export const teamsRoutes = Router();

teamsRoutes.get("/", listTeamsHandler);
teamsRoutes.post("/", createTeamHandler);
teamsRoutes.get("/:teamId/members", listTeamMembersHandler);
teamsRoutes.post("/:teamId/members", addTeamMemberHandler);
teamsRoutes.delete("/:teamId/members/:userId", removeTeamMemberHandler);
