import { z } from "zod";

import { DateTimeSchema, UuidSchema } from "./common";
import { WorkspaceInviteStatusSchema, WorkspaceRoleKeySchema, WorkspaceRoleSchema } from "./enums";

export const WorkspaceSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: z.string(),
  role: WorkspaceRoleSchema.optional(),
  roles: z.array(WorkspaceRoleKeySchema).default([]).optional(),
  created_by_user_id: UuidSchema.nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const WorkspaceMemberSchema = z.object({
  workspace_id: UuidSchema,
  user_id: UuidSchema,
  role: WorkspaceRoleSchema,
  roles: z.array(WorkspaceRoleKeySchema).default([]),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const WorkspaceInviteSchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema,
  workspace_name: z.string(),
  invited_user_id: UuidSchema.nullable(),
  invited_user_email: z.string().email(),
  invited_by_user_id: UuidSchema,
  role: WorkspaceRoleSchema,
  roles: z.array(WorkspaceRoleKeySchema).default([]),
  status: WorkspaceInviteStatusSchema,
  accepted_at: DateTimeSchema.nullable(),
  declined_at: DateTimeSchema.nullable(),
  revoked_at: DateTimeSchema.nullable(),
  expires_at: DateTimeSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const WorkspaceNotificationProviderSchema = z.enum(["slack", "email", "twilio"]);

export const WorkspaceWebhookIntegrationTypeSchema = z.enum(["slack", "discord", "teams", "custom"]);
export const WorkspaceWebhookIntegrationEventActionSchema = z.enum([
  "incident.created",
  "incident.acknowledged",
  "incident.resolved",
  "incident.priority_updated",
]);

export const WorkspaceWebhookIntegrationSchema = z.object({
  workspace_id: UuidSchema,
  type: WorkspaceWebhookIntegrationTypeSchema,
  enabled: z.boolean(),
  configured: z.boolean(),
  details: z.object({
    url: z.string().url().nullable(),
    default_body: z.record(z.unknown()).nullable(),
    event_actions: z.array(WorkspaceWebhookIntegrationEventActionSchema),
  }),
  created_at: DateTimeSchema.nullable(),
  updated_at: DateTimeSchema.nullable(),
});

export const UpdateWorkspaceWebhookIntegrationRequestSchema = z.object({
  enabled: z.boolean().optional(),
  url: z.string().url().max(2048).optional().nullable(),
  default_body: z.record(z.unknown()).optional().nullable(),
  event_actions: z.array(WorkspaceWebhookIntegrationEventActionSchema).min(1).optional(),
});

export const ServiceWebhookRoutingModeSchema = z.enum(["inherit", "override", "both"]);
export const ServiceWebhookIntegrationSchema = WorkspaceWebhookIntegrationSchema.omit({ workspace_id: true }).extend({
  service_id: UuidSchema,
  routing_mode: ServiceWebhookRoutingModeSchema,
});
export const UpdateServiceWebhookIntegrationRequestSchema = UpdateWorkspaceWebhookIntegrationRequestSchema.extend({
  routing_mode: ServiceWebhookRoutingModeSchema.optional(),
});

export const WorkspaceNotificationProviderSettingSchema = z.object({
  workspace_id: UuidSchema,
  provider: WorkspaceNotificationProviderSchema,
  enabled: z.boolean(),
  configured: z.boolean(),
  details: z.object({
    has_slack_webhook_url: z.boolean().optional(),
    smtp_host: z.string().nullable().optional(),
    smtp_port: z.number().int().nullable().optional(),
    smtp_security: z.enum(["starttls", "tls"]).nullable().optional(),
    smtp_username: z.string().nullable().optional(),
    has_smtp_password: z.boolean().optional(),
    from_name: z.string().nullable().optional(),
    from_email: z.string().nullable().optional(),
    account_sid: z.string().nullable().optional(),
    account_sid_masked: z.string().nullable().optional(),
    has_auth_token: z.boolean().optional(),
    from_phone_number: z.string().nullable().optional(),
    from_phone_number_masked: z.string().nullable().optional(),
    event_actions: z.array(WorkspaceWebhookIntegrationEventActionSchema).optional(),
  }),
  created_at: DateTimeSchema.nullable(),
  updated_at: DateTimeSchema.nullable(),
});

export const CreateWorkspaceRequestSchema = z.object({
  name: z.string().min(1),
  slug: z.string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a lowercase URL-safe slug")
    .optional(),
});

export const CreateWorkspaceInviteRequestSchema = z.object({
  invited_user_email: z.string().trim().toLowerCase().email(),
  role: WorkspaceRoleSchema.optional(),
  roles: z.array(WorkspaceRoleKeySchema).min(1).optional(),
  expires_in_days: z.number().int().min(1).max(90).default(14),
});

export const UpdateWorkspaceMemberRolesRequestSchema = z.object({
  roles: z.array(WorkspaceRoleKeySchema).min(1),
});

export const UpdateWorkspaceNotificationProviderSettingRequestSchema = z.object({
  enabled: z.boolean().optional(),
  slack: z.object({
    webhook_url: z.string().url()
      .refine((value) => value.startsWith("https://hooks.slack.com/services/"), "Expected a Slack Incoming Webhook URL")
      .nullable()
      .optional(),
  }).optional(),
  email: z.object({
    smtp_host: z.string().trim().min(1).max(253).nullable().optional(),
    smtp_port: z.number().int().min(1).max(65_535).nullable().optional(),
    smtp_security: z.enum(["starttls", "tls"]).nullable().optional(),
    smtp_username: z.string().trim().min(1).max(320).nullable().optional(),
    smtp_password: z.string().min(1).max(1_024).nullable().optional(),
    from_name: z.string().trim().min(1).max(120).nullable().optional(),
    from_email: z.string().email().nullable().optional(),
    event_actions: z.array(WorkspaceWebhookIntegrationEventActionSchema).min(1).optional(),
  }).optional(),
  twilio: z.object({
    account_sid: z.string().min(1).nullable().optional(),
    auth_token: z.string().min(1).nullable().optional(),
    from_phone_number: z.string()
      .regex(/^\+[1-9]\d{7,14}$/, "Expected an E.164 phone number")
      .nullable()
      .optional(),
    event_actions: z.array(WorkspaceWebhookIntegrationEventActionSchema).min(1).optional(),
  }).optional(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;
export type WorkspaceInvite = z.infer<typeof WorkspaceInviteSchema>;
export type WorkspaceNotificationProvider = z.infer<typeof WorkspaceNotificationProviderSchema>;
export type WorkspaceWebhookIntegrationType = z.infer<typeof WorkspaceWebhookIntegrationTypeSchema>;
export type WorkspaceWebhookIntegrationEventAction = z.infer<typeof WorkspaceWebhookIntegrationEventActionSchema>;
export type WorkspaceWebhookIntegration = z.infer<typeof WorkspaceWebhookIntegrationSchema>;
export type UpdateWorkspaceWebhookIntegrationRequest = z.infer<typeof UpdateWorkspaceWebhookIntegrationRequestSchema>;
export type ServiceWebhookRoutingMode = z.infer<typeof ServiceWebhookRoutingModeSchema>;
export type ServiceWebhookIntegration = z.infer<typeof ServiceWebhookIntegrationSchema>;
export type UpdateServiceWebhookIntegrationRequest = z.infer<typeof UpdateServiceWebhookIntegrationRequestSchema>;
export type WorkspaceNotificationProviderSetting = z.infer<typeof WorkspaceNotificationProviderSettingSchema>;
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;
export type CreateWorkspaceInviteRequest = z.infer<typeof CreateWorkspaceInviteRequestSchema>;
export type UpdateWorkspaceMemberRolesRequest = z.infer<typeof UpdateWorkspaceMemberRolesRequestSchema>;
export type UpdateWorkspaceNotificationProviderSettingRequest = z.infer<typeof UpdateWorkspaceNotificationProviderSettingRequestSchema>;
