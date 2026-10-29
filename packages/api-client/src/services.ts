import type {
  CreateServiceRequest,
  CreateServiceResponse,
  IncidentFilter,
  PaginatedIncidents,
  PaginatedServices,
  Service,
  ServiceFilter,
  ServiceWebhookIntegration,
  UpdateServiceWebhookIntegrationRequest,
  WorkspaceWebhookIntegrationType,
  UpdateServiceRequest,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createServiceApi(client: ApiClient) {
  return {
    listServices(filters: Partial<ServiceFilter> = {}) {
      return client.request<PaginatedServices>(`/services${buildQueryString(filters)}`);
    },
    createService(input: CreateServiceRequest) {
      return client.request<CreateServiceResponse>("/services", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    getService(serviceId: string) {
      return client.request<Service>(`/services/${serviceId}`);
    },
    updateService(serviceId: string, input: UpdateServiceRequest) {
      return client.request<Service>(`/services/${serviceId}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
    },
    listServiceWebhookIntegrations(serviceId: string) {
      return client.request<ServiceWebhookIntegration[]>(`/services/${serviceId}/webhook-integrations`);
    },
    updateServiceWebhookIntegration(serviceId: string, type: WorkspaceWebhookIntegrationType, input: UpdateServiceWebhookIntegrationRequest) {
      return client.request<ServiceWebhookIntegration>(`/services/${serviceId}/webhook-integrations/${type}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
    },
    deleteService(serviceId: string) {
      return client.request<Service>(`/services/${serviceId}`, {
        method: "DELETE",
      });
    },
    listServiceIncidents(serviceId: string, filters: Partial<Omit<IncidentFilter, "service_id" | "workspace_id">> = {}) {
      return client.request<PaginatedIncidents>(`/services/${serviceId}/incidents${buildQueryString(filters)}`);
    },
    getServiceWebhookEndpoint(serviceId: string) {
      return client.request<WebhookEndpoint>(`/services/${serviceId}/webhook-endpoint`);
    },
    listServiceWebhookEndpoints(serviceId: string) {
      return client.request<WebhookEndpoint[]>(`/services/${serviceId}/webhook-endpoints`);
    },
    createServiceWebhookEndpoint(serviceId: string) {
      return client.request<WebhookEndpointWithSecret>(`/services/${serviceId}/webhook-endpoints`, {
        method: "POST",
      });
    },
  };
}

function buildQueryString(filters: Record<string, unknown>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  return query.size > 0 ? `?${query.toString()}` : "";
}
