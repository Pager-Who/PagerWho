import type { RequestHandler } from "express";

import { copilotNotConfiguredError, isCopilotConfigured } from "../../copilot/model-client";

/** Copilot is optional. Without a configured model provider every Copilot feature is disabled server-side. */
export const requireCopilotEnabled: RequestHandler = (_req, _res, next) => {
  next(isCopilotConfigured() ? undefined : copilotNotConfiguredError());
};
