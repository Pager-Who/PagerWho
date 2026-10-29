import { useQueries, useQuery } from "@tanstack/react-query";

import { escalationApi, incidentApi, onCallApi, serviceApi, userApi, workspaceApi } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryKeys";
import { useAuth } from "../../shared/auth";

export function useOverviewIncidents() {
  const { projectId } = useAuth();
  const filters = projectId ? { limit: 100, status: "open" as const, workspace_id: projectId } : { limit: 100, status: "open" as const };

  return useQuery({
    queryKey: queryKeys.incidents.list(filters),
    queryFn: () => incidentApi.listIncidents(filters),
    enabled: Boolean(projectId),
    refetchInterval: 30_000,
  });
}

export function useOverviewServices() {
  const { projectId } = useAuth();
  const filters = projectId ? { limit: 100, workspace_id: projectId } : { limit: 100 };

  return useQuery({
    queryKey: queryKeys.services.list(filters),
    queryFn: () => serviceApi.listServices(filters),
    enabled: Boolean(projectId),
    refetchInterval: 30_000,
  });
}

export function useOverviewOnCallSchedules() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.onCall.schedules(filters),
    queryFn: () => onCallApi.listOnCallSchedules(filters),
    enabled: Boolean(projectId),
    refetchInterval: 30_000,
  });
}

export function useOverviewEscalationPolicies() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.escalationPolicies.list(filters),
    queryFn: () => escalationApi.listEscalationPolicies(filters),
    enabled: Boolean(projectId),
  });
}

export function useOverviewWorkspaceMembers() {
  const { projectId } = useAuth();

  return useQuery({
    queryKey: projectId ? queryKeys.workspaces.members(projectId) : queryKeys.workspaces.members(""),
    queryFn: () => {
      if (!projectId) {
        throw new Error("Project id is required");
      }

      return workspaceApi.listMembers(projectId);
    },
    enabled: Boolean(projectId),
  });
}

export function useOverviewUsers() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: () => userApi.listUsers(filters),
    enabled: Boolean(projectId),
  });
}

export function useOverviewCurrentOnCall(serviceIds: string[]) {
  return useQueries({
    queries: serviceIds.map((serviceId) => ({
      queryKey: queryKeys.onCall.current(serviceId),
      queryFn: () => onCallApi.getCurrentOnCall({ service_id: serviceId }),
      staleTime: 30_000,
      refetchInterval: 30_000,
    })),
  });
}
