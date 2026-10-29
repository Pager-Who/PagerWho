import { z } from "zod";

import { DateTimeSchema, UuidSchema } from "./common";
import { EscalationStateStatusSchema, EscalationTargetTypeSchema } from "./enums";

export const EscalationPolicyStepSchema = z.object({
  id: UuidSchema,
  policy_id: UuidSchema,
  step_order: z.number().int().min(1),
  delay_seconds: z.number().int().min(0),
  target_type: EscalationTargetTypeSchema,
  target_id: z.string().nullable(),
});

export const EscalationPolicySchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema,
  name: z.string(),
  repeat_enabled: z.boolean(),
  repeat_interval_seconds: z.number().int().min(0).nullable(),
  repeat_limit: z.number().int().min(1).nullable(),
  steps: z.array(EscalationPolicyStepSchema),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const IncidentEscalationStateSchema = z.object({
  incident_id: UuidSchema,
  policy_id: UuidSchema,
  current_step: z.number().int().min(1),
  repeat_iteration: z.number().int().min(0),
  next_run_at: DateTimeSchema.nullable(),
  status: EscalationStateStatusSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const ManualEscalationActionSchema = z.enum([
  "trigger_current_step",
  "advance_to_next_step",
  "run_specific_step",
]);

export const ManualEscalationRequestSchema = z.object({
  action: ManualEscalationActionSchema,
  step_order: z.number().int().min(1).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  force: z.boolean().default(false),
  update_current_step: z.boolean().default(false),
}).superRefine((input, context) => {
  if (input.action === "run_specific_step" && input.step_order === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "step_order is required for run_specific_step",
      path: ["step_order"],
    });
  }
});

export const UpsertEscalationPolicyStepRequestSchema = z.object({
  id: UuidSchema.optional(),
  step_order: z.number().int().min(1),
  delay_seconds: z.number().int().min(0),
  target_type: EscalationTargetTypeSchema,
  target_id: z.string().nullable().optional(),
}).superRefine((input, context) => {
  if (input.target_type === "primary_on_call" || input.target_type === "secondary_on_call") {
    if (!UuidSchema.safeParse(input.target_id).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "On-call escalation steps require an on-call schedule id target_id",
        path: ["target_id"],
      });
    }
  }
});

export const CreateEscalationPolicyRequestSchema = z.object({
  workspace_id: UuidSchema,
  name: z.string().min(1),
  repeat_enabled: z.boolean().default(false),
  repeat_interval_seconds: z.number().int().min(0).nullable().optional(),
  repeat_limit: z.number().int().min(1).nullable().optional(),
  steps: z.array(UpsertEscalationPolicyStepRequestSchema).min(1),
});

export const UpdateEscalationPolicyRequestSchema = CreateEscalationPolicyRequestSchema.omit({ workspace_id: true }).partial().extend({
  steps: z.array(UpsertEscalationPolicyStepRequestSchema).min(1).optional(),
});

export type EscalationPolicy = z.infer<typeof EscalationPolicySchema>;
export type EscalationPolicyStep = z.infer<typeof EscalationPolicyStepSchema>;
export type IncidentEscalationState = z.infer<typeof IncidentEscalationStateSchema>;
export type ManualEscalationAction = z.infer<typeof ManualEscalationActionSchema>;
export type ManualEscalationRequest = z.infer<typeof ManualEscalationRequestSchema>;
export type UpsertEscalationPolicyStepRequest = z.infer<typeof UpsertEscalationPolicyStepRequestSchema>;
export type CreateEscalationPolicyRequest = z.infer<typeof CreateEscalationPolicyRequestSchema>;
export type UpdateEscalationPolicyRequest = z.infer<typeof UpdateEscalationPolicyRequestSchema>;
