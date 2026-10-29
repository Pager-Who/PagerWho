import type { CreateIncidentRequest, IncidentFilter, IncidentPriority, ManualEscalationRequest } from "@im/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { incidentApi, serviceApi, workspaceApi } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryKeys";
import { useAuth } from "../../shared/auth";

export function useIncidentList(filters: Partial<IncidentFilter>) {
  const { projectId } = useAuth();
  const scopedFilters = projectId ? { ...filters, workspace_id: projectId } : filters;

  return useQuery({
    queryKey: queryKeys.incidents.list(scopedFilters),
    queryFn: () => incidentApi.listIncidents(scopedFilters),
    enabled: Boolean(projectId),
  });
}

export function useIncidentServiceOptions() {
  const { projectId } = useAuth();
  const filters = projectId ? { limit: 100, workspace_id: projectId } : { limit: 100 };

  return useQuery({
    queryKey: queryKeys.services.list(filters),
    queryFn: () => serviceApi.listServices(filters),
    enabled: Boolean(projectId),
  });
}

export function useIncidentWorkspaceRoles(workspaceId?: string) {
  const { projectId } = useAuth();
  const targetWorkspaceId = workspaceId ?? projectId;

  return useQuery({
    queryKey: queryKeys.workspaces.mine(),
    queryFn: () => workspaceApi.listMyWorkspaces(),
    enabled: Boolean(targetWorkspaceId),
    select: (workspaces) => workspaces.find((workspace) => workspace.id === targetWorkspaceId)?.roles ?? [],
  });
}

export function useIncidentDetail(incidentId: string | undefined) {
  return useQuery({
    queryKey: incidentId ? queryKeys.incidents.detail(incidentId) : queryKeys.incidents.detail(""),
    queryFn: () => {
      if (!incidentId) {
        throw new Error("Incident id is required");
      }

      return incidentApi.getIncidentDetail(incidentId);
    },
    enabled: Boolean(incidentId),
  });
}

export function useIncidentTimeline(incidentId: string | undefined) {
  return useQuery({
    queryKey: incidentId ? queryKeys.incidents.timeline(incidentId) : queryKeys.incidents.timeline(""),
    queryFn: () => {
      if (!incidentId) {
        throw new Error("Incident id is required");
      }

      return incidentApi.getIncidentTimeline(incidentId, { limit: 100 });
    },
    enabled: Boolean(incidentId),
  });
}

export function useIncidentNotifications(incidentId: string | undefined) {
  return useQuery({
    queryKey: incidentId ? queryKeys.incidents.notifications(incidentId) : queryKeys.incidents.notifications(""),
    queryFn: () => {
      if (!incidentId) {
        throw new Error("Incident id is required");
      }

      return incidentApi.getIncidentNotifications(incidentId, { limit: 100 });
    },
    enabled: Boolean(incidentId),
  });
}

export function useCreateIncidentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateIncidentRequest) => incidentApi.createIncident(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
      ]);
    },
  });
}

export function useAcknowledgeIncidentMutation(incidentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => incidentApi.acknowledgeIncident(incidentId),
    onSuccess: async (incident) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.detail(incidentId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.incidents(incident.service_id) }),
      ]);
    },
  });
}

export function useResolveIncidentMutation(incidentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => incidentApi.resolveIncident(incidentId),
    onSuccess: async (incident) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.detail(incidentId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.incidents(incident.service_id) }),
      ]);
    },
  });
}

export function useUpdateIncidentPriorityMutation(incidentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (priority: IncidentPriority) => incidentApi.updateIncidentPriority(incidentId, { priority }),
    onSuccess: async (incident) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.detail(incidentId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.incidents(incident.service_id) }),
      ]);
    },
  });
}

export function useTriggerManualEscalationMutation(incidentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ManualEscalationRequest) => incidentApi.triggerManualEscalation(incidentId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.detail(incidentId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.timeline(incidentId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.notifications(incidentId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents.escalation(incidentId) }),
      ]);
    },
  });
}
