import { z } from "zod";

import { ActivityLogSchema } from "./activity";
import { DateTimeSchema, paginatedResponseSchema, PaginationQuerySchema, UuidSchema } from "./common";
import { PlatformRoleSchema, WorkspaceInviteStatusSchema, WorkspaceRoleKeySchema, WorkspaceRoleSchema } from "./enums";
import { WorkspaceQuotaResourceSchema, WorkspaceUsageSchema } from "./quotas";

export const PlatformMeSchema = z.object({
  is_platform_admin: z.boolean(),
  roles: z.array(PlatformRoleSchema),
});

export const PlatformOverviewSchema = z.object({
  counts: z.object({
    active_sessions: z.number().int().min(0),
    api_5xx_24h: z.number().int().min(0),
    average_notification_latency_ms_24h: z.number().min(0).nullable(),
    failed_notifications_24h: z.number().int().min(0),
    failed_worker_runs_24h: z.number().int().min(0),
    new_users_24h: z.number().int().min(0),
    notification_success_rate_24h: z.number().min(0).max(100).nullable(),
    users: z.number().int().min(0),
    suspended_users: z.number().int().min(0),
    workspaces: z.number().int().min(0),
    suspended_workspaces: z.number().int().min(0),
    open_incidents: z.number().int().min(0),
    notification_dead_letters: z.number().int().min(0),
  }),
  deployment_version: z.string(),
  notification_trend: z.array(z.object({
    bucket: DateTimeSchema,
    failed: z.number().int().min(0),
    sent: z.number().int().min(0),
    average_latency_ms: z.number().min(0).nullable(),
  })),
  attention: z.array(z.object({
    id: UuidSchema,
    kind: z.enum(["notification", "worker"]),
    status: z.string(),
    title: z.string(),
    detail: z.string().nullable(),
    workspace_id: UuidSchema.nullable(),
    incident_id: UuidSchema.nullable(),
    created_at: DateTimeSchema,
  })),
});

