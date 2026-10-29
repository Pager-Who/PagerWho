import type { IncidentFilter } from "@im/contracts";

type WorkspaceScopedFilters = {
  workspace_id?: string;
};

export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => ["auth", "me"] as const,
    providers: () => ["auth", "providers"] as const,
  },
  incidents: {
    all: ["incidents"] as const,
    list: (filters: Partial<IncidentFilter> = {}) => ["incidents", "list", filters] as const,
    detail: (incidentId: string) => ["incidents", "detail", incidentId] as const,
    timeline: (incidentId: string) => ["incidents", "timeline", incidentId] as const,
    notifications: (incidentId: string) => ["incidents", "notifications", incidentId] as const,
    escalation: (incidentId: string) => ["incidents", "escalation", incidentId] as const,
  },
  services: {
    all: ["services"] as const,
    list: (filters: Record<string, unknown> = {}) => ["services", "list", filters] as const,
    detail: (serviceId: string) => ["services", "detail", serviceId] as const,
    incidents: (
      serviceId: string,
      filters: Partial<Omit<IncidentFilter, "service_id" | "workspace_id">> = {},
    ) => ["services", "incidents", serviceId, filters] as const,
    webhookEndpoint: (serviceId: string) => ["services", "webhook-endpoint", serviceId] as const,
    webhookEndpoints: (serviceId: string) => ["services", "webhook-endpoints", serviceId] as const,
    webhookIntegrations: (serviceId: string) => ["services", "webhook-integrations", serviceId] as const,
  },
  teams: {
    all: ["teams"] as const,
    list: (filters: WorkspaceScopedFilters = {}) => ["teams", "list", filters] as const,
    members: (teamId: string) => ["teams", teamId, "members"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (filters: WorkspaceScopedFilters = {}) => ["users", "list", filters] as const,
    notificationPreferences: (userId: string) => ["users", "notification-preferences", userId] as const,
    phoneVerification: (userId: string) => ["users", "phone-verification", userId] as const,
  },
  onCall: {
    all: ["on-call"] as const,
    current: (serviceId?: string) => ["on-call", "current", serviceId ?? null] as const,
    schedules: (filters: WorkspaceScopedFilters = {}) => ["on-call", "schedules", filters] as const,
    schedule: (scheduleId: string) => ["on-call", "schedules", scheduleId] as const,
  },
  escalationPolicies: {
    all: ["escalation-policies"] as const,
    list: (filters: WorkspaceScopedFilters = {}) => ["escalation-policies", "list", filters] as const,
    detail: (policyId: string) => ["escalation-policies", "detail", policyId] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (filters: Record<string, unknown> = {}) => ["notifications", "list", filters] as const,
    deadLetter: (filters: Record<string, unknown> = {}) => ["notifications", "dead-letter", filters] as const,
    detail: (notificationId: string) => ["notifications", "detail", notificationId] as const,
    attempts: (notificationId: string) => ["notifications", "attempts", notificationId] as const,
  },
  platform: {
    all: ["platform"] as const,
    me: () => ["platform", "me"] as const,
    overview: () => ["platform", "overview"] as const,
    diagnostics: (filters: Record<string, unknown> = {}) => ["platform", "diagnostics", filters] as const,
    inspector: (query: Record<string, unknown> = {}) => ["platform", "inspector", query] as const,
    resources: (query: Record<string, unknown> = {}) => ["platform", "resources", query] as const,
    users: (filters: Record<string, unknown> = {}) => ["platform", "users", filters] as const,
    user: (userId: string) => ["platform", "users", userId] as const,
    workspaces: (filters: Record<string, unknown> = {}) => ["platform", "workspaces", filters] as const,
    workspace: (workspaceId: string) => ["platform", "workspaces", workspaceId] as const,
  },
  webhooks: {
    all: ["webhooks"] as const,
    ingestionResult: (endpointId: string) => ["webhooks", "ingestion-result", endpointId] as const,
  },
  activityLogs: {
    all: ["activity-logs"] as const,
    list: (filters: Record<string, unknown> = {}) => ["activity-logs", "list", filters] as const,
    resource: (resourceType: string, resourceId: string) => ["activity-logs", "resource", resourceType, resourceId] as const,
  },
  auditLogs: {
    all: ["audit-logs"] as const,
    list: (filters: Record<string, unknown> = {}) => ["audit-logs", "list", filters] as const,
  },
  workers: {
    all: ["workers"] as const,
    health: () => ["workers", "health"] as const,
    readiness: (filters: Record<string, unknown> = {}) => ["workers", "readiness", filters] as const,
    runs: (filters: Record<string, unknown> = {}) => ["workers", "runs", filters] as const,
    stuckEscalations: (filters: Record<string, unknown> = {}) => ["workers", "stuck-escalations", filters] as const,
  },
  workflows: {
    all: ["workflows"] as const,
    triggers: () => ["workflows", "triggers"] as const,
    list: (filters: Record<string, unknown> = {}) => ["workflows", "list", filters] as const,
    detail: (workflowId: string) => ["workflows", "detail", workflowId] as const,
    runs: (workflowId: string, filters: Record<string, unknown> = {}) => ["workflows", workflowId, "runs", filters] as const,
    run: (runId: string) => ["workflow-runs", runId] as const,
  },
  workspaces: {
    all: ["workspaces"] as const,
    mine: () => ["workspaces", "mine"] as const,
    invites: () => ["workspaces", "invites"] as const,
    members: (workspaceId: string) => ["workspaces", workspaceId, "members"] as const,
    notificationProviderSettings: (workspaceId: string) => ["workspaces", workspaceId, "notification-provider-settings"] as const,
    webhookIntegrations: (workspaceId: string) => ["workspaces", workspaceId, "webhook-integrations"] as const,
    usage: (workspaceId: string) => ["workspaces", workspaceId, "usage"] as const,
    workspaceInvites: (workspaceId: string) => ["workspaces", workspaceId, "invites"] as const,
  },
};
