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
} from "../handlers/incidents.handler";

export const incidentsRoutes = Router();

incidentsRoutes.get("/", listIncidentsHandler);
incidentsRoutes.post("/", createIncidentHandler);
incidentsRoutes.get("/:incidentId/detail", getIncidentDetailHandler);
incidentsRoutes.get("/:incidentId", getIncidentHandler);
incidentsRoutes.post("/:incidentId/ack", acknowledgeIncidentHandler);
incidentsRoutes.post("/:incidentId/resolve", resolveIncidentHandler);
incidentsRoutes.patch("/:incidentId/priority", updateIncidentPriorityHandler);
incidentsRoutes.post("/:incidentId/escalation/manual-trigger", triggerManualEscalationHandler);
incidentsRoutes.get("/:incidentId/timeline", getIncidentTimelineHandler);
incidentsRoutes.get("/:incidentId/notifications", getIncidentNotificationsHandler);
incidentsRoutes.get("/:incidentId/escalation", getIncidentEscalationHandler);
