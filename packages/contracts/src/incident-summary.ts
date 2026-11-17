import { z } from "zod";

import { DateTimeSchema, UuidSchema } from "./common";
import { CopilotLocaleSchema } from "./copilot";
import { IncidentPrioritySchema, IncidentSeveritySchema, IncidentStatusSchema } from "./enums";

export const IncidentSummaryRequestSchema = z.object({ locale: CopilotLocaleSchema.default("en") }).strict();

// A flat provider response avoids regenerating incident data or nested action plans.
export const IncidentSummaryDraftSchema = z.object({
  summary: z.string().trim().min(1).max(1500),
  check_1: z.string().trim().min(1).max(500),
  check_2: z.string().trim().min(1).max(500),
  check_3: z.string().trim().min(1).max(500),
}).strict();

export const IncidentSummaryEvidenceSchema = z.object({
  title: z.string(), description: z.string().nullable(),
  severity: IncidentSeveritySchema, priority: IncidentPrioritySchema, status: IncidentStatusSchema,
  service: z.string(), owner_team: z.string().nullable(), responder: z.string().nullable(),
  created_at: DateTimeSchema, acknowledged_at: DateTimeSchema.nullable(), resolved_at: DateTimeSchema.nullable(),
  history: z.array(z.object({ type: z.string(), created_at: DateTimeSchema })).max(20),
});

export const IncidentSummarySchema = z.object({
  incident_id: UuidSchema, locale: CopilotLocaleSchema,
  summary: IncidentSummaryDraftSchema.shape.summary,
  checklist: z.array(z.string().min(1).max(500)).length(3),
  evidence: IncidentSummaryEvidenceSchema,
  context_truncated: z.boolean(),
  generated_at: DateTimeSchema, source_updated_at: DateTimeSchema, model: z.string(),
});

export type IncidentSummaryRequest = z.infer<typeof IncidentSummaryRequestSchema>;
export type IncidentSummary = z.infer<typeof IncidentSummarySchema>;
