import type {
  DeadLetterNotificationQuery,
  NotificationDeliveryAttempt,
  NotificationLog,
  NotificationLogQuery,
  PaginatedNotificationLogs,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createNotificationApi(client: ApiClient) {
  return {
    listNotifications(filters: Partial<NotificationLogQuery> = {}) {
      return client.request<PaginatedNotificationLogs>(`/notifications${buildQueryString(filters)}`);
    },
    listDeadLetterNotifications(filters: Partial<DeadLetterNotificationQuery> = {}) {
      return client.request<PaginatedNotificationLogs>(`/notifications/dead-letter${buildQueryString(filters)}`);
    },
    getNotification(notificationId: string) {
      return client.request<NotificationLog>(`/notifications/${notificationId}`);
    },
    getNotificationAttempts(notificationId: string) {
      return client.request<NotificationDeliveryAttempt[]>(`/notifications/${notificationId}/attempts`);
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
