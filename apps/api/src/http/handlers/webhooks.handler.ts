import { UuidSchema } from "@im/contracts";
import {
  ServiceCatalogError,
  ServiceCatalogService,
  recordActivityLog,
  WebhookIngestionError,
  WebhookIngestionService,
  WorkspaceError,
  WorkspaceService,
} from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const webhookOptions = {
  ...(process.env.WEBHOOK_PUBLIC_BASE_URL ? { baseUrl: process.env.WEBHOOK_PUBLIC_BASE_URL } : {}),
  ...(process.env.WEBHOOK_SECRET_PEPPER ? { secretPepper: process.env.WEBHOOK_SECRET_PEPPER } : {}),
};
const webhookIngestionService = new WebhookIngestionService(prisma, webhookOptions);
const serviceCatalogService = new ServiceCatalogService(prisma, webhookOptions);
const workspaceService = new WorkspaceService(prisma);

export const receiveWebhookHandler: RequestHandler = async (req, res, next) => {
  const startedAt = Date.now();
  let endpointId: string | undefined;

  try {
    endpointId = parseEndpointId(req.params.endpointId);
    const token = extractWebhookToken(req);
    const result = await webhookIngestionService.receive(endpointId, req.body, {
      ...(token ? { token } : {}),
    });
    await recordWebhookIngestion(endpointId, res.locals.requestId, startedAt, {
      action: result.action,
      incidentId: result.incident.id,
      status: "succeeded",
    });
    res.status(result.action === "created" ? 201 : 200).json({ data: result });
  } catch (error) {
    if (endpointId) {
      await recordWebhookIngestion(endpointId, res.locals.requestId, startedAt, {
        errorCode: getWebhookErrorCode(error),
        status: "failed",
      });
    }
    next(mapWebhookError(error));
  }
};

export const testWebhookEndpointHandler: RequestHandler = async (req, res, next) => {
  try {
    const endpointId = parseEndpointId(req.params.endpointId);
    await assertWebhookEndpointAdmin(endpointId, getRequiredActorUserId(req));
    const result = await webhookIngestionService.receive(endpointId, req.body, {
      skipSecretVerification: true,
    });

    res.status(result.action === "created" ? 201 : 200).json({ data: result });
  } catch (error) {
    next(mapWebhookError(error));
  }
};

export const rotateWebhookEndpointSecretHandler: RequestHandler = async (req, res, next) => {
  try {
    const endpointId = parseEndpointId(req.params.endpointId);
    await assertWebhookEndpointAdmin(endpointId, getRequiredActorUserId(req));
    const endpoint = await serviceCatalogService.rotateWebhookEndpointSecret(endpointId);

    if (!endpoint) {
      throw new HttpError(404, "webhook_endpoint_not_found", "Webhook endpoint not found");
    }

    res.json({ data: endpoint });
  } catch (error) {
    next(mapWebhookError(error));
  }
};

export const deleteWebhookEndpointHandler: RequestHandler = async (req, res, next) => {
  try {
    const endpointId = parseEndpointId(req.params.endpointId);
    await assertWebhookEndpointAdmin(endpointId, getRequiredActorUserId(req));
    const endpoint = await serviceCatalogService.deleteWebhookEndpoint(endpointId);

    if (!endpoint) {
      throw new HttpError(404, "webhook_endpoint_not_found", "Webhook endpoint not found");
    }

    res.json({ data: endpoint });
  } catch (error) {
    next(mapWebhookError(error));
  }
};

export const disableWebhookEndpointHandler = deleteWebhookEndpointHandler;

function parseEndpointId(value: string | undefined) {
  const parsedEndpointId = UuidSchema.safeParse(value);

  if (!parsedEndpointId.success) {
    throw new HttpError(400, "invalid_webhook_endpoint_id", "Invalid webhook endpoint id", parsedEndpointId.error.flatten());
  }

  return parsedEndpointId.data;
}

function extractWebhookToken(req: Parameters<RequestHandler>[0]) {
  const queryToken = req.query.token;

  if (typeof queryToken === "string" && queryToken.length > 0) {
    return queryToken;
  }

  const explicitHeader = req.header("x-webhook-token") ?? req.header("x-pagerwho-webhook-token");

  if (explicitHeader) {
    return explicitHeader;
  }

  const authorization = req.header("authorization");
  const bearerPrefix = "Bearer ";

  if (authorization?.startsWith(bearerPrefix)) {
    return authorization.slice(bearerPrefix.length);
  }

  return undefined;
}

async function assertWebhookEndpointAdmin(endpointId: string, actorUserId: string) {
  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: {
      id: endpointId,
    },
    select: {
      service: {
        select: {
          workspaceId: true,
        },
      },
    },
  });

  if (!endpoint) {
    throw new HttpError(404, "webhook_endpoint_not_found", "Webhook endpoint not found");
  }

  await workspaceService.assertWorkspacePermission(endpoint.service.workspaceId, actorUserId, "webhook.manage");
}

function mapWebhookError(error: unknown) {
  if (error instanceof WorkspaceError) {
    return mapWorkspaceError(error);
  }

  if (error instanceof ServiceCatalogError) {
    if (error.code === "webhook_endpoint_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "webhook_endpoint_disabled") {
      return new HttpError(409, error.code, error.message);
    }
  }

  if (error instanceof WebhookIngestionError) {
    if (error.code === "webhook_endpoint_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "webhook_endpoint_disabled") {
      return new HttpError(409, error.code, error.message);
    }

    if (error.code === "webhook_secret_invalid") {
      return new HttpError(401, error.code, error.message);
    }

    if (error.code === "webhook_payload_invalid") {
      return new HttpError(400, error.code, error.message);
    }
  }

  return error;
}

async function recordWebhookIngestion(
  endpointId: string,
  requestId: string,
  startedAt: number,
  result: {
    action?: string;
    errorCode?: string;
    incidentId?: string;
    status: "failed" | "succeeded";
  },
) {
  try {
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
      select: {
        name: true,
        service: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!endpoint) {
      return;
    }

    await recordActivityLog(prisma, {
      action: `webhook.ingestion_${result.status}`,
      message: result.status === "succeeded" ? "Webhook ingestion succeeded" : "Webhook ingestion failed",
      metadata: {
        action: result.action ?? null,
        duration_ms: Date.now() - startedAt,
        endpoint_name: endpoint.name,
        error_code: result.errorCode ?? null,
        incident_id: result.incidentId ?? null,
        request_id: requestId,
      },
      resourceId: endpointId,
      resourceType: "webhook_endpoint",
      workspaceId: endpoint.service.workspaceId,
    });
  } catch {
    // Observability must never change the webhook ingestion response.
  }
}

function getWebhookErrorCode(error: unknown) {
  if (error instanceof WebhookIngestionError || error instanceof ServiceCatalogError) {
    return error.code;
  }

  if (error instanceof HttpError) {
    return error.code;
  }

  return "internal_error";
}
