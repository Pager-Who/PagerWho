import { z } from "zod";

import { DateTimeSchema, paginatedResponseSchema, PaginationQuerySchema, UuidSchema } from "./common";
import {
  IncidentPrioritySchema,
  IncidentSeveritySchema,
  IncidentStatusSchema,
  NotificationChannelSchema,
  NotificationStatusSchema,
} from "./enums";
import { IncidentEscalationStateSchema } from "./escalation";
import { NotificationLogSchema } from "./notifications";

export const IncidentSchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema,
  service_id: UuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  severity: IncidentSeveritySchema,
  priority: IncidentPrioritySchema,
  status: IncidentStatusSchema,
  source: z.string(),
  fingerprint: z.string(),
  dedup_key: z.string().nullable(),
  acknowledged_by: UuidSchema.nullable(),
  acknowledged_at: DateTimeSchema.nullable(),
  resolved_by: UuidSchema.nullable(),
  resolved_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const IncidentTimelineEntrySchema = z.object({
  id: UuidSchema,
  incident_id: UuidSchema,
  type: z.string(),
  message: z.string(),
  metadata: z.unknown().nullable(),
  actor_user_id: UuidSchema.nullable(),
  created_at: DateTimeSchema,
});

export const CreateIncidentRequestSchema = z.object({
  service_id: UuidSchema,
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  severity: IncidentSeveritySchema,
  priority: IncidentPrioritySchema.optional(),
  source: z.string().default("manual"),
  dedup_key: z.string().nullable().optional(),
});

export const IncidentFilterSchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  workspace_id: UuidSchema.optional(),
  service_id: UuidSchema.optional(),
  severity: IncidentSeveritySchema.optional(),
  priority: IncidentPrioritySchema.optional(),
  status: z.union([IncidentStatusSchema, z.literal("open")]).optional(),
});

export const IncidentTimelineQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
});

export const IncidentNotificationsQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  status: NotificationStatusSchema.optional(),
  channel: NotificationChannelSchema.optional(),
});

export const IncidentActionRequestSchema = z.object({
  actor_user_id: UuidSchema.optional(),
});

export const UpdateIncidentPriorityRequestSchema = z.object({
  priority: IncidentPrioritySchema,
});

export const IncidentTimelineSummarySchema = z.object({
  total: z.number().int().min(0),
  latest_created_at: DateTimeSchema.nullable(),
});

export const IncidentNotificationSummarySchema = z.object({
  total: z.number().int().min(0),
  by_status: z.array(z.object({
    status: NotificationStatusSchema,
    count: z.number().int().min(0),
  })),
});

export const IncidentDetailSchema = z.object({
  incident: IncidentSchema,
  escalation: IncidentEscalationStateSchema.nullable(),
  timeline_summary: IncidentTimelineSummarySchema,
  notification_summary: IncidentNotificationSummarySchema,
});

export const PaginatedIncidentsSchema = paginatedResponseSchema(IncidentSchema);
export const PaginatedIncidentTimelineEntriesSchema = paginatedResponseSchema(IncidentTimelineEntrySchema);
export const PaginatedIncidentNotificationsSchema = paginatedResponseSchema(NotificationLogSchema);

export type Incident = z.infer<typeof IncidentSchema>;
export type IncidentDetail = z.infer<typeof IncidentDetailSchema>;
export type IncidentTimelineEntry = z.infer<typeof IncidentTimelineEntrySchema>;
export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequestSchema>;
export type IncidentFilter = z.infer<typeof IncidentFilterSchema>;
export type IncidentTimelineQuery = z.infer<typeof IncidentTimelineQuerySchema>;
export type IncidentNotificationsQuery = z.infer<typeof IncidentNotificationsQuerySchema>;
export type IncidentActionRequest = z.infer<typeof IncidentActionRequestSchema>;
export type UpdateIncidentPriorityRequest = z.infer<typeof UpdateIncidentPriorityRequestSchema>;
export type PaginatedIncidents = z.infer<typeof PaginatedIncidentsSchema>;
export type PaginatedIncidentTimelineEntries = z.infer<typeof PaginatedIncidentTimelineEntriesSchema>;
export type PaginatedIncidentNotifications = z.infer<typeof PaginatedIncidentNotificationsSchema>;
