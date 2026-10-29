import type {
  CreateServiceRequest,
  CreateServiceResponse,
  CreateWebhookEndpointRequest,
  PaginatedResponse,
  Service,
  ServiceFilter,
  ServiceStatus,
  UpdateServiceRequest,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
} from "@im/contracts";
import type { PrismaClient, TransactionClient } from "@im/db";

import { recordActivityLog } from "../activity";
import { QuotaService } from "../quotas";
import { ServiceCatalogError } from "./service.errors";
import {
  buildWebhookUrl,
  buildWebhookUrlWithSecret,
  generateWebhookEndpointId,
  generateWebhookSecret,
  hashWebhookSecret,
  type WebhookSecretOptions,
} from "../webhooks/webhook-secret";

type ServiceRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  teamId: string | null;
  escalationPolicyId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type OpenIncidentSummary = {
  openIncidentCount: number;
  status: ServiceStatus;
};

type WebhookEndpointRecord = {
  id: string;
  serviceId: string;
  name: string;
  secretHash: string;
  createdAt: Date;
  disabledAt: Date | null;
};

type ServiceListFilters = Partial<ServiceFilter> & {
  workspaceId?: string;
  workspaceIds?: string[];
};

export class ServiceCatalogService {
  private readonly quotaService: QuotaService;

  constructor(
    private readonly db: PrismaClient,
    private readonly options: WebhookSecretOptions = {},
  ) {
    this.quotaService = new QuotaService(db);
  }

