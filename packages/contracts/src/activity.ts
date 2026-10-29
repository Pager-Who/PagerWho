import { z } from "zod";

import { DateTimeSchema, paginatedResponseSchema, PaginationQuerySchema, UuidSchema } from "./common";
import { ActivityResourceTypeSchema } from "./enums";

export const ActivityLogSchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema.nullable(),
  resource_type: ActivityResourceTypeSchema,
  resource_id: UuidSchema.nullable(),
  action: z.string(),
  message: z.string(),
  actor_user_id: UuidSchema.nullable(),
  metadata: z.unknown().nullable(),
  created_at: DateTimeSchema,
});

export const ActivityLogQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  workspace_id: UuidSchema.optional(),
  resource_type: ActivityResourceTypeSchema.optional(),
  resource_id: UuidSchema.optional(),
  action: z.string().min(1).optional(),
  actor_user_id: UuidSchema.optional(),
  from: DateTimeSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  to: DateTimeSchema.optional(),
});

export const AuditLogQuerySchema = ActivityLogQuerySchema.extend({
  workspace_id: UuidSchema,
});

export const PaginatedActivityLogsSchema = paginatedResponseSchema(ActivityLogSchema);

export type ActivityLog = z.infer<typeof ActivityLogSchema>;
export type ActivityLogQuery = z.infer<typeof ActivityLogQuerySchema>;
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
export type PaginatedActivityLogs = z.infer<typeof PaginatedActivityLogsSchema>;