export const PlatformUserSummarySchema = z.object({
  id: UuidSchema,
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string(),
  platform_roles: z.array(PlatformRoleSchema),
  workspace_count: z.number().int().min(0),
  suspended_at: DateTimeSchema.nullable(),
  suspended_by_user_id: UuidSchema.nullable(),
  suspension_reason: z.string().nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const PlatformWorkspaceSummarySchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: z.string(),
  created_by_user_id: UuidSchema.nullable(),
  member_count: z.number().int().min(0),
  service_count: z.number().int().min(0),
  open_incident_count: z.number().int().min(0),
  suspended_at: DateTimeSchema.nullable(),
  suspended_by_user_id: UuidSchema.nullable(),
  suspension_reason: z.string().nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const PlatformUserDetailSchema = PlatformUserSummarySchema.extend({
  active_session_count: z.number().int().min(0),
  auth_methods: z.array(z.string()),
  last_login_at: DateTimeSchema.nullable(),
  sessions: z.array(z.object({
    id: UuidSchema,
    created_at: DateTimeSchema,
    expires_at: DateTimeSchema,
    ip_address: z.string().nullable(),
    is_active: z.boolean(),
    user_agent: z.string().nullable(),
  })),
  notification_contacts: z.array(z.object({
    id: UuidSchema,
    type: z.string(),
    address: z.string(),
    verified_at: DateTimeSchema.nullable(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })),
  notification_preferences: z.array(z.object({
    channel: z.string(),
    delay_seconds: z.number().int().min(0),
    enabled: z.boolean(),
  })),
  workspace_memberships: z.array(z.object({
    workspace_id: UuidSchema,
    workspace_name: z.string(),
    role: WorkspaceRoleSchema,
    roles: z.array(WorkspaceRoleKeySchema),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })),
  recent_activity: z.array(ActivityLogSchema),
  security_timeline: z.array(ActivityLogSchema),
});

export const PlatformWorkspaceDetailSchema = PlatformWorkspaceSummarySchema.extend({
  usage: WorkspaceUsageSchema,
  quota_health: z.array(z.object({
    resource: z.string(),
    current: z.number().int().min(0),
    limit: z.number().int().positive().nullable(),
    remaining: z.number().int().min(0).nullable(),
    state: z.enum(["healthy", "near_limit", "exceeded", "unlimited"]),
  })),
  members: z.array(z.object({
    user_id: UuidSchema,
    email: z.string().email(),
    name: z.string(),
    role: WorkspaceRoleSchema,
    roles: z.array(WorkspaceRoleKeySchema),
    suspended_at: DateTimeSchema.nullable(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })),
  invites: z.array(z.object({
    id: UuidSchema,
    invited_user_email: z.string().email(),
    invited_user_id: UuidSchema.nullable(),
    invited_by_user_id: UuidSchema,
    role: WorkspaceRoleSchema,
    roles: z.array(WorkspaceRoleKeySchema),
    status: WorkspaceInviteStatusSchema,
    expires_at: DateTimeSchema,
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })),
  notification_provider_settings: z.array(z.object({
    provider: z.string(),
    enabled: z.boolean(),
    config: z.unknown(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })),
  resource_counts: z.object({
    escalation_policies: z.number().int().min(0),
    incidents: z.number().int().min(0),
    on_call_schedules: z.number().int().min(0),
    services: z.number().int().min(0),
    workflows: z.number().int().min(0),
  }),
  recent_activity: z.array(ActivityLogSchema),
  operational_timeline: z.array(z.object({
    id: UuidSchema,
    kind: z.enum(["incident", "notification", "webhook", "worker"]),
    status: z.string(),
    title: z.string(),
    detail: z.string().nullable(),
    occurred_at: DateTimeSchema,
    related_id: UuidSchema.nullable(),
  })),
});

export const PlatformListUsersQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export const PlatformListWorkspacesQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export const PlatformReasonRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const PlatformSendAuthEmailRequestSchema = PlatformReasonRequestSchema.extend({
  kind: z.enum(["email_verification", "password_reset"]),
});

export const PlatformUpdateWorkspaceQuotaOverrideRequestSchema = z.object({
  expires_at: DateTimeSchema.nullable(),
  limit: z.number().int().positive().nullable(),
  reason: z.string().trim().min(3).max(500),
  resource: WorkspaceQuotaResourceSchema.exclude(["workspaces"]),
}).refine((value) => value.limit === null || value.expires_at !== null, {
  message: "expires_at is required when setting a quota override",
  path: ["expires_at"],
});

export const PlatformUpdateWorkspaceMemberRolesRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  roles: z.array(WorkspaceRoleKeySchema).min(1),
});

export const PlatformDiagnosticsQuerySchema = z.object({
  kind: z.enum(["all", "notification", "webhook", "worker"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  request_id: z.string().trim().min(1).max(200).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  workspace_id: UuidSchema.optional(),
});

export const PlatformDiagnosticItemSchema = z.object({
  id: UuidSchema,
  kind: z.enum(["notification", "webhook", "worker"]),
  status: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  workspace_id: UuidSchema.nullable(),
  workspace_name: z.string().nullable(),
  incident_id: UuidSchema.nullable(),
  incident_title: z.string().nullable(),
  channel: z.string().nullable(),
  attempt: z.number().int().min(0).nullable(),
  occurred_at: DateTimeSchema,
  request_id: z.string().nullable(),
  can_retry: z.boolean(),
});

export const PlatformDiagnosticsSchema = z.object({
  items: z.array(PlatformDiagnosticItemSchema),
});

export const PlatformInspectorResourceTypeSchema = z.enum([
  "user",
  "workspace",
  "incident",
  "notification",
  "worker_run",
]);

export const PlatformInspectorQuerySchema = z.object({
  id: UuidSchema,
  resource_type: PlatformInspectorResourceTypeSchema,
});

export const PlatformResourceListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  resource_type: PlatformInspectorResourceTypeSchema,
  search: z.string().trim().min(1).max(200).optional(),
});

export const PlatformResourceSummarySchema = z.object({
  id: UuidSchema,
  resource_type: PlatformInspectorResourceTypeSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  status: z.string(),
  workspace_name: z.string().nullable(),
  created_at: DateTimeSchema,
});

export const PlatformResourceListSchema = z.object({
  items: z.array(PlatformResourceSummarySchema),
});

export const PlatformInspectorResultSchema = z.object({
  id: UuidSchema,
  resource_type: PlatformInspectorResourceTypeSchema,
  title: z.string(),
  status: z.string(),
  workspace_id: UuidSchema.nullable(),
  workspace_name: z.string().nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema.nullable(),
  relationships: z.array(z.object({
    id: UuidSchema,
    label: z.string(),
    resource_type: z.string(),
    title: z.string(),
  })),
  data: z.record(z.string(), z.unknown()),
});

export const PaginatedPlatformUsersSchema = paginatedResponseSchema(PlatformUserSummarySchema);
export const PaginatedPlatformWorkspacesSchema = paginatedResponseSchema(PlatformWorkspaceSummarySchema);

export type PlatformMe = z.infer<typeof PlatformMeSchema>;
export type PlatformOverview = z.infer<typeof PlatformOverviewSchema>;
export type PlatformUserSummary = z.infer<typeof PlatformUserSummarySchema>;
export type PlatformWorkspaceSummary = z.infer<typeof PlatformWorkspaceSummarySchema>;
export type PlatformUserDetail = z.infer<typeof PlatformUserDetailSchema>;
export type PlatformWorkspaceDetail = z.infer<typeof PlatformWorkspaceDetailSchema>;
export type PlatformListUsersQuery = z.infer<typeof PlatformListUsersQuerySchema>;
export type PlatformListWorkspacesQuery = z.infer<typeof PlatformListWorkspacesQuerySchema>;
export type PlatformReasonRequest = z.infer<typeof PlatformReasonRequestSchema>;
export type PlatformSendAuthEmailRequest = z.infer<typeof PlatformSendAuthEmailRequestSchema>;
export type PlatformUpdateWorkspaceQuotaOverrideRequest = z.infer<typeof PlatformUpdateWorkspaceQuotaOverrideRequestSchema>;
export type PlatformUpdateWorkspaceMemberRolesRequest = z.infer<typeof PlatformUpdateWorkspaceMemberRolesRequestSchema>;
export type PaginatedPlatformUsers = z.infer<typeof PaginatedPlatformUsersSchema>;
export type PaginatedPlatformWorkspaces = z.infer<typeof PaginatedPlatformWorkspacesSchema>;
export type PlatformDiagnosticsQuery = z.infer<typeof PlatformDiagnosticsQuerySchema>;
export type PlatformDiagnosticItem = z.infer<typeof PlatformDiagnosticItemSchema>;
export type PlatformDiagnostics = z.infer<typeof PlatformDiagnosticsSchema>;
export type PlatformInspectorResourceType = z.infer<typeof PlatformInspectorResourceTypeSchema>;
export type PlatformInspectorQuery = z.infer<typeof PlatformInspectorQuerySchema>;
export type PlatformInspectorResult = z.infer<typeof PlatformInspectorResultSchema>;
export type PlatformResourceListQuery = z.infer<typeof PlatformResourceListQuerySchema>;
export type PlatformResourceSummary = z.infer<typeof PlatformResourceSummarySchema>;
export type PlatformResourceList = z.infer<typeof PlatformResourceListSchema>;
