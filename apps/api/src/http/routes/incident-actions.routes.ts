import express, { Router } from "express";

import {
  acknowledgeIncidentActionLinkHandler,
  getIncidentActionLinkHandler,
  voiceIncidentActionLinkHandler,
} from "../handlers/incident-actions.handler";

export const incidentActionsRoutes = Router();

incidentActionsRoutes.post("/voice/:token", express.urlencoded({ extended: false, limit: "16kb" }), voiceIncidentActionLinkHandler);
incidentActionsRoutes.get("/:token", getIncidentActionLinkHandler);
incidentActionsRoutes.post("/:token/ack", acknowledgeIncidentActionLinkHandler);
