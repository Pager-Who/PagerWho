import { CreateTeamMemberRequestSchema, CreateTeamRequestSchema, UuidSchema, type Team, type TeamMember } from "@im/contracts";
import { WorkspaceError, WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { assertActorWorkspaceMember, getActorWorkspaceIds } from "../auth/workspace-access";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

type TeamRecord = {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type TeamAccessRecord = {
  id: string;
  workspaceId: string;
};

type TeamMemberRecord = {
  teamId: string;
  userId: string;
  role: string;
  createdAt: Date;
};

const workspaceService = new WorkspaceService(prisma);

export const listTeamsHandler: RequestHandler = async (req, res, next) => {
  try {
    const workspaceId = parseOptionalWorkspaceId(req.query.workspace_id);

    const workspaceIds = workspaceId ? undefined : await getActorWorkspaceIds(req);

    if (workspaceId) {
      await assertActorWorkspaceMember(req, workspaceId);
    }

    const teams = await prisma.team.findMany({
      where: {
        ...(workspaceId
          ? { workspaceId }
          : workspaceIds
            ? { workspaceId: { in: workspaceIds } }
            : {}),
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json({ data: teams.map(mapTeam) });
  } catch (error) {
    next(mapTeamError(error));
  }
};

export const createTeamHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const parsedBody = CreateTeamRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_team_request", "Invalid team request", parsedBody.error.flatten());
    }

    await workspaceService.assertWorkspacePermission(parsedBody.data.workspace_id, actorUserId, "project.manage");

    const team = await prisma.team.create({
      data: {
        workspaceId: parsedBody.data.workspace_id,
        name: parsedBody.data.name,
      },
    });

    res.status(201).json({ data: mapTeam(team) });
  } catch (error) {
    next(mapTeamError(error));
  }
};

export const listTeamMembersHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const teamId = parsePathUuid(req.params.teamId, "invalid_team_id", "Invalid team id");
    const team = await findTeamOrThrow(teamId);

    await workspaceService.assertMember(team.workspaceId, actorUserId);

    const members = await prisma.teamMember.findMany({
      where: {
        teamId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    res.json({ data: members.map(mapTeamMember) });
  } catch (error) {
    next(mapTeamError(error));
  }
};

export const addTeamMemberHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const teamId = parsePathUuid(req.params.teamId, "invalid_team_id", "Invalid team id");
    const parsedBody = CreateTeamMemberRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_team_member_request", "Invalid team member request", parsedBody.error.flatten());
    }

    const team = await findTeamOrThrow(teamId);
    await workspaceService.assertWorkspacePermission(team.workspaceId, actorUserId, "project.manage");

    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: team.workspaceId,
          userId: parsedBody.data.user_id,
        },
      },
    });

    if (!workspaceMember) {
      throw new HttpError(400, "workspace_member_not_found", "User is not a member of this workspace");
    }

    const member = await prisma.teamMember.create({
      data: {
        role: parsedBody.data.role,
        teamId,
        userId: parsedBody.data.user_id,
      },
    });

    res.status(201).json({ data: mapTeamMember(member) });
  } catch (error) {
    next(mapTeamError(error));
  }
};

export const removeTeamMemberHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const teamId = parsePathUuid(req.params.teamId, "invalid_team_id", "Invalid team id");
    const userId = parsePathUuid(req.params.userId, "invalid_user_id", "Invalid user id");
    const team = await findTeamOrThrow(teamId);

    await workspaceService.assertWorkspacePermission(team.workspaceId, actorUserId, "project.manage");

    const existing = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });

    if (!existing) {
      throw new HttpError(404, "team_member_not_found", "Team member not found");
    }

    await prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });

    res.json({ data: mapTeamMember(existing) });
  } catch (error) {
    next(mapTeamError(error));
  }
};

function parseOptionalWorkspaceId(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = UuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpError(400, "invalid_workspace_id", "Invalid workspace id", parsed.error.flatten());
  }

  return parsed.data;
}

function parsePathUuid(value: unknown, code: string, message: string): string {
  const parsed = UuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpError(400, code, message, parsed.error.flatten());
  }

  return parsed.data;
}

async function findTeamOrThrow(teamId: string): Promise<TeamAccessRecord> {
  const team = await prisma.team.findUnique({
    where: {
      id: teamId,
    },
    select: {
      id: true,
      workspaceId: true,
    },
  });

  if (!team) {
    throw new HttpError(404, "team_not_found", "Team not found");
  }

  return team;
}

function mapTeam(team: TeamRecord): Team {
  return {
    id: team.id,
    workspace_id: team.workspaceId,
    name: team.name,
    created_at: team.createdAt.toISOString(),
    updated_at: team.updatedAt.toISOString(),
  };
}

function mapTeamMember(member: TeamMemberRecord): TeamMember {
  return {
    team_id: member.teamId,
    user_id: member.userId,
    role: member.role,
    created_at: member.createdAt.toISOString(),
  };
}

function mapTeamError(error: unknown) {
  if (error instanceof WorkspaceError) {
    return mapWorkspaceError(error);
  }

  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    const target = "meta" in error && typeof error.meta === "object" && error.meta && "target" in error.meta
      ? error.meta.target
      : undefined;

    if (Array.isArray(target) && target.some((field) => field === "user_id" || field === "userId")) {
      return new HttpError(409, "team_member_exists", "User is already a member of this team");
    }

    return new HttpError(409, "team_name_exists", "Team name already exists in this workspace");
  }

  return error;
}
