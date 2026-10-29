import type {
  AuditLogQuery,
  CreateTeamMemberRequest,
  CreateTeamRequest,
  CreateWorkspaceInviteRequest,
  CheckUserPhoneVerificationRequest,
  ResendEmailVerificationRequest,
  StartUserPhoneVerificationRequest,
  UpdateUserNotificationPreferencesRequest,
  UpdateWorkspaceMemberRolesRequest,
  UpdateWorkspaceNotificationProviderSettingRequest,
  UpdateWorkspaceWebhookIntegrationRequest,
  WorkspaceNotificationProvider,
  WorkspaceNotificationProviderSetting,
  WorkspaceWebhookIntegration,
  WorkspaceWebhookIntegrationType,
} from "@im/contracts";
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../../shared/api/queryKeys";
import { auditLogApi, authApi, escalationApi, onCallApi, serviceApi, teamApi, userApi, workspaceApi } from "../../shared/api/client";

export function useAuthMe() {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => authApi.getMe(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useResendEmailVerificationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ResendEmailVerificationRequest) => authApi.resendEmailVerification(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
      ]);
    },
  });
}

export function useSettingsUsers(workspaceId?: string) {
  const filters = workspaceId ? { workspace_id: workspaceId } : {};

  return useQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: () => userApi.listUsers(filters),
  });
}

export function useAuditLogs(filters: Partial<AuditLogQuery>, enabled: boolean) {
  const { cursor: _cursor, ...baseFilters } = filters;

  return useInfiniteQuery({
    queryKey: queryKeys.auditLogs.list(baseFilters),
    queryFn: ({ pageParam }) => auditLogApi.listAuditLogs({
      ...baseFilters,
      ...(pageParam ? { cursor: pageParam } : {}),
    }),
    enabled,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}

export function useUpdateUserNotificationPreferencesMutation(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateUserNotificationPreferencesRequest) => userApi.updateNotificationPreferences(userId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useStartPhoneVerificationMutation(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartUserPhoneVerificationRequest) => userApi.startPhoneVerification(userId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useCheckPhoneVerificationMutation(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CheckUserPhoneVerificationRequest) => userApi.checkPhoneVerification(userId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useMyWorkspaces() {
  return useQuery({
    queryKey: queryKeys.workspaces.mine(),
    queryFn: () => workspaceApi.listMyWorkspaces(),
  });
}

export function useMyWorkspaceInvites() {
  return useQuery({
    queryKey: queryKeys.workspaces.invites(),
    queryFn: () => workspaceApi.listMyInvites(),
  });
}

export function useSettingsTeams(workspaceId: string | undefined) {
  const filters = workspaceId ? { workspace_id: workspaceId } : {};

  return useQuery({
    queryKey: queryKeys.teams.list(filters),
    queryFn: () => teamApi.listTeams(filters),
    enabled: Boolean(workspaceId),
  });
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teams.members(teamId ?? ""),
    queryFn: () => {
      if (!teamId) {
        throw new Error("Team id is required");
      }

      return teamApi.listTeamMembers(teamId);
    },
    enabled: Boolean(teamId),
  });
}

export function useSettingsServices(workspaceId: string | undefined) {
  const filters = workspaceId ? { limit: 100, workspace_id: workspaceId } : { limit: 100 };

  return useQuery({
    queryKey: queryKeys.services.list(filters),
    queryFn: () => serviceApi.listServices(filters),
    enabled: Boolean(workspaceId),
  });
}

export function useSettingsOnCallSchedules(workspaceId: string | undefined) {
  const filters = workspaceId ? { workspace_id: workspaceId } : {};

  return useQuery({
    queryKey: queryKeys.onCall.schedules(filters),
    queryFn: () => onCallApi.listOnCallSchedules(filters),
    enabled: Boolean(workspaceId),
  });
}

export function useSettingsEscalationPolicies(workspaceId: string | undefined) {
  const filters = workspaceId ? { workspace_id: workspaceId } : {};

  return useQuery({
    queryKey: queryKeys.escalationPolicies.list(filters),
    queryFn: () => escalationApi.listEscalationPolicies(filters),
    enabled: Boolean(workspaceId),
  });
}

export function useWorkspaceMembers(workspaceIds: string[]) {
  return useQueries({
    queries: workspaceIds.map((workspaceId) => ({
      queryKey: queryKeys.workspaces.members(workspaceId),
      queryFn: () => workspaceApi.listMembers(workspaceId),
    })),
  });
}

export function useWorkspaceInvites(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? queryKeys.workspaces.workspaceInvites(workspaceId) : queryKeys.workspaces.workspaceInvites(""),
    queryFn: () => {
      if (!workspaceId) {
        throw new Error("Workspace id is required");
      }

      return workspaceApi.listInvites(workspaceId);
    },
    enabled: Boolean(workspaceId),
  });
}

export function useWorkspaceNotificationProviderSettings(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId
      ? queryKeys.workspaces.notificationProviderSettings(workspaceId)
      : queryKeys.workspaces.notificationProviderSettings(""),
    queryFn: () => {
      if (!workspaceId) {
        throw new Error("Workspace id is required");
      }

      return workspaceApi.listNotificationProviderSettings(workspaceId);
    },
    enabled: Boolean(workspaceId),
  });
}

