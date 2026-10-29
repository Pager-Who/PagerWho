import type {
  CheckUserPhoneVerificationRequest,
  StartUserPhoneVerificationRequest,
  UpdateUserNotificationPreferencesRequest,
  User,
  UserListQuery,
  UserNotificationPreferences,
  UserPhoneVerificationStatus,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createUserApi(client: ApiClient) {
  return {
    listUsers(query: UserListQuery = {}) {
      return client.request<User[]>(`/users${buildQueryString(query)}`);
    },
    updateNotificationPreferences(userId: string, body: UpdateUserNotificationPreferencesRequest) {
      return client.request<UserNotificationPreferences>(`/users/${userId}/notification-preferences`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    startPhoneVerification(userId: string, body: StartUserPhoneVerificationRequest = { channel: "sms" }) {
      return client.request<UserPhoneVerificationStatus>(`/users/${userId}/phone-verification/start`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    checkPhoneVerification(userId: string, body: CheckUserPhoneVerificationRequest) {
      return client.request<UserPhoneVerificationStatus>(`/users/${userId}/phone-verification/check`, {
        method: "POST",
        body: JSON.stringify(body),
      });
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
