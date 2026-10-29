import { Router } from "express";

import {
  deleteWebhookEndpointHandler,
  disableWebhookEndpointHandler,
  receiveWebhookHandler,
  rotateWebhookEndpointSecretHandler,
  testWebhookEndpointHandler,
} from "../handlers/webhooks.handler";

export const webhooksRoutes = Router();

webhooksRoutes.post("/endpoints/:endpointId/rotate-secret", rotateWebhookEndpointSecretHandler);
webhooksRoutes.post("/endpoints/:endpointId/test", testWebhookEndpointHandler);
webhooksRoutes.delete("/endpoints/:endpointId", deleteWebhookEndpointHandler);
webhooksRoutes.post("/endpoints/:endpointId/disable", disableWebhookEndpointHandler);
webhooksRoutes.post("/:endpointId", receiveWebhookHandler);
