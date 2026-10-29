import { z } from "zod";

import { DateTimeSchema, paginatedResponseSchema, PaginationQuerySchema, UuidSchema } from "./common";
import {
  EscalationStateStatusSchema,
  IncidentStatusSchema,
  WorkerRunStatusSchema,
} from "./enums";

export const WorkerRunLogSchema = z.object({
  id: UuidSchema,
  worker_name: z.string(),
  status: WorkerRunStatusSchema,
  started_at: DateTimeSchema,
  completed_at: DateTimeSchema.nullable(),
  duration_ms: z.number().int().nonnegative().nullable(),
  processed_count: z.number().int().nonnegative(),
  error_message: z.string().nullable(),
  metadata: z.unknown().nullable(),
});

export const WorkerRunLogQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  worker_name: z.string().min(1).optional(),
  status: WorkerRunStatusSchema.optional(),
});

export const WorkerHealthSchema = z.object({
  status: z.enum(["ok", "degraded", "unhealthy"]),
  checked_at: DateTimeSchema,
  latest_runs: z.array(WorkerRunLogSchema),
});

export const WorkerReadinessSchema = z.object({
  ready: z.boolean(),
  checked_at: DateTimeSchema,
  max_run_age_seconds: z.number().int().positive(),
  stale_workers: z.array(z.string()),
  latest_runs: z.array(WorkerRunLogSchema),
});

export const WorkerReadinessQuerySchema = z.object({
  max_run_age_seconds: z.coerce.number().int().positive().max(86_400).default(120),
  response_status: z.enum(["default", "always_200"]).default("default"),
});

export const StuckEscalationSchema = z.object({
  incident_id: UuidSchema,
  workspace_id: UuidSchema,
  service_id: UuidSchema,
  policy_id: UuidSchema,
  current_step: z.number().int(),
  repeat_iteration: z.number().int().nonnegative(),
  next_run_at: DateTimeSchema.nullable(),
  status: EscalationStateStatusSchema,
  incident_status: IncidentStatusSchema,
  overdue_seconds: z.number().int().nonnegative(),
  updated_at: DateTimeSchema,
});

export const StuckEscalationQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  workspace_id: UuidSchema.optional(),
  older_than_seconds: z.coerce.number().int().min(0).default(300),
});

export const PaginatedWorkerRunLogsSchema = paginatedResponseSchema(WorkerRunLogSchema);
export const PaginatedStuckEscalationsSchema = paginatedResponseSchema(StuckEscalationSchema);

export type WorkerRunLog = z.infer<typeof WorkerRunLogSchema>;
export type WorkerRunLogQuery = z.infer<typeof WorkerRunLogQuerySchema>;
export type WorkerHealth = z.infer<typeof WorkerHealthSchema>;
export type WorkerReadiness = z.infer<typeof WorkerReadinessSchema>;
export type WorkerReadinessQuery = z.infer<typeof WorkerReadinessQuerySchema>;
export type StuckEscalation = z.infer<typeof StuckEscalationSchema>;
export type StuckEscalationQuery = z.infer<typeof StuckEscalationQuerySchema>;
export type PaginatedWorkerRunLogs = z.infer<typeof PaginatedWorkerRunLogsSchema>;
export type PaginatedStuckEscalations = z.infer<typeof PaginatedStuckEscalationsSchema>;
