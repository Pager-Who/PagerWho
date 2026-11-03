import { Router } from "express";

import { askCopilotHandler, executeCopilotHandler, getCopilotStatusHandler } from "../handlers/copilot.handler";
import { requireCopilotEnabled } from "../middleware/copilot-enabled.middleware";

export const copilotRoutes = Router();

copilotRoutes.get("/status", getCopilotStatusHandler);
copilotRoutes.post("/ask", requireCopilotEnabled, askCopilotHandler);
copilotRoutes.post("/execute", requireCopilotEnabled, executeCopilotHandler);
