import type { CreateServiceRequest, IncidentFilter, UpdateServiceRequest, UpdateServiceWebhookIntegrationRequest, WorkspaceWebhookIntegrationType } from "@im/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { escalationApi, onCallApi, serviceApi, teamApi, userApi, webhookApi, workspaceApi } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryKeys";
import { useAuth } from "../../shared/auth";

export function useServiceList(cursor?: string, health?: "impacted" | "normal") {
  const { projectId } = useAuth();
  const filters = { limit: 100, ...(projectId ? { workspace_id: projectId } : {}), ...(cursor ? { cursor } : {}), ...(health ? { health } : {}) };

  return useQuery({
    queryKey: queryKeys.services.list(filters),
    queryFn: () => serviceApi.listServices(filters),
    enabled: Boolean(projectId),
  });
}

export function useServiceWorkspaceUsage() {
  const { projectId } = useAuth();

  return useQuery({
    queryKey: projectId ? queryKeys.workspaces.usage(projectId) : queryKeys.workspaces.usage(""),
    queryFn: () => {
      if (!projectId) {
        throw new Error("Project id is required");
      }

      return workspaceApi.getUsage(projectId);
    },
    enabled: Boolean(projectId),
  });
}

export function useServiceTeams() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.teams.list(filters),
    queryFn: () => teamApi.listTeams(filters),
    enabled: Boolean(projectId),
  });
}

export function useServiceUsers() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: () => userApi.listUsers(filters),
    enabled: Boolean(projectId),
  });
}

export function useServiceEscalationPolicies() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.escalationPolicies.list(filters),
    queryFn: () => escalationApi.listEscalationPolicies(filters),
    enabled: Boolean(projectId),
  });
}

export function useServiceDetail(serviceId: string | undefined) {
  return useQuery({
    queryKey: serviceId ? queryKeys.services.detail(serviceId) : queryKeys.services.detail(""),
    queryFn: () => {
      if (!serviceId) {
        throw new Error("Service id is required");
      }

      return serviceApi.getService(serviceId);
    },
    enabled: Boolean(serviceId),
  });
}

export function useServiceWebhookIntegrations(serviceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.services.webhookIntegrations(serviceId ?? ""),
    queryFn: () => serviceApi.listServiceWebhookIntegrations(serviceId!),
    enabled: Boolean(serviceId),
  });
}

export function useUpdateServiceWebhookIntegrationMutation(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, input }: { type: WorkspaceWebhookIntegrationType; input: UpdateServiceWebhookIntegrationRequest }) =>
      serviceApi.updateServiceWebhookIntegration(serviceId, type, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.services.webhookIntegrations(serviceId) });
    },
  });
}

export function useServiceIncidents(
  serviceId: string | undefined,
  filters: Partial<Omit<IncidentFilter, "service_id" | "workspace_id">> = {},
) {
  return useQuery({
    queryKey: serviceId ? queryKeys.services.incidents(serviceId, filters) : queryKeys.services.incidents("", filters),
    queryFn: () => {
      if (!serviceId) {
        throw new Error("Service id is required");
      }

      return serviceApi.listServiceIncidents(serviceId, filters);
    },
    enabled: Boolean(serviceId),
  });
}

export function useServiceWebhookEndpoints(serviceId: string | undefined) {
  return useQuery({
    queryKey: serviceId ? queryKeys.services.webhookEndpoints(serviceId) : queryKeys.services.webhookEndpoints(""),
    queryFn: () => {
      if (!serviceId) {
        throw new Error("Service id is required");
      }

      return serviceApi.listServiceWebhookEndpoints(serviceId);
    },
    enabled: Boolean(serviceId),
  });
}

export function useServiceEscalationPolicy(policyId: string | null | undefined) {
  return useQuery({
    queryKey: policyId ? queryKeys.escalationPolicies.detail(policyId) : queryKeys.escalationPolicies.detail(""),
    queryFn: () => {
      if (!policyId) {
        throw new Error("Escalation policy id is required");
      }

      return escalationApi.getEscalationPolicy(policyId);
    },
    enabled: Boolean(policyId),
  });
}

export function useServiceOnCallSchedules() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.onCall.schedules(filters),
    queryFn: () => onCallApi.listOnCallSchedules(filters),
    enabled: Boolean(projectId),
  });
}

export function useServiceCurrentOnCallForService(serviceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.onCall.current(serviceId),
    queryFn: () => {
      if (!serviceId) {
        throw new Error("Service id is required");
      }

      return onCallApi.getCurrentOnCall({ service_id: serviceId });
    },
    enabled: Boolean(serviceId),
    staleTime: 30_000,
  });
}

export function useCreateServiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateServiceRequest) => serviceApi.createService(input),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.usage(created.service.workspace_id) }),
      ]);
    },
  });
}

export function useUpdateServiceMutation(serviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateServiceRequest) => serviceApi.updateService(serviceId, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.services.detail(serviceId), updated);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.onCall.current(serviceId) }),
      ]);
    },
  });
}

export function useDeleteServiceMutation(serviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => serviceApi.deleteService(serviceId),
    onSuccess: async (deleted) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.usage(deleted.workspace_id) }),
        queryClient.removeQueries({ queryKey: queryKeys.services.detail(serviceId) }),
      ]);
    },
  });
}

export function useCreateServiceWebhookEndpointMutation(serviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => serviceApi.createServiceWebhookEndpoint(serviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.services.webhookEndpoints(serviceId) });
    },
  });
}

export function useRotateWebhookEndpointSecretMutation(serviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (endpointId: string) => webhookApi.rotateWebhookEndpointSecret(endpointId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.services.webhookEndpoints(serviceId) });
    },
  });
}

export function useDeleteWebhookEndpointMutation(serviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (endpointId: string) => webhookApi.deleteWebhookEndpoint(endpointId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.services.webhookEndpoints(serviceId) });
    },
  });
}

export function useTestWebhookEndpointMutation(serviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      endpointId,
      payload,
    }: {
      endpointId: string;
      payload: unknown;
    }) => webhookApi.testWebhookEndpoint(endpointId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.detail(serviceId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.incidents(serviceId) }),
      ]);
    },
  });
}
