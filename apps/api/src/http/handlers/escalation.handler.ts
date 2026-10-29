import {
  CreateEscalationPolicyRequestSchema,
  UpdateEscalationPolicyRequestSchema,
  UuidSchema,
} from "@im/contracts";
import { EscalationError, EscalationService, WorkspaceError, WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { assertActorWorkspaceMember, getActorWorkspaceIds } from "../auth/workspace-access";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const escalationService = new EscalationService(prisma);
const workspaceService = new WorkspaceService(prisma);

export const listEscalationPoliciesHandler: RequestHandler = async (req, res, next) => {
  try {
    const workspaceId = parseOptionalWorkspaceId(req.query.workspace_id);

    const workspaceIds = workspaceId ? undefined : await getActorWorkspaceIds(req);

    if (workspaceId) {
      await assertActorWorkspaceMember(req, workspaceId);
    }

    const policies = await escalationService.listPolicies({
      ...(workspaceId ? { workspaceId } : {}),
      ...(workspaceIds ? { workspaceIds } : {}),
    });
    res.json({ data: policies });
  } catch (error) {
    next(mapEscalationError(error));
  }
};
export const createEscalationPolicyHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = CreateEscalationPolicyRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_escalation_policy_request", "Invalid escalation policy request", parsedBody.error.flatten());
    }

    await workspaceService.assertWorkspacePermission(parsedBody.data.workspace_id, getRequiredActorUserId(req), "escalation.manage");

    const policy = await escalationService.createPolicy(parsedBody.data);
    res.status(201).json({ data: policy });
  } catch (error) {
    next(mapEscalationError(error));
  }
};
export const getEscalationPolicyHandler: RequestHandler = async (req, res, next) => {
  try {
    const policyId = parsePolicyId(req.params.policyId);
    const policy = await escalationService.getPolicy(policyId);

    if (!policy) {
      throw new HttpError(404, "escalation_policy_not_found", "Escalation policy not found");
    }

    await assertActorWorkspaceMember(req, policy.workspace_id);

    res.json({ data: policy });
  } catch (error) {
    next(mapEscalationError(error));
  }
};
export const updateEscalationPolicyHandler: RequestHandler = async (req, res, next) => {
  try {
    const policyId = parsePolicyId(req.params.policyId);
    const parsedBody = UpdateEscalationPolicyRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_escalation_policy_request", "Invalid escalation policy request", parsedBody.error.flatten());
    }

    const existing = await escalationService.getPolicy(policyId);

    if (!existing) {
      throw new HttpError(404, "escalation_policy_not_found", "Escalation policy not found");
    }

    await workspaceService.assertWorkspacePermission(existing.workspace_id, getRequiredActorUserId(req), "escalation.manage");

    const policy = await escalationService.updatePolicy(policyId, parsedBody.data);
    res.json({ data: policy });
  } catch (error) {
    next(mapEscalationError(error));
  }
};
export const deleteEscalationPolicyHandler: RequestHandler = async (req, res, next) => {
  try {
    const policyId = parsePolicyId(req.params.policyId);
    const existing = await escalationService.getPolicy(policyId);

    if (!existing) {
      throw new HttpError(404, "escalation_policy_not_found", "Escalation policy not found");
    }

    await workspaceService.assertWorkspacePermission(existing.workspace_id, getRequiredActorUserId(req), "escalation.manage");

    const policy = await escalationService.deletePolicy(policyId);

    if (!policy) {
      throw new HttpError(404, "escalation_policy_not_found", "Escalation policy not found");
    }

    res.json({ data: policy });
  } catch (error) {
    next(mapEscalationError(error));
  }
};

function parsePolicyId(value: string | undefined) {
  const parsedPolicyId = UuidSchema.safeParse(value);

  if (!parsedPolicyId.success) {
    throw new HttpError(400, "invalid_escalation_policy_id", "Invalid escalation policy id", parsedPolicyId.error.flatten());
  }

  return parsedPolicyId.data;
}

function parseOptionalWorkspaceId(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsedWorkspaceId = UuidSchema.safeParse(value);

  if (!parsedWorkspaceId.success) {
    throw new HttpError(400, "invalid_workspace_id", "Invalid workspace id", parsedWorkspaceId.error.flatten());
  }

  return parsedWorkspaceId.data;
}

function mapEscalationError(error: unknown) {
  if (error instanceof WorkspaceError) {
    return mapWorkspaceError(error);
  }

  if (error instanceof EscalationError) {
    if (error.code === "escalation_policy_not_found" || error.code === "incident_not_found" || error.code === "workspace_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "escalation_policy_in_use") {
      return new HttpError(409, error.code, error.message);
    }

    if (error.code === "invalid_escalation_policy"
      || error.code === "notification_target_role_required"
      || error.code === "on_call_schedule_not_found"
      || error.code === "workspace_member_not_found") {
      return new HttpError(400, error.code, error.message);
    }
  }

  return error;
}
