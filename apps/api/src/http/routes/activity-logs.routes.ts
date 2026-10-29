import { Router } from "express";

import { listActivityLogsHandler } from "../handlers/activity-logs.handler";

export const activityLogsRoutes = Router();

activityLogsRoutes.get("/", listActivityLogsHandler);