  async listServices(filters: ServiceListFilters = {}): Promise<PaginatedResponse<Service>> {
    const workspaceId = filters.workspace_id ?? filters.workspaceId;
    const limit = filters.limit ?? 25;
    const services = await this.db.service.findMany({
      where: {
        ...(workspaceId
          ? { workspaceId }
          : filters.workspaceIds
            ? { workspaceId: { in: filters.workspaceIds } }
            : {}),
        ...(filters.health === "impacted"
          ? { incidents: { some: { status: { in: ["triggered", "acknowledged"] as const }, severity: { in: ["critical", "high", "medium"] as const } } } }
          : filters.health === "normal"
            ? { incidents: { none: { status: { in: ["triggered", "acknowledged"] as const }, severity: { in: ["critical", "high", "medium"] as const } } } }
            : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...(filters.cursor
        ? {
            cursor: {
              id: filters.cursor,
            },
            skip: 1,
          }
        : {}),
      take: limit + 1,
    });

    const items = await this.mapServices(services.slice(0, limit));

    return {
      items,
      next_cursor: services.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async getService(serviceId: string): Promise<Service | null> {
    const service = await this.db.service.findUnique({
      where: {
        id: serviceId,
      },
    });

    if (!service) {
      return null;
    }

    const [mappedService] = await this.mapServices([service]);
    return mappedService ?? null;
  }

  async createService(input: CreateServiceRequest): Promise<CreateServiceResponse> {
    const references = await this.assertCreateServiceReferences(input);
    await this.quotaService.assertCanCreateWorkspaceResource({
      resource: "services",
      workspaceId: references.workspaceId,
    });

    const created = await this.db.$transaction(async (tx) => {
      const createdService = await tx.service.create({
        data: {
          workspaceId: references.workspaceId,
          name: input.name,
          description: input.description ?? null,
          teamId: input.team_id ?? null,
          escalationPolicyId: input.escalation_policy_id ?? null,
        },
      });

      const endpoint = await this.createWebhookEndpointRecord(tx, createdService.id);

      await recordActivityLog(tx, {
        workspaceId: createdService.workspaceId,
        resourceType: "service",
        resourceId: createdService.id,
        action: "service.created",
        message: `Service created: ${createdService.name}`,
        metadata: {
          team_id: createdService.teamId,
          escalation_policy_id: createdService.escalationPolicyId,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: createdService.workspaceId,
        resourceType: "webhook_endpoint",
        resourceId: endpoint.record.id,
        action: "webhook_endpoint.created",
        message: `Webhook endpoint created: ${endpoint.record.name}`,
        metadata: {
          service_id: createdService.id,
        },
      });

      return {
        defaultWebhookEndpoint: endpoint,
        service: createdService,
      };
    });

    return {
      default_webhook_endpoint: this.mapWebhookEndpointWithSecret(
        created.defaultWebhookEndpoint.record,
        created.defaultWebhookEndpoint.secret,
      ),
      service: this.mapService(created.service, {
        openIncidentCount: 0,
        status: "normal",
      }),
    };
  }

  async updateService(serviceId: string, input: UpdateServiceRequest): Promise<Service> {
    const existing = await this.db.service.findUnique({
      where: {
        id: serviceId,
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    if (!existing) {
      throw new ServiceCatalogError("service_not_found", "Service not found");
    }

    await this.assertUpdateServiceReferences(existing.workspaceId, input);

    const service = await this.db.$transaction(async (tx) => {
      const updated = await tx.service.update({
        where: {
          id: serviceId,
        },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.team_id !== undefined ? { teamId: input.team_id } : {}),
          ...(input.escalation_policy_id !== undefined ? { escalationPolicyId: input.escalation_policy_id } : {}),
        },
      });

      await recordActivityLog(tx, {
        workspaceId: updated.workspaceId,
        resourceType: "service",
        resourceId: serviceId,
        action: "service.updated",
        message: `Service updated: ${updated.name}`,
        metadata: {
          changed_fields: Object.keys(input),
          team_id: updated.teamId,
          escalation_policy_id: updated.escalationPolicyId,
        },
      });

      return updated;
    });

    const [mappedService] = await this.mapServices([service]);
    return mappedService ?? this.mapService(service, { openIncidentCount: 0, status: "normal" });
  }

  async deleteService(serviceId: string): Promise<Service> {
    const existing = await this.db.service.findUnique({
      where: {
        id: serviceId,
      },
    });

    if (!existing) {
      throw new ServiceCatalogError("service_not_found", "Service not found");
    }

    const incidentCount = await this.db.incident.count({
      where: {
        serviceId,
      },
    });

    if (incidentCount > 0) {
      throw new ServiceCatalogError("service_has_incidents", "Service has incidents and cannot be deleted");
    }

    const deleted = await this.db.$transaction(async (tx) => {
      await recordActivityLog(tx, {
        workspaceId: existing.workspaceId,
        resourceType: "service",
        resourceId: serviceId,
        action: "service.deleted",
        message: `Service deleted: ${existing.name}`,
        metadata: {
          team_id: existing.teamId,
          escalation_policy_id: existing.escalationPolicyId,
        },
      });

      await tx.onCallSchedule.updateMany({
        where: {
          serviceId,
        },
        data: {
          serviceId: null,
        },
      });

      await tx.workflow.deleteMany({
        where: {
          workspaceId: existing.workspaceId,
          AND: [
            { graphMetadata: { path: ["managed_kind"], equals: "service_webhook_integration" } },
            { graphMetadata: { path: ["service_id"], equals: serviceId } },
          ],
        },
      });

      return tx.service.delete({
        where: {
          id: serviceId,
        },
      });
    });

    return this.mapService(deleted, { openIncidentCount: 0, status: "normal" });
  }

  private async assertCreateServiceReferences(input: CreateServiceRequest): Promise<{ workspaceId: string }> {
    const workspaceId = await this.resolveCreateWorkspaceId(input);

    if (input.team_id) {
      const team = await this.db.team.findUnique({
        where: {
          id: input.team_id,
        },
        select: {
          id: true,
          workspaceId: true,
        },
      });

      if (!team) {
        throw new ServiceCatalogError("team_not_found", "Team not found");
      }

      if (workspaceId !== team.workspaceId) {
        throw new ServiceCatalogError("workspace_mismatch", "Service team belongs to a different workspace");
      }
    }

    if (input.escalation_policy_id) {
      await this.assertEscalationPolicyWorkspace(input.escalation_policy_id, workspaceId);
    }

    return {
      workspaceId,
    };
  }

  private async resolveCreateWorkspaceId(input: CreateServiceRequest): Promise<string> {
    if (input.workspace_id) {
      const workspace = await this.db.workspace.findUnique({
        where: {
          id: input.workspace_id,
        },
        select: {
          id: true,
        },
      });

      if (!workspace) {
        throw new ServiceCatalogError("workspace_not_found", "Workspace not found");
      }

      return workspace.id;
    }

    if (!input.team_id) {
      throw new ServiceCatalogError("workspace_not_found", "workspace_id is required when team_id is not provided");
    }

    const team = await this.db.team.findUnique({
      where: {
        id: input.team_id,
      },
      select: {
        workspaceId: true,
      },
    });

    if (!team) {
      throw new ServiceCatalogError("team_not_found", "Team not found");
    }

    return team.workspaceId;
  }

  private async assertUpdateServiceReferences(
    workspaceId: string,
    input: {
      escalation_policy_id?: string | null | undefined;
      team_id?: string | null | undefined;
    },
  ) {
    if (input.team_id) {
      const team = await this.db.team.findUnique({
        where: {
          id: input.team_id,
        },
        select: {
          id: true,
          workspaceId: true,
        },
      });

      if (!team) {
        throw new ServiceCatalogError("team_not_found", "Team not found");
      }

      if (team.workspaceId !== workspaceId) {
        throw new ServiceCatalogError("workspace_mismatch", "Service team belongs to a different workspace");
      }
    }

    if (input.escalation_policy_id) {
      await this.assertEscalationPolicyWorkspace(input.escalation_policy_id, workspaceId);
    }
  }

  private async assertEscalationPolicyWorkspace(policyId: string, workspaceId: string) {
    const escalationPolicy = await this.db.escalationPolicy.findUnique({
      where: {
        id: policyId,
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    if (!escalationPolicy) {
      throw new ServiceCatalogError("escalation_policy_not_found", "Escalation policy not found");
    }

    if (escalationPolicy.workspaceId !== workspaceId) {
      throw new ServiceCatalogError("workspace_mismatch", "Escalation policy belongs to a different workspace");
    }
  }

  async getServiceWebhookEndpoint(serviceId: string): Promise<WebhookEndpoint | null> {
    const endpoint = await this.db.webhookEndpoint.findFirst({
      where: {
        serviceId,
        disabledAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return endpoint ? this.mapWebhookEndpoint(endpoint) : null;
  }

  async listServiceWebhookEndpoints(serviceId: string): Promise<WebhookEndpoint[]> {
    const endpoints = await this.db.webhookEndpoint.findMany({
      where: {
        serviceId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return endpoints.map((endpoint) => this.mapWebhookEndpoint(endpoint));
  }

  async createServiceWebhookEndpoint(
    serviceId: string,
    _input: CreateWebhookEndpointRequest = {},
  ): Promise<WebhookEndpointWithSecret> {
    const existingService = await this.db.service.findUnique({
      where: {
        id: serviceId,
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    if (!existingService) {
      throw new ServiceCatalogError("service_not_found", "Service not found");
    }

    const existingEndpoint = await this.db.webhookEndpoint.findFirst({
      where: {
        serviceId,
        disabledAt: null,
      },
      select: {
        id: true,
      },
    });

    if (existingEndpoint) {
      throw new ServiceCatalogError("webhook_endpoint_already_exists", "Service already has an active webhook endpoint");
    }

    const endpoint = await this.db.$transaction(async (tx) => {
      const created = await this.createWebhookEndpointRecord(tx, serviceId);

      await recordActivityLog(tx, {
        workspaceId: existingService.workspaceId,
        resourceType: "webhook_endpoint",
        resourceId: created.record.id,
        action: "webhook_endpoint.created",
        message: `Webhook endpoint created: ${created.record.name}`,
        metadata: {
          service_id: serviceId,
        },
      });

      return created;
    });

    return this.mapWebhookEndpointWithSecret(endpoint.record, endpoint.secret);
  }

  async rotateWebhookEndpointSecret(endpointId: string): Promise<WebhookEndpointWithSecret | null> {
    const endpoint = await this.db.webhookEndpoint.findUnique({
      where: {
        id: endpointId,
      },
      include: {
        service: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!endpoint) {
      return null;
    }

    if (endpoint.disabledAt) {
      throw new ServiceCatalogError("webhook_endpoint_disabled", "Webhook endpoint is disabled");
    }

    const secret = generateWebhookSecret();
    const secretHash = await hashWebhookSecret(secret, this.options);
    const updatedEndpoint = await this.db.$transaction(async (tx) => {
      const updated = await tx.webhookEndpoint.update({
        where: {
          id: endpointId,
        },
        data: {
          secretHash,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: endpoint.service.workspaceId,
        resourceType: "webhook_endpoint",
        resourceId: endpointId,
        action: "webhook_endpoint.secret_rotated",
        message: `Webhook endpoint secret rotated: ${updated.name}`,
        metadata: {
          service_id: updated.serviceId,
        },
      });

      return updated;
    });

    return this.mapWebhookEndpointWithSecret(updatedEndpoint, secret);
  }

  async disableWebhookEndpoint(endpointId: string): Promise<WebhookEndpoint | null> {
    return this.deleteWebhookEndpoint(endpointId);
  }

  async deleteWebhookEndpoint(endpointId: string): Promise<WebhookEndpoint | null> {
    const endpoint = await this.db.webhookEndpoint.findUnique({
      where: {
        id: endpointId,
      },
      include: {
        service: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!endpoint) {
      return null;
    }

    const disabledEndpoint = await this.db.$transaction(async (tx) => {
      const disabled = await tx.webhookEndpoint.update({
        where: {
          id: endpointId,
        },
        data: {
          disabledAt: endpoint.disabledAt ?? new Date(),
        },
      });

      await recordActivityLog(tx, {
        workspaceId: endpoint.service.workspaceId,
        resourceType: "webhook_endpoint",
        resourceId: endpointId,
        action: "webhook_endpoint.deleted",
        message: `Webhook endpoint deleted: ${disabled.name}`,
        metadata: {
          service_id: disabled.serviceId,
        },
      });

      return disabled;
    });

    return this.mapWebhookEndpoint(disabledEndpoint);
  }

  private async createWebhookEndpointRecord(
    tx: Pick<PrismaClient | TransactionClient, "webhookEndpoint">,
    serviceId: string,
  ) {
    const id = generateWebhookEndpointId();
    const secret = generateWebhookSecret();
    const secretHash = await hashWebhookSecret(secret, this.options);
    const record = await tx.webhookEndpoint.create({
      data: {
        id,
        serviceId,
        name: "Service Webhook",
        secretHash,
      },
    });

    return {
      record,
      secret,
    };
  }

  private async mapServices(services: ServiceRecord[]): Promise<Service[]> {
    const summaries = await this.getOpenIncidentSummaries(services.map((service) => service.id));

    return services.map((service) =>
      this.mapService(
        service,
        summaries.get(service.id) ?? {
          openIncidentCount: 0,
          status: "normal",
        },
      ),
    );
  }

  private async getOpenIncidentSummaries(serviceIds: string[]): Promise<Map<string, OpenIncidentSummary>> {
    if (serviceIds.length === 0) {
      return new Map();
    }

    const openIncidents = await this.db.incident.findMany({
      where: {
        serviceId: {
          in: serviceIds,
        },
        status: {
          in: ["triggered", "acknowledged"],
        },
      },
      select: {
        serviceId: true,
        severity: true,
      },
    });

    const summaries = new Map<string, OpenIncidentSummary>();

    for (const incident of openIncidents) {
      const current = summaries.get(incident.serviceId) ?? {
        openIncidentCount: 0,
        status: "normal" as ServiceStatus,
      };

      current.openIncidentCount += 1;
      current.status = this.pickHigherServiceStatus(current.status, this.statusFromSeverity(incident.severity));
      summaries.set(incident.serviceId, current);
    }

    return summaries;
  }

  private mapService(service: ServiceRecord, summary: OpenIncidentSummary): Service {
    return {
      id: service.id,
      workspace_id: service.workspaceId,
      name: service.name,
      description: service.description,
      team_id: service.teamId,
      escalation_policy_id: service.escalationPolicyId,
      status: summary.status,
      open_incident_count: summary.openIncidentCount,
      created_at: service.createdAt.toISOString(),
      updated_at: service.updatedAt.toISOString(),
    };
  }

  private mapWebhookEndpoint(endpoint: WebhookEndpointRecord): WebhookEndpoint {
    return {
      id: endpoint.id,
      service_id: endpoint.serviceId,
      name: endpoint.name,
      url: buildWebhookUrl(endpoint.id, this.options),
      has_secret: endpoint.secretHash.length > 0,
      created_at: endpoint.createdAt.toISOString(),
      disabled_at: endpoint.disabledAt?.toISOString() ?? null,
    };
  }

  private mapWebhookEndpointWithSecret(endpoint: WebhookEndpointRecord, secret: string): WebhookEndpointWithSecret {
    return {
      ...this.mapWebhookEndpoint(endpoint),
      secret,
      url_with_secret: buildWebhookUrlWithSecret(endpoint.id, secret, this.options),
    };
  }

  private statusFromSeverity(severity: string): ServiceStatus {
    if (severity === "critical") {
      return "critical";
    }

    if (severity === "high") {
      return "major";
    }

    if (severity === "medium") {
      return "degraded";
    }

    return "normal";
  }

  private pickHigherServiceStatus(current: ServiceStatus, next: ServiceStatus): ServiceStatus {
    const priority: Record<ServiceStatus, number> = {
      normal: 0,
      degraded: 1,
      major: 2,
      critical: 3,
    };

    return priority[next] > priority[current] ? next : current;
  }
}
