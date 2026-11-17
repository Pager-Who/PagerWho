import { CopilotAskRequestSchema, CopilotExecuteRequestSchema } from "@im/contracts";
import type { RequestHandler } from "express";
import { prisma } from "@im/db";

import { executeCopilotProposal } from "../../copilot/copilot.actions";
import { answerCopilotQuestion, getCopilotStatus } from "../../copilot/copilot.service";
import { getRequiredActorUserId } from "../auth/user-context";
import { HttpError } from "../errors/http-error";
import { consumeProposal } from "../../copilot/copilot-proposals";
import { readSettingsContext, settingsFingerprint, validateSettingsActions } from "../../copilot/copilot-settings";

export const askCopilotHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);

    const parsedBody = CopilotAskRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_copilot_request", "Invalid Copilot request", parsedBody.error.flatten());
    }

    const answer = await answerCopilotQuestion(parsedBody.data.question, parsedBody.data.history ?? [], {
      actorUserId,
      docsVersion: parsedBody.data.docs_version,
      locale: parsedBody.data.locale,
      structuredInput: parsedBody.data.structured_input,
      workspaceId: parsedBody.data.workspace_id,
    });

    res.json({ data: answer });
  } catch (error) {
    next(error);
  }
};

export const executeCopilotHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const parsedBody = CopilotExecuteRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_copilot_execute_request", "Invalid Copilot execute request", parsedBody.error.flatten());
    }

    const stored = await consumeProposal(parsedBody.data.proposal, actorUserId);
    const workspaceId = stored.proposal.workspace_id;
    if (!workspaceId) throw new HttpError(409, "copilot_invalid_proposal", "Proposal has no project.");
    const context = await readSettingsContext(workspaceId, actorUserId);
    if (settingsFingerprint(context) !== stored.fingerprint) {
      throw new HttpError(409, "copilot_stale_proposal", "Project settings changed. Request a fresh proposal before approving.");
    }
    validateSettingsActions(stored.proposal.actions, context);
    const executionRequest = { ...parsedBody.data, proposal: stored.proposal };
    const audit = await prisma.activityLog.create({ data: {
      workspaceId, actorUserId, resourceType: "copilot_proposal", resourceId: stored.proposal.id,
      action: "copilot.settings.approved", message: "Copilot settings proposal approved for execution.",
      metadata: { proposal_id: stored.proposal.id, action_types: stored.proposal.actions.map((action) => action.type) },
    } });
    const result = await executeCopilotProposal(executionRequest, actorUserId, parsedBody.data.locale);
    await prisma.activityLog.update({ where: { id: audit.id }, data: {
      action: "copilot.settings.executed", message: "Copilot settings execution completed. Review individual action results.",
      metadata: { proposal_id: executionRequest.proposal.id, results: result.results.map((entry) => ({
        action_id: entry.action_id, type: entry.type, status: entry.status,
        ...(entry.entity_id ? { entity_id: entry.entity_id } : {}),
      })) },
    } });

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

export const getCopilotStatusHandler: RequestHandler = async (req, res, next) => {
  try {
    getRequiredActorUserId(req);

    const status = await getCopilotStatus();

    res.json({ data: status });
  } catch (error) {
    next(error);
  }
};
