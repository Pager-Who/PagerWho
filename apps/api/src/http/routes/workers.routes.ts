import { Router } from "express";

import {
  getWorkerHealthHandler,
  getWorkerReadinessHandler,
  listStuckEscalationsHandler,
  listWorkerRunsHandler,
} from "../handlers/workers.handler";

export const workersRoutes = Router();

workersRoutes.get("/health", getWorkerHealthHandler);
workersRoutes.get("/readiness", getWorkerReadinessHandler);
workersRoutes.get("/runs", listWorkerRunsHandler);
workersRoutes.get("/stuck-escalations", listStuckEscalationsHandler);
