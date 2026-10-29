import {
  CreateServiceRequestSchema,
  CreateWebhookEndpointRequestSchema,
  IncidentFilterSchema,
  UpdateServiceWebhookIntegrationRequestSchema,
  WorkspaceWebhookIntegrationTypeSchema,
  ServiceFilterSchema,
  UpdateServiceRequestSchema,
  UuidSchema,
} from "@im/contracts";
import {
  IncidentService,
  ServiceCatalogError,
  ServiceCatalogService,
  WorkspaceError,
  WorkspaceService,
} from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { assertActorWorkspaceMember, getActorWorkspaceIds } from "../auth/workspace-access";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const serviceCatalogService = new ServiceCatalogService(prisma, {
  ...(process.env.WEBHOOK_PUBLIC_BASE_URL ? { baseUrl: process.env.WEBHOOK_PUBLIC_BASE_URL } : {}),
  ...(process.env.WEBHOOK_SECRET_PEPPER ? { secretPepper: process.env.WEBHOOK_SECRET_PEPPER } : {}),
});
const incidentService = new IncidentService(prisma);
const workspaceService = new WorkspaceService(prisma);

export const listServicesHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = ServiceFilterSchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_service_filter", "Invalid service filter", parsedQuery.error.flatten());
    }

    const workspaceIds = parsedQuery.data.workspace_id
      ? undefined
      : await getActorWorkspaceIds(req);

    if (parsedQuery.data.workspace_id) {
      await assertActorWorkspaceMember(req, parsedQuery.data.workspace_id);
    }

    const servicesPage = await serviceCatalogService.listServices({
      ...parsedQuery.data,
      ...(workspaceIds ? { workspaceIds } : {}),
    });
    res.json({ data: servicesPage });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const createServiceHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = CreateServiceRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_request", "Invalid service request", parsedBody.error.flatten());
    }

    const workspaceId = await resolveServiceCreateWorkspaceId(parsedBody.data);
    await workspaceService.assertWorkspacePermission(workspaceId, getRequiredActorUserId(req), "service.manage");

    const service = await serviceCatalogService.createService(parsedBody.data);
    res.status(201).json({ data: service });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const getServiceHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedServiceId = UuidSchema.safeParse(req.params.serviceId);

    if (!parsedServiceId.success) {
      throw new HttpError(400, "invalid_service_id", "Invalid service id", parsedServiceId.error.flatten());
    }

    const service = await serviceCatalogService.getService(parsedServiceId.data);

    if (!service) {
      throw new HttpError(404, "service_not_found", "Service not found");
    }

    await assertActorWorkspaceMember(req, service.workspace_id);

    res.json({ data: service });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const updateServiceHandler: RequestHandler = async (req, res, next) => {
  try {
    const serviceId = parseServiceId(req.params.serviceId);
    const parsedBody = UpdateServiceRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_service_request", "Invalid service request", parsedBody.error.flatten());
    }

    const existing = await serviceCatalogService.getService(serviceId);

    if (!existing) {
      throw new HttpError(404, "service_not_found", "Service not found");
    }

    await workspaceService.assertWorkspacePermission(existing.workspace_id, getRequiredActorUserId(req), "service.manage");

    const service = await serviceCatalogService.updateService(serviceId, parsedBody.data);
    res.json({ data: service });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const listServiceWebhookIntegrationsHandler: RequestHandler = async (req, res, next) => {
  try {
    const serviceId = parseServiceId(req.params.serviceId);
    const data = await workspaceService.listServiceWebhookIntegrations(serviceId, getRequiredActorUserId(req));
    res.json({ data });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const updateServiceWebhookIntegrationHandler: RequestHandler = async (req, res, next) => {
  try {
    const serviceId = parseServiceId(req.params.serviceId);
    const parsedType = WorkspaceWebhookIntegrationTypeSchema.safeParse(req.params.type);
    const parsedBody = UpdateServiceWebhookIntegrationRequestSchema.safeParse(req.body);
    if (!parsedType.success || !parsedBody.success) {
      throw new HttpError(400, "invalid_service_webhook_integration", "Invalid service webhook integration");
    }
    const data = await workspaceService.updateServiceWebhookIntegration(
      serviceId, parsedType.data, parsedBody.data, getRequiredActorUserId(req),
    );
    res.json({ data });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const deleteServiceHandler: RequestHandler = async (req, res, next) => {
  try {
    const serviceId = parseServiceId(req.params.serviceId);
    const existing = await serviceCatalogService.getService(serviceId);

    if (!existing) {
      throw new HttpError(404, "service_not_found", "Service not found");
    }

    await workspaceService.assertWorkspacePermission(existing.workspace_id, getRequiredActorUserId(req), "service.manage");

    const service = await serviceCatalogService.deleteService(serviceId);
    res.json({ data: service });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const getServiceIncidentsHandler: RequestHandler = async (req, res, next) => {
  try {
    const serviceId = parseServiceId(req.params.serviceId);
    const service = await assertServiceMemberAccess(req, serviceId);

    const parsedQuery = IncidentFilterSchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_incident_filter", "Invalid incident filter", parsedQuery.error.flatten());
    }

    const { service_id: _ignoredServiceId, workspace_id: _ignoredWorkspaceId, ...filters } = parsedQuery.data;
    const incidentsPage = await incidentService.listIncidentsForService(serviceId, {
      ...filters,
      workspaceIds: [service.workspace_id],
    });
    res.json({ data: incidentsPage });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const getServiceWebhookEndpointHandler: RequestHandler = async (req, res, next) => {
  try {
    const serviceId = parseServiceId(req.params.serviceId);
    await assertServiceMemberAccess(req, serviceId);

    const endpoint = await serviceCatalogService.getServiceWebhookEndpoint(serviceId);

    if (!endpoint) {
      throw new HttpError(404, "webhook_endpoint_not_found", "Webhook endpoint not found");
    }

    res.json({ data: endpoint });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const listServiceWebhookEndpointsHandler: RequestHandler = async (req, res, next) => {
  try {
    const serviceId = parseServiceId(req.params.serviceId);
    await assertServiceMemberAccess(req, serviceId);

    const endpoints = await serviceCatalogService.listServiceWebhookEndpoints(serviceId);
    res.json({ data: endpoints });
  } catch (error) {
    next(mapServiceError(error));
  }
};

export const createServiceWebhookEndpointHandler: RequestHandler = async (req, res, next) => {
  try {
    const serviceId = parseServiceId(req.params.serviceId);
    const parsedBody = CreateWebhookEndpointRequestSchema.safeParse(req.body ?? {});

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_webhook_endpoint_request", "Invalid webhook endpoint request", parsedBody.error.flatten());
    }

    const service = await serviceCatalogService.getService(serviceId);

    if (!service) {
      throw new HttpError(404, "service_not_found", "Service not found");
    }

    await workspaceService.assertWorkspacePermission(service.workspace_id, getRequiredActorUserId(req), "webhook.manage");

    const endpoint = await serviceCatalogService.createServiceWebhookEndpoint(serviceId, parsedBody.data);
    res.status(201).json({ data: endpoint });
  } catch (error) {
    next(mapServiceError(error));
  }
};

function parseServiceId(value: string | undefined) {
  const parsedServiceId = UuidSchema.safeParse(value);

  if (!parsedServiceId.success) {
    throw new HttpError(400, "invalid_service_id", "Invalid service id", parsedServiceId.error.flatten());
  }

  return parsedServiceId.data;
}

async function resolveServiceCreateWorkspaceId(input: { team_id?: string | null | undefined; workspace_id?: string | undefined }) {
  if (input.workspace_id) {
    return input.workspace_id;
  }

  if (!input.team_id) {
    throw new HttpError(400, "workspace_required", "workspace_id is required when team_id is not provided");
  }

  const team = await prisma.team.findUnique({
    where: {
      id: input.team_id,
    },
    select: {
      workspaceId: true,
    },
  });

  if (!team) {
    throw new HttpError(404, "team_not_found", "Team not found");
  }

  return team.workspaceId;
}

async function assertServiceMemberAccess(req: Parameters<RequestHandler>[0], serviceId: string) {
  const service = await serviceCatalogService.getService(serviceId);

  if (!service) {
    throw new HttpError(404, "service_not_found", "Service not found");
  }

  await assertActorWorkspaceMember(req, service.workspace_id);

  return service;
}

function mapServiceError(error: unknown) {
  if (error instanceof WorkspaceError) {
    if (error.code === "service_not_found") {
      return new HttpError(404, error.code, error.message);
    }
    return mapWorkspaceError(error);
  }

  if (error instanceof ServiceCatalogError) {
    if (error.code === "service_not_found" || error.code === "workspace_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "service_has_incidents") {
      return new HttpError(409, error.code, error.message);
    }

    if (error.code === "team_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "escalation_policy_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "webhook_endpoint_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "webhook_endpoint_disabled") {
      return new HttpError(409, error.code, error.message);
    }

    if (error.code === "webhook_endpoint_already_exists") {
      return new HttpError(409, error.code, error.message);
    }

    if (error.code === "workspace_mismatch") {
      return new HttpError(409, error.code, error.message);
    }
  }

  return error;
}
