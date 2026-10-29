import type { CreateOnCallOverrideRequest, CreateOnCallScheduleRequest, OnCallSchedulePreviewQuery, UpdateOnCallScheduleRequest } from "@im/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { onCallApi, serviceApi, teamApi, userApi, workspaceApi } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryKeys";
import { useAuth } from "../../shared/auth";

export function useOnCallSchedules() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.onCall.schedules(filters),
    queryFn: () => onCallApi.listOnCallSchedules(filters),
    enabled: Boolean(projectId),
  });
}

export function useOnCallServices() {
  const { projectId } = useAuth();
  const filters = projectId ? { limit: 100, workspace_id: projectId } : { limit: 100 };

  return useQuery({
    queryKey: queryKeys.services.list(filters),
    queryFn: () => serviceApi.listServices(filters),
    enabled: Boolean(projectId),
  });
}

export function useOnCallTeams() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.teams.list(filters),
    queryFn: () => teamApi.listTeams(filters),
    enabled: Boolean(projectId),
  });
}

export function useOnCallUsers() {
  const { projectId } = useAuth();
  const filters = projectId ? { workspace_id: projectId } : {};

  return useQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: () => userApi.listUsers(filters),
    enabled: Boolean(projectId),
  });
}

export function useOnCallWorkspaceMembers() {
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

export function useCreateOnCallScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOnCallScheduleRequest) => onCallApi.createOnCallSchedule(input),
    onSuccess: async (schedule) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.onCall.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.usage(schedule.workspace_id) }),
      ]);
    },
  });
}

export function useDeleteOnCallScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scheduleId: string) => onCallApi.deleteOnCallSchedule(scheduleId),
    onSuccess: async (schedule) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.onCall.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.escalationPolicies.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.usage(schedule.workspace_id) }),
      ]);
    },
  });
}

export function useUpdateOnCallScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, scheduleId }: { input: UpdateOnCallScheduleRequest; scheduleId: string }) =>
      onCallApi.updateOnCallSchedule(scheduleId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.onCall.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.escalationPolicies.all }),
      ]);
    },
  });
}

export function useCreateOnCallOverrideMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOnCallOverrideRequest) => onCallApi.createOnCallOverride(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.onCall.all });
    },
  });
}

export function useDeleteOnCallOverrideMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (overrideId: string) => onCallApi.deleteOnCallOverride(overrideId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.onCall.all });
    },
  });
}

export function useOnCallSchedulePreview(scheduleId: string | undefined, query: Partial<OnCallSchedulePreviewQuery> = {}) {
  return useQuery({
    queryKey: scheduleId ? [...queryKeys.onCall.schedule(scheduleId), "preview", query] : [...queryKeys.onCall.schedule(""), "preview", query],
    queryFn: () => {
      if (!scheduleId) {
        throw new Error("Schedule id is required");
      }

      return onCallApi.previewOnCallSchedule(scheduleId, query);
    },
    enabled: Boolean(scheduleId),
  });
}
