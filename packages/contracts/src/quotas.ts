import { z } from "zod";

import { DateTimeSchema, UuidSchema } from "./common";

export const WorkspaceQuotaResourceSchema = z.enum([
  "workspaces",
  "members",
  "services",
  "on_call_schedules",
  "escalation_policies",
]);

export const InstallationLimitsSchema = z.object({
  escalation_policies: z.number().int().positive().nullable(),
  members: z.number().int().positive().nullable(),
  on_call_schedules: z.number().int().positive().nullable(),
  retention_days: z.number().int().positive(),
  services: z.number().int().positive().nullable(),
  workspaces: z.number().int().positive().nullable(),
});

export const WorkspaceUsageCountsSchema = z.object({
  active_members: z.number().int().min(0),
  escalation_policies: z.number().int().min(0),
  members: z.number().int().min(0),
  on_call_schedules: z.number().int().min(0),
  pending_invites: z.number().int().min(0),
  services: z.number().int().min(0),
  workspaces: z.number().int().min(0),
});

export const WorkspaceUsageSchema = z.object({
  quota_settings: z.object({
    updated_at: DateTimeSchema.nullable(),
    updated_by_user_id: UuidSchema.nullable(),
    quota_overrides: z.array(z.object({
      resource: WorkspaceQuotaResourceSchema,
      limit: z.number().int().positive(),
      expires_at: DateTimeSchema,
    })),
  }),
  exceeded: z.record(WorkspaceQuotaResourceSchema, z.boolean()),
  limits: InstallationLimitsSchema,
  usage: WorkspaceUsageCountsSchema,
  workspace_id: UuidSchema,
});

export const UpdateWorkspaceQuotaOverrideRequestSchema = z.object({
  expires_at: DateTimeSchema.nullable(),
  limit: z.number().int().positive().nullable(),
  resource: WorkspaceQuotaResourceSchema.exclude(["workspaces"]),
}).refine((value) => value.limit === null || value.expires_at !== null, {
  message: "expires_at is required when setting a quota override",
  path: ["expires_at"],
});

export const DEFAULT_INSTALLATION_LIMITS = {
  escalation_policies: null,
  members: null,
  on_call_schedules: null,
  retention_days: 365,
  services: null,
  workspaces: null,
} as const satisfies InstallationLimits;

export type WorkspaceQuotaResource = z.infer<typeof WorkspaceQuotaResourceSchema>;
export type InstallationLimits = z.infer<typeof InstallationLimitsSchema>;
export type WorkspaceUsageCounts = z.infer<typeof WorkspaceUsageCountsSchema>;
export type WorkspaceUsage = z.infer<typeof WorkspaceUsageSchema>;
export type UpdateWorkspaceQuotaOverrideRequest = z.infer<typeof UpdateWorkspaceQuotaOverrideRequestSchema>;
