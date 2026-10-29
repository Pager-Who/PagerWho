import { Router } from "express";

import {
  createWorkflowHandler,
  deleteWorkflowHandler,
  disableWorkflowHandler,
  enableWorkflowHandler,
  getWorkflowHandler,
  getWorkflowRunHandler,
  listWorkflowRunsHandler,
  listWorkflowsHandler,
  testWorkflowHandler,
  listWorkflowTriggersHandler,
  updateWorkflowHandler,
} from "../handlers/workflows.handler";

export const workflowRunsRoutes = Router();
export const workflowsRoutes = Router();

workflowsRoutes.get("/triggers", listWorkflowTriggersHandler);
workflowsRoutes.get("/", listWorkflowsHandler);
workflowsRoutes.post("/", createWorkflowHandler);
workflowsRoutes.get("/:workflowId", getWorkflowHandler);
workflowsRoutes.patch("/:workflowId", updateWorkflowHandler);
workflowsRoutes.delete("/:workflowId", deleteWorkflowHandler);
workflowsRoutes.post("/:workflowId/enable", enableWorkflowHandler);
workflowsRoutes.post("/:workflowId/disable", disableWorkflowHandler);
workflowsRoutes.post("/:workflowId/test", testWorkflowHandler);
workflowsRoutes.get("/:workflowId/runs", listWorkflowRunsHandler);

workflowRunsRoutes.get("/:runId", getWorkflowRunHandler);
