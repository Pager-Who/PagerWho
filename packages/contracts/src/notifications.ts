import { z } from "zod";

import { DateTimeSchema, paginatedResponseSchema, PaginationQuerySchema, UuidSchema } from "./common";
import {
  EscalationTargetTypeSchema,
  NotificationChannelSchema,
  NotificationDeliveryAttemptStatusSchema,
  NotificationStatusSchema,
} from "./enums";

export const NotificationLogSchema = z.object({
  id: UuidSchema,
  incident_id: UuidSchema,
  policy_step_id: UuidSchema.nullable(),
  repeat_iteration: z.number().int().min(0).nullable(),
  channel: NotificationChannelSchema,
  target_type: EscalationTargetTypeSchema,
  target_id: z.string().nullable(),
  target_address: z.string(),
  status: NotificationStatusSchema,
  attempt: z.number().int().min(0),
  idempotency_key: z.string(),
  event_action: z.string(),
  provider_message_id: z.string().nullable(),
  error_message: z.string().nullable(),
  next_retry_at: DateTimeSchema.nullable(),
  sent_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const NotificationDeliveryAttemptSchema = z.object({
  id: UuidSchema,
  notification_log_id: UuidSchema,
  attempt: z.number().int().min(1),
  status: NotificationDeliveryAttemptStatusSchema,
  provider: z.string(),
  provider_message_id: z.string().nullable(),
  error_message: z.string().nullable(),
  retry_after_seconds: z.number().int().min(0).nullable(),
  started_at: DateTimeSchema,
  completed_at: DateTimeSchema.nullable(),
  metadata: z.unknown().nullable(),
});

export const NotificationLogQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  incident_id: UuidSchema.optional(),
  status: NotificationStatusSchema.optional(),
  channel: NotificationChannelSchema.optional(),
});

export const DeadLetterNotificationQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  incident_id: UuidSchema.optional(),
  channel: NotificationChannelSchema.optional(),
});

export const PaginatedNotificationLogsSchema = paginatedResponseSchema(NotificationLogSchema);

export type NotificationLog = z.infer<typeof NotificationLogSchema>;
export type NotificationDeliveryAttempt = z.infer<typeof NotificationDeliveryAttemptSchema>;
export type NotificationLogQuery = z.infer<typeof NotificationLogQuerySchema>;
export type DeadLetterNotificationQuery = z.infer<typeof DeadLetterNotificationQuerySchema>;
export type PaginatedNotificationLogs = z.infer<typeof PaginatedNotificationLogsSchema>;
