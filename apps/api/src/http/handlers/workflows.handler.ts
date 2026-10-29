import {
  CreateWorkflowRequestSchema,
  UpdateWorkflowRequestSchema,
  UuidSchema,
  WorkflowListQuerySchema,
  WorkflowRunListQuerySchema,
  WorkflowTestRunRequestSchema,
} from "@im/contracts";
import { WorkflowError, WorkflowService, WorkspaceError } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const workflowService = new WorkflowService(prisma);

export const listWorkflowTriggersHandler: RequestHandler = (_req, res, next) => {
  try {
    res.json({
      data: {
        items: workflowService.listTriggerCatalog(),
      },
    });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const listWorkflowsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = WorkflowListQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_workflow_filter", "Invalid workflow filter", parsedQuery.error.flatten());
    }

    const workflows = await workflowService.listWorkflows(parsedQuery.data, getRequiredActorUserId(req));
    res.json({ data: workflows });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const createWorkflowHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = CreateWorkflowRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_workflow_request", "Invalid workflow request", parsedBody.error.flatten());
    }

    const workflow = await workflowService.createWorkflow(parsedBody.data, getRequiredActorUserId(req));
    res.status(201).json({ data: workflow });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const getWorkflowHandler: RequestHandler = async (req, res, next) => {
  try {
    const workflowId = parseUuidParam(req.params.workflowId, "workflow");
    const workflow = await workflowService.getWorkflow(workflowId, getRequiredActorUserId(req));
    res.json({ data: workflow });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const updateWorkflowHandler: RequestHandler = async (req, res, next) => {
  try {
    const workflowId = parseUuidParam(req.params.workflowId, "workflow");
    const parsedBody = UpdateWorkflowRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_workflow_request", "Invalid workflow request", parsedBody.error.flatten());
    }

    const workflow = await workflowService.updateWorkflow(workflowId, parsedBody.data, getRequiredActorUserId(req));
    res.json({ data: workflow });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const deleteWorkflowHandler: RequestHandler = async (req, res, next) => {
  try {
    const workflowId = parseUuidParam(req.params.workflowId, "workflow");
    const workflow = await workflowService.deleteWorkflow(workflowId, getRequiredActorUserId(req));
    res.json({ data: workflow });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const enableWorkflowHandler: RequestHandler = async (req, res, next) => {
  try {
    const workflowId = parseUuidParam(req.params.workflowId, "workflow");
    const workflow = await workflowService.setWorkflowEnabled(workflowId, true, getRequiredActorUserId(req));
    res.json({ data: workflow });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const disableWorkflowHandler: RequestHandler = async (req, res, next) => {
  try {
    const workflowId = parseUuidParam(req.params.workflowId, "workflow");
    const workflow = await workflowService.setWorkflowEnabled(workflowId, false, getRequiredActorUserId(req));
    res.json({ data: workflow });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const testWorkflowHandler: RequestHandler = async (req, res, next) => {
  try {
    const workflowId = parseUuidParam(req.params.workflowId, "workflow");
    const parsedBody = WorkflowTestRunRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_workflow_test_request", "Invalid workflow test request", parsedBody.error.flatten());
    }

    const run = await workflowService.testWorkflow(workflowId, parsedBody.data, getRequiredActorUserId(req));
    res.status(201).json({ data: run });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const listWorkflowRunsHandler: RequestHandler = async (req, res, next) => {
  try {
    const workflowId = parseUuidParam(req.params.workflowId, "workflow");
    const parsedQuery = WorkflowRunListQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_workflow_run_filter", "Invalid workflow run filter", parsedQuery.error.flatten());
    }

    const runs = await workflowService.listRuns(workflowId, parsedQuery.data, getRequiredActorUserId(req));
    res.json({ data: runs });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

export const getWorkflowRunHandler: RequestHandler = async (req, res, next) => {
  try {
    const runId = parseUuidParam(req.params.runId, "workflow_run");
    const run = await workflowService.getRun(runId, getRequiredActorUserId(req));
    res.json({ data: run });
  } catch (error) {
    next(mapWorkflowError(error));
  }
};

function parseUuidParam(value: string | undefined, label: string) {
  const parsed = UuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpError(400, `invalid_${label}_id`, `Invalid ${label} id`, parsed.error.flatten());
  }

  return parsed.data;
}

function mapWorkflowError(error: unknown) {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof WorkspaceError) {
    return mapWorkspaceError(error);
  }

  if (error instanceof WorkflowError) {
    if (error.code === "workflow_not_found" || error.code === "workflow_run_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "workflow_managed_by_integration") {
      return new HttpError(409, error.code, error.message);
    }

    if (
      error.code === "workflow_action_not_allowed"
      || error.code === "workflow_filter_invalid"
      || error.code === "workflow_action_missing_target"
      || error.code === "workflow_action_invalid_config"
      || error.code === "workflow_action_invalid_graph"
      || error.code === "workflow_trigger_invalid_config"
    ) {
      return new HttpError(400, error.code, error.message, error.details);
    }
  }

  return error;
}
