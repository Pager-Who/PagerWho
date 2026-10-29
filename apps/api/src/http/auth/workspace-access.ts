import { WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import type { Request } from "express";

import { getRequiredActorUserId } from "./user-context";

const workspaceService = new WorkspaceService(prisma);

export async function getActorWorkspaceIds(req: Request): Promise<string[]> {
  const actorUserId = getRequiredActorUserId(req);
  const workspaces = await workspaceService.listUserWorkspaces(actorUserId);

  return workspaces.map((workspace) => workspace.id);
}

export async function assertActorWorkspaceMember(req: Request, workspaceId: string): Promise<string> {
  const actorUserId = getRequiredActorUserId(req);
  await workspaceService.assertMember(workspaceId, actorUserId);

  return actorUserId;
}

export async function assertActorWorkspaceAdmin(req: Request, workspaceId: string): Promise<string> {
  const actorUserId = getRequiredActorUserId(req);
  await workspaceService.assertWorkspaceAdmin(workspaceId, actorUserId);

  return actorUserId;
}
