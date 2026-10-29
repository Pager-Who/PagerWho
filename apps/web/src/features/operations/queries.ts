import type { ActivityLogQuery, DeadLetterNotificationQuery, NotificationLogQuery, WorkerRunLogQuery } from "@im/contracts";
import { useQuery } from "@tanstack/react-query";

import { activityLogApi, notificationApi, workerApi, workspaceApi } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryKeys";
import { useAuth } from "../../shared/auth";

type OperationsQueryOptions = {
  enabled?: boolean;
};

export function useOperationsWorkspaceRoles(workspaceId?: string) {
  const { projectId } = useAuth();
  const targetWorkspaceId = workspaceId ?? projectId;

  return useQuery({
    queryKey: queryKeys.workspaces.mine(),
    queryFn: () => workspaceApi.listMyWorkspaces(),
    enabled: Boolean(targetWorkspaceId),
    select: (workspaces) => workspaces.find((workspace) => workspace.id === targetWorkspaceId)?.roles ?? [],
  });
}

export function useWorkerHealth(options: OperationsQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.workers.health(),
    queryFn: () => workerApi.getWorkerHealth(),
    enabled: options.enabled ?? true,
    refetchInterval: 30_000,
  });
}

export function useWorkerReadiness(options: OperationsQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.workers.readiness({ max_run_age_seconds: 120 }),
    queryFn: () => workerApi.getWorkerReadiness({ max_run_age_seconds: 120 }),
    enabled: options.enabled ?? true,
    refetchInterval: 30_000,
  });
}

export function useWorkerRuns(filters: Partial<WorkerRunLogQuery> = {}, options: OperationsQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.workers.runs(filters),
    queryFn: () => workerApi.listWorkerRuns(filters),
    enabled: options.enabled ?? true,
  });
}

export function useStuckEscalations(options: OperationsQueryOptions = {}) {
  const { projectId } = useAuth();
  const filters = projectId ? {
    older_than_seconds: 300,
    limit: 25,
    workspace_id: projectId,
  } : {
    older_than_seconds: 300,
    limit: 25,
  };

  return useQuery({
    queryKey: queryKeys.workers.stuckEscalations(filters),
    queryFn: () => workerApi.listStuckEscalations(filters),
    enabled: Boolean(projectId) && (options.enabled ?? true),
  });
}

export function useNotificationList(filters: Partial<NotificationLogQuery> = {}, options: OperationsQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.notifications.list(filters),
    queryFn: () => notificationApi.listNotifications(filters),
    enabled: options.enabled ?? true,
  });
}

export function useDeadLetterNotifications(filters: Partial<DeadLetterNotificationQuery> = {}, options: OperationsQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.notifications.deadLetter(filters),
    queryFn: () => notificationApi.listDeadLetterNotifications(filters),
    enabled: options.enabled ?? true,
  });
}

export function useNotificationAttempts(notificationId: string | null, options: OperationsQueryOptions = {}) {
  return useQuery({
    queryKey: notificationId ? queryKeys.notifications.attempts(notificationId) : queryKeys.notifications.attempts(""),
    queryFn: () => {
      if (!notificationId) {
        throw new Error("Notification id is required");
      }

      return notificationApi.getNotificationAttempts(notificationId);
    },
    enabled: Boolean(notificationId) && (options.enabled ?? true),
    retry: 1,
  });
}

export function useNotificationDetail(notificationId: string | null, options: OperationsQueryOptions = {}) {
  return useQuery({
    queryKey: notificationId ? queryKeys.notifications.detail(notificationId) : queryKeys.notifications.detail(""),
    queryFn: () => {
      if (!notificationId) {
        throw new Error("Notification id is required");
      }

      return notificationApi.getNotification(notificationId);
    },
    enabled: Boolean(notificationId) && (options.enabled ?? true),
    retry: 1,
  });
}

export function useActivityLogs(filters: Partial<ActivityLogQuery> = {}, options: OperationsQueryOptions = {}) {
  const { projectId } = useAuth();
  const scopedFilters = projectId ? { ...filters, workspace_id: projectId } : filters;

  return useQuery({
    queryKey: queryKeys.activityLogs.list(scopedFilters),
    queryFn: () => activityLogApi.listActivityLogs(scopedFilters),
    enabled: Boolean(projectId) && (options.enabled ?? true),
  });
}
