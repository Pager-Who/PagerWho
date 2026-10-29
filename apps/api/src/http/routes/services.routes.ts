import { Router } from "express";

import {
  createServiceHandler,
  createServiceWebhookEndpointHandler,
  deleteServiceHandler,
  getServiceHandler,
  getServiceIncidentsHandler,
  getServiceWebhookEndpointHandler,
  listServiceWebhookEndpointsHandler,
  listServicesHandler,
  listServiceWebhookIntegrationsHandler,
  updateServiceWebhookIntegrationHandler,
  updateServiceHandler,
} from "../handlers/services.handler";

export const servicesRoutes = Router();

servicesRoutes.get("/", listServicesHandler);
servicesRoutes.post("/", createServiceHandler);
servicesRoutes.get("/:serviceId", getServiceHandler);
servicesRoutes.get("/:serviceId/webhook-integrations", listServiceWebhookIntegrationsHandler);
servicesRoutes.put("/:serviceId/webhook-integrations/:type", updateServiceWebhookIntegrationHandler);
servicesRoutes.put("/:serviceId", updateServiceHandler);
servicesRoutes.delete("/:serviceId", deleteServiceHandler);
servicesRoutes.get("/:serviceId/incidents", getServiceIncidentsHandler);
servicesRoutes.get("/:serviceId/webhook-endpoint", getServiceWebhookEndpointHandler);
servicesRoutes.get("/:serviceId/webhook-endpoints", listServiceWebhookEndpointsHandler);
servicesRoutes.post("/:serviceId/webhook-endpoints", createServiceWebhookEndpointHandler);