export function useWorkspaceWebhookIntegrations(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.webhookIntegrations(workspaceId ?? ""),
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace id is required");
      return workspaceApi.listWebhookIntegrations(workspaceId);
    },
    enabled: Boolean(workspaceId),
  });
}

export function useWorkspaceUsage(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? queryKeys.workspaces.usage(workspaceId) : queryKeys.workspaces.usage(""),
    queryFn: () => {
      if (!workspaceId) {
        throw new Error("Workspace id is required");
      }

      return workspaceApi.getUsage(workspaceId);
    },
    enabled: Boolean(workspaceId),
  });
}

export function useCreateTeamMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTeamRequest) => teamApi.createTeam(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.teams.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
      ]);
    },
  });
}

export function useAddTeamMemberMutation(teamId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTeamMemberRequest) => {
      if (!teamId) {
        throw new Error("Team id is required");
      }

      return teamApi.addTeamMember(teamId, input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.teams.members(teamId ?? "") });
    },
  });
}

export function useRemoveTeamMemberMutation(teamId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => {
      if (!teamId) {
        throw new Error("Team id is required");
      }

      return teamApi.removeTeamMember(teamId, userId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.teams.members(teamId ?? "") });
    },
  });
}

export function useCreateWorkspaceInviteMutation(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWorkspaceInviteRequest) => workspaceApi.createInvite(workspaceId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.workspaceInvites(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.usage(workspaceId) }),
      ]);
    },
  });
}

export function useRevokeWorkspaceInviteMutation(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => workspaceApi.revokeInvite(workspaceId, inviteId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.workspaceInvites(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.usage(workspaceId) }),
      ]);
    },
  });
}

export function useUpdateWorkspaceMemberRolesMutation(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roles, userId }: UpdateWorkspaceMemberRolesRequest & { userId: string }) =>
      workspaceApi.updateMemberRoles(workspaceId, userId, { roles }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.members(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
      ]);
    },
  });
}

export function useUpdateWorkspaceNotificationProviderSettingMutation(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      input,
      provider,
    }: {
      input: UpdateWorkspaceNotificationProviderSettingRequest;
      provider: WorkspaceNotificationProvider;
    }) => workspaceApi.updateNotificationProviderSetting(workspaceId, provider, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData<WorkspaceNotificationProviderSetting[]>(
        queryKeys.workspaces.notificationProviderSettings(workspaceId),
        (current) => current?.map((setting) => setting.provider === updated.provider ? updated : setting) ?? [updated],
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.notificationProviderSettings(workspaceId) });
    },
  });
}

export function useUpdateWorkspaceWebhookIntegrationMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, type }: {
      input: UpdateWorkspaceWebhookIntegrationRequest;
      type: WorkspaceWebhookIntegrationType;
    }) => workspaceApi.updateWebhookIntegration(workspaceId, type, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData<WorkspaceWebhookIntegration[]>(
        queryKeys.workspaces.webhookIntegrations(workspaceId),
        (current) => current?.map((item) => item.type === updated.type ? updated : item) ?? [updated],
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.webhookIntegrations(workspaceId) });
    },
  });
}

export function useAcceptInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => workspaceApi.acceptInvite(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}

export function useDeclineInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => workspaceApi.declineInvite(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}
