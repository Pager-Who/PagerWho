import type { CreateEscalationPolicyRequest, UpdateEscalationPolicyRequest } from "@im/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { escalationApi, onCallApi, serviceApi, teamApi, userApi, workspaceApi } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryKeys";
import { useAuth } from "../../shared/auth";

export function useEscalationPolicyList() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.escalationPolicies.list(filters),
    queryFn: () => escalationApi.listEscalationPolicies(filters),
    enabled: Boolean(projectId),
  });
}

export function useEscalationPolicyUsers() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: () => userApi.listUsers(filters),
    enabled: Boolean(projectId),
  });
}

export function useEscalationPolicyWorkspaceMembers() {
  const { projectId } = useAuth();

  return useQuery({
    queryKey: projectId ? queryKeys.workspaces.members(projectId) : queryKeys.workspaces.members(""),
    queryFn: () => {
      if (!projectId) {
        throw new Error("Workspace id is required");
      }

      return workspaceApi.listMembers(projectId);
    },
    enabled: Boolean(projectId),
  });
}

export function useEscalationPolicyTeams() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.teams.list(filters),
    queryFn: () => teamApi.listTeams(filters),
    enabled: Boolean(projectId),
  });
}

export function useEscalationPolicySchedules() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.onCall.schedules(filters),
    queryFn: () => onCallApi.listOnCallSchedules(filters),
    enabled: Boolean(projectId),
  });
}

export function useEscalationPolicyServices() {
  const { projectId } = useAuth();
  const filters = projectId ? { limit: 100, workspace_id: projectId } : { limit: 100 };

  return useQuery({
    queryKey: queryKeys.services.list(filters),
    queryFn: () => serviceApi.listServices(filters),
    enabled: Boolean(projectId),
  });
}

export function useCreateEscalationPolicyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEscalationPolicyRequest) => escalationApi.createEscalationPolicy(input),
    onSuccess: async (policy) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.escalationPolicies.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.usage(policy.workspace_id) }),
      ]);
    },
  });
}

export function useUpdateEscalationPolicyMutation(policyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateEscalationPolicyRequest) => escalationApi.updateEscalationPolicy(policyId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.escalationPolicies.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.escalationPolicies.detail(policyId) }),
      ]);
    },
  });
}

export function useDeleteEscalationPolicyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (policyId: string) => escalationApi.deleteEscalationPolicy(policyId),
    onSuccess: async (policy) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.escalationPolicies.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.usage(policy.workspace_id) }),
      ]);
    },
  });
}
