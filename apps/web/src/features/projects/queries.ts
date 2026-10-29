import type { CreateWorkspaceRequest } from "@im/contracts";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { escalationApi, incidentApi, onCallApi, serviceApi, teamApi, workspaceApi } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryKeys";

export function useMyProjects() {
  return useQuery({
    queryKey: queryKeys.workspaces.mine(),
    queryFn: () => workspaceApi.listMyWorkspaces(),
  });
}

export function useMyProjectInvites() {
  return useQuery({
    queryKey: queryKeys.workspaces.invites(),
    queryFn: () => workspaceApi.listMyInvites(),
  });
}

export function useProjectUsages(projectIds: string[]) {
  return useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: queryKeys.workspaces.usage(projectId),
      queryFn: () => workspaceApi.getUsage(projectId),
    })),
  });
}

export function useProjectSetupTeams(projectId: string | undefined) {
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.teams.list(filters),
    queryFn: () => teamApi.listTeams(filters),
    enabled: Boolean(projectId),
  });
}

export function useProjectSetupServices(projectId: string | undefined) {
  const filters = projectId ? { limit: 100, workspace_id: projectId } : { limit: 100 };

  return useQuery({
    queryKey: queryKeys.services.list(filters),
    queryFn: () => serviceApi.listServices(filters),
    enabled: Boolean(projectId),
  });
}

export function useProjectSetupIncidents(projectId: string | undefined) {
  const filters = projectId ? { limit: 100, workspace_id: projectId } : { limit: 100 };

  return useQuery({
    queryKey: queryKeys.incidents.list(filters),
    queryFn: () => incidentApi.listIncidents(filters),
    enabled: Boolean(projectId),
  });
}

export function useProjectSetupOnCallSchedules(projectId: string | undefined) {
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.onCall.schedules(filters),
    queryFn: () => onCallApi.listOnCallSchedules(filters),
    enabled: Boolean(projectId),
  });
}

export function useProjectSetupEscalationPolicies(projectId: string | undefined) {
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.escalationPolicies.list(filters),
    queryFn: () => escalationApi.listEscalationPolicies(filters),
    enabled: Boolean(projectId),
  });
}

export function useProjectSetupNotificationProviders(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? queryKeys.workspaces.notificationProviderSettings(projectId) : queryKeys.workspaces.notificationProviderSettings(""),
    queryFn: () => {
      if (!projectId) {
        throw new Error("Project id is required");
      }

      return workspaceApi.listNotificationProviderSettings(projectId);
    },
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWorkspaceRequest) => workspaceApi.createWorkspace(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}

export function useAcceptProjectInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => workspaceApi.acceptInvite(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}

export function useDeclineProjectInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => workspaceApi.declineInvite(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}
