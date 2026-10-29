import {
  ApiClient,
  createAuthApi,
  createActivityLogApi,
  createAuditLogApi,
  createEscalationApi,
  createIncidentApi,
  createNotificationApi,
  createOnCallApi,
  createPlatformApi,
  createServiceApi,
  createTeamApi,
  createUserApi,
  createWebhookApi,
  createWorkerApi,
  createWorkflowApi,
  createWorkspaceApi,
} from "@im/api-client";

const defaultApiBaseUrl = resolveDefaultApiBaseUrl();

function resolveDefaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:3000/api/v1";
  }

  return `${window.location.protocol}//${window.location.hostname}:3000/api/v1`;
}

function resolveApiBaseUrl(value: string | undefined) {
  const baseUrl = value?.trim() || defaultApiBaseUrl;

  return baseUrl.replace(/\/+$/, "");
}

export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

export const apiClient = new ApiClient({
  baseUrl: apiBaseUrl,
});

export const authApi = createAuthApi(apiClient);
export const incidentApi = createIncidentApi(apiClient);
export const serviceApi = createServiceApi(apiClient);
export const onCallApi = createOnCallApi(apiClient);
export const escalationApi = createEscalationApi(apiClient);
export const notificationApi = createNotificationApi(apiClient);
export const activityLogApi = createActivityLogApi(apiClient);
export const auditLogApi = createAuditLogApi(apiClient);
export const platformApi = createPlatformApi(apiClient);
export const teamApi = createTeamApi(apiClient);
export const userApi = createUserApi(apiClient);
export const webhookApi = createWebhookApi(apiClient);
export const workerApi = createWorkerApi(apiClient);
export const workflowApi = createWorkflowApi(apiClient);
export const workspaceApi = createWorkspaceApi(apiClient);
