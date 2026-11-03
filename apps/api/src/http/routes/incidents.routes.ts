import { Router } from "express";

import {
  acknowledgeIncidentHandler,
  createIncidentHandler,
  getIncidentDetailHandler,
  getIncidentEscalationHandler,
  getIncidentHandler,
  getIncidentNotificationsHandler,
  getIncidentTimelineHandler,
  listIncidentsHandler,
  resolveIncidentHandler,
  triggerManualEscalationHandler,
  updateIncidentPriorityHandler,
  summarizeIncidentHandler,
} from "../handlers/incidents.handler";
import { requireCopilotEnabled } from "../middleware/copilot-enabled.middleware";

export const incidentsRoutes = Router();

incidentsRoutes.get("/", listIncidentsHandler);
incidentsRoutes.post("/", createIncidentHandler);
incidentsRoutes.get("/:incidentId/detail", getIncidentDetailHandler);
incidentsRoutes.post("/:incidentId/ai-summary", requireCopilotEnabled, summarizeIncidentHandler);
incidentsRoutes.get("/:incidentId", getIncidentHandler);
incidentsRoutes.post("/:incidentId/ack", acknowledgeIncidentHandler);
incidentsRoutes.post("/:incidentId/resolve", resolveIncidentHandler);
incidentsRoutes.patch("/:incidentId/priority", updateIncidentPriorityHandler);
incidentsRoutes.post("/:incidentId/escalation/manual-trigger", triggerManualEscalationHandler);
incidentsRoutes.get("/:incidentId/timeline", getIncidentTimelineHandler);
incidentsRoutes.get("/:incidentId/notifications", getIncidentNotificationsHandler);
incidentsRoutes.get("/:incidentId/escalation", getIncidentEscalationHandler);
