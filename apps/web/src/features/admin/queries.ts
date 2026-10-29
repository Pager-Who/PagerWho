import type {
  PlatformListUsersQuery,
  PlatformListWorkspacesQuery,
  PlatformDiagnosticsQuery,
  PlatformInspectorQuery,
  PlatformResourceListQuery,
  PlatformReasonRequest,
  PlatformSendAuthEmailRequest,
  PlatformUpdateWorkspaceMemberRolesRequest,
  PlatformUpdateWorkspaceQuotaOverrideRequest,
} from "@im/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { platformApi } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryKeys";

export function usePlatformMe() {
  return useQuery({
    queryKey: queryKeys.platform.me(),
    queryFn: () => platformApi.getMe(),
    retry: false,
  });
}

export function usePlatformOverview(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.platform.overview(),
    queryFn: () => platformApi.getOverview(),
    enabled,
    refetchInterval: 30_000,
  });
}

export function usePlatformDiagnostics(filters: Partial<PlatformDiagnosticsQuery>, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.platform.diagnostics(filters),
    queryFn: () => platformApi.getDiagnostics(filters),
    enabled,
    refetchInterval: 30_000,
  });
}

export function usePlatformInspector(query: PlatformInspectorQuery | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.platform.inspector(query ?? {}),
    queryFn: () => {
      if (!query) {
        throw new Error("Inspector query is required");
      }

      return platformApi.inspect(query);
    },
    enabled: Boolean(query) && enabled,
    // Each read creates an audit entry. Only intentional navigation or refresh should repeat it.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export function usePlatformResources(query: PlatformResourceListQuery, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.platform.resources(query),
    queryFn: () => platformApi.listResources(query),
    enabled,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export function usePlatformUsers(filters: Partial<PlatformListUsersQuery>, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.platform.users(filters),
    queryFn: () => platformApi.listUsers(filters),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function usePlatformUser(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: userId ? queryKeys.platform.user(userId) : queryKeys.platform.user(""),
    queryFn: () => {
      if (!userId) {
        throw new Error("User id is required");
      }

      return platformApi.getUser(userId);
    },
    enabled: Boolean(userId) && enabled,
  });
}

export function usePlatformWorkspaces(filters: Partial<PlatformListWorkspacesQuery>, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.platform.workspaces(filters),
    queryFn: () => platformApi.listWorkspaces(filters),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function usePlatformWorkspace(workspaceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: workspaceId ? queryKeys.platform.workspace(workspaceId) : queryKeys.platform.workspace(""),
    queryFn: () => {
      if (!workspaceId) {
        throw new Error("Workspace id is required");
      }

      return platformApi.getWorkspace(workspaceId);
    },
    enabled: Boolean(workspaceId) && enabled,
  });
}

export function useSuspendPlatformUserMutation(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlatformReasonRequest) => platformApi.suspendUser(userId, input),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
    },
  });
}

export function useRestorePlatformUserMutation(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlatformReasonRequest) => platformApi.restoreUser(userId, input),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
    },
  });
}

export function useRevokePlatformUserSessionsMutation(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlatformReasonRequest) => platformApi.revokeUserSessions(userId, input),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
    },
  });
}

export function useSendPlatformAuthEmailMutation(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlatformSendAuthEmailRequest) => platformApi.sendAuthEmail(userId, input),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
    },
  });
}

export function useRetryPlatformNotificationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ notificationId, reason }: { notificationId: string; reason: string }) =>
      platformApi.retryNotification(notificationId, { reason }),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useSuspendPlatformWorkspaceMutation(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlatformReasonRequest) => platformApi.suspendWorkspace(workspaceId, input),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
    },
  });
}

export function useRestorePlatformWorkspaceMutation(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlatformReasonRequest) => platformApi.restoreWorkspace(workspaceId, input),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
    },
  });
}

export function useUpdatePlatformWorkspaceQuotaOverrideMutation(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlatformUpdateWorkspaceQuotaOverrideRequest) =>
      platformApi.updateWorkspaceQuotaOverride(workspaceId, input),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
    },
  });
}

export function useUpdatePlatformWorkspaceMemberRolesMutation(workspaceId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PlatformUpdateWorkspaceMemberRolesRequest) =>
      platformApi.updateWorkspaceMemberRoles(workspaceId, userId, input),
    onSuccess: async () => {
      await invalidatePlatform(queryClient);
    },
  });
}

async function invalidatePlatform(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.platform.all,
    // An unrelated admin action must not create new resource-inspection audit records.
    predicate: (query) => query.queryKey[1] !== "inspector" && query.queryKey[1] !== "resources",
  });
  await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
}
