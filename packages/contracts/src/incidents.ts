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
  acknowledged_by: UuidSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

export const IncidentCountsQuerySchema = IncidentFilterSchema.omit({ cursor: true, limit: true, status: true });

export const IncidentCountsSchema = z.object({
  triggered: z.number().int(),
  acknowledged: z.number().int(),
  resolved: z.number().int(),
  critical_open: z.number().int(),
});

export const IncidentMetricsQuerySchema = z.object({
  workspace_id: UuidSchema,
  days: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value), "Expected 7, 30, or 90").default(30),
});

const DurationStatsSchema = z.object({
  average_seconds: z.number().nullable(),
  median_seconds: z.number().nullable(),
});

export const IncidentMetricsSchema = z.object({
  window_days: z.number().int(),
  since: DateTimeSchema,
  incident_count: z.number().int(),
  acknowledged_count: z.number().int(),
  resolved_count: z.number().int(),
  // Created → first acknowledgement, over incidents created in the window that were acknowledged.
  time_to_acknowledge: DurationStatsSchema,
  // Created → resolved, over incidents created in the window that were resolved.
  time_to_resolve: DurationStatsSchema,
  by_priority: z.array(z.object({ priority: IncidentPrioritySchema, incident_count: z.number().int() })),
  by_service: z.array(z.object({
    service_id: UuidSchema,
    service_name: z.string(),
    incident_count: z.number().int(),
    open_count: z.number().int(),
    median_resolve_seconds: z.number().nullable(),
  })),
  notifications: z.object({
    total: z.number().int(),
    delivered: z.number().int(),
    failed: z.number().int(),
  }),
});

export const CreateIncidentNoteRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export const ReassignIncidentRequestSchema = z.object({
  user_id: UuidSchema,
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
  note: z.string().trim().min(1).max(4000).optional(),
});

export const UpdateIncidentPriorityRequestSchema = z.object({
  priority: IncidentPrioritySchema,
});

// Public view behind a signed acknowledge link sent in notifications (no session required).
export const IncidentActionLinkSchema = z.object({
  incident: z.object({
    id: UuidSchema,
    title: z.string(),
    service_name: z.string(),
    severity: IncidentSeveritySchema,
    priority: IncidentPrioritySchema,
    status: IncidentStatusSchema,
    created_at: DateTimeSchema,
  }),
  responder_name: z.string(),
  expires_at: DateTimeSchema,
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
export type IncidentActionLink = z.infer<typeof IncidentActionLinkSchema>;
export type IncidentCountsQuery = z.infer<typeof IncidentCountsQuerySchema>;
export type IncidentCounts = z.infer<typeof IncidentCountsSchema>;
export type IncidentMetricsQuery = z.infer<typeof IncidentMetricsQuerySchema>;
export type IncidentMetrics = z.infer<typeof IncidentMetricsSchema>;
export type CreateIncidentNoteRequest = z.infer<typeof CreateIncidentNoteRequestSchema>;
export type ReassignIncidentRequest = z.infer<typeof ReassignIncidentRequestSchema>;
export type PaginatedIncidents = z.infer<typeof PaginatedIncidentsSchema>;
export type PaginatedIncidentTimelineEntries = z.infer<typeof PaginatedIncidentTimelineEntriesSchema>;
export type PaginatedIncidentNotifications = z.infer<typeof PaginatedIncidentNotificationsSchema>;
