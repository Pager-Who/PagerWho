import { z } from "zod";

import { UuidSchema } from "./common";
import {
  CreateEscalationPolicyRequestSchema,
  UpdateEscalationPolicyRequestSchema,
} from "./escalation";
import { EscalationTargetTypeSchema } from "./enums";
import { CreateOnCallScheduleRequestSchema, UpdateOnCallScheduleRequestSchema } from "./on-call";
import { CreateServiceRequestSchema, UpdateServiceRequestSchema } from "./services";
import { CreateWebhookEndpointRequestSchema } from "./webhooks";
import {
  UpdateWorkspaceNotificationProviderSettingRequestSchema,
  WorkspaceNotificationProviderSchema,
} from "./workspaces";

export const CopilotSourceSchema = z.object({
  path: z.string(),
  snippet: z.string(),
  title: z.string(),
});

export const CopilotConversationMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  role: z.enum(["assistant", "user"]),
});

export const CopilotLocaleSchema = z.enum(["en", "ko", "zh-CN"]);

export const CopilotQueryReceiptSchema = z.object({
  operation: z.string(), queried_at: z.string().datetime(),
  at: z.string().datetime(), timezone: z.string(), local_time: z.string(),
  scope: z.string(), returned_count: z.number().int().min(0),
  has_more: z.boolean(), next_cursor: z.string().optional(),
  delivery_verified: z.literal(false),
});

export const CopilotTaskOperationSchema = z.enum([
  "attach_on_call_to_service",
  "configure_notification",
  "create_on_call_schedule",
  "create_service",
  "improve_workspace",
  "rename_service",
  "turnkey_setup",
]);

export const CopilotTaskStateSchema = z.object({
  known_inputs: z.record(z.string(), z.string().trim().max(1000)).default({}),
  operation: CopilotTaskOperationSchema,
  pending_goal: z.string().trim().min(1).max(500),
  required_fields: z.array(z.string().trim().min(1)).default([]),
  target: z.object({
    id: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    type: z.enum(["escalation_policy", "notification_provider", "on_call_schedule", "service", "workspace"]),
  }).optional(),
  task_id: z.string().trim().min(1).max(120),
});

export const CopilotClarificationSubmissionSchema = z.object({
  task: CopilotTaskStateSchema.optional(),
  task_id: z.string().trim().min(1).max(120).optional(),
  values: z.record(z.string(), z.string().trim().max(1000)).default({}),
});

export const CopilotAskRequestSchema = z.object({
  docs_version: z.string().regex(/^[0-9a-f]{8}$/).optional(),
  history: z.array(CopilotConversationMessageSchema).max(8).optional(),
  locale: CopilotLocaleSchema.optional(),
  question: z.string().trim().min(1).max(1000),
  structured_input: CopilotClarificationSubmissionSchema.optional(),
  workspace_id: UuidSchema.optional(),
});

const CopilotActionBaseSchema = z.object({
  after: z.array(z.string().trim().min(1)).default([]),
  before: z.array(z.string().trim().min(1)).default([]),
  description: z.string().trim().min(1).optional(),
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  risks: z.array(z.string().trim().min(1)).default([]),
});

const ActionIdRefSchema = z.string().trim().min(1).max(80);
const CopilotActionTypeSchema = z.enum([
  "create_service",
  "update_service",
  "create_service_webhook",
  "create_escalation_policy",
  "update_escalation_policy",
  "create_on_call_schedule",
  "update_on_call_schedule",
  "update_notification_provider",
]);

const CopilotEscalationPolicyStepRequestSchema = z.object({
  delay_seconds: z.number().int().min(0),
  id: UuidSchema.optional(),
  step_order: z.number().int().min(1),
  target_action_id: ActionIdRefSchema.optional(),
  target_id: z.string().nullable().optional(),
  target_type: EscalationTargetTypeSchema,
})
  .superRefine((input, context) => {
    if (
      (input.target_type === "primary_on_call" || input.target_type === "secondary_on_call")
      && !input.target_id
      && !input.target_action_id
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "On-call escalation steps require target_id or target_action_id",
        path: ["target_id"],
      });
    }
  });

const CopilotCreateEscalationPolicyRequestSchema = CreateEscalationPolicyRequestSchema
  .omit({ steps: true })
  .extend({
    steps: z.array(CopilotEscalationPolicyStepRequestSchema).min(1),
  });

const CopilotUpdateEscalationPolicyRequestSchema = UpdateEscalationPolicyRequestSchema
  .omit({ steps: true })
  .extend({
    steps: z.array(CopilotEscalationPolicyStepRequestSchema).min(1).optional(),
  });

export const CopilotActionSchema = z.union([
  CopilotActionBaseSchema.extend({
    input: CreateServiceRequestSchema,
    type: z.literal("create_service"),
  }),
  CopilotActionBaseSchema.extend({
    escalation_policy_action_id: ActionIdRefSchema.optional(),
    input: UpdateServiceRequestSchema,
    service_id: UuidSchema.optional(),
    service_id_action_id: ActionIdRefSchema.optional(),
    type: z.literal("update_service"),
  }).superRefine((input, context) => {
    if (!input.service_id && !input.service_id_action_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "service_id or service_id_action_id is required",
        path: ["service_id"],
      });
    }
  }),
  CopilotActionBaseSchema.extend({
    input: CreateWebhookEndpointRequestSchema.optional(),
    service_id: UuidSchema.optional(),
    service_id_action_id: ActionIdRefSchema.optional(),
    type: z.literal("create_service_webhook"),
  }).superRefine((input, context) => {
    if (!input.service_id && !input.service_id_action_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "service_id or service_id_action_id is required",
        path: ["service_id"],
      });
    }
  }),
  CopilotActionBaseSchema.extend({
    input: CopilotCreateEscalationPolicyRequestSchema,
    type: z.literal("create_escalation_policy"),
  }),
  CopilotActionBaseSchema.extend({
    input: CopilotUpdateEscalationPolicyRequestSchema,
    policy_id: UuidSchema,
    type: z.literal("update_escalation_policy"),
  }),
  CopilotActionBaseSchema.extend({
    input: CreateOnCallScheduleRequestSchema,
    service_id_action_id: ActionIdRefSchema.optional(),
    type: z.literal("create_on_call_schedule"),
  }),
  CopilotActionBaseSchema.extend({
    input: UpdateOnCallScheduleRequestSchema,
    schedule_id: UuidSchema,
    service_id_action_id: ActionIdRefSchema.optional(),
    type: z.literal("update_on_call_schedule"),
  }),
  CopilotActionBaseSchema.extend({
    input: UpdateWorkspaceNotificationProviderSettingRequestSchema,
    provider: WorkspaceNotificationProviderSchema,
    type: z.literal("update_notification_provider"),
    workspace_id: UuidSchema,
  }),
]);

export const CopilotClarificationFieldSchema = z.object({
  description: z.string().optional(),
  id: z.string().trim().min(1),
  input_type: z.enum(["text", "email", "select", "url"]).default("text"),
  label: z.string().trim().min(1),
  options: z.array(z.object({
    label: z.string().trim().min(1),
    value: z.string().trim().min(1),
  })).optional(),
  required: z.boolean().default(true),
});

export const CopilotClarificationSchema = z.object({
  fields: z.array(CopilotClarificationFieldSchema).min(1),
  reason: z.string().trim().min(1),
  task: CopilotTaskStateSchema.optional(),
  task_id: z.string().trim().min(1).max(120).optional(),
});

export const CopilotProposalSchema = z.object({
  actions: z.array(CopilotActionSchema),
  goal: z.string().trim().min(1),
  id: z.string().trim().min(1),
  missing_inputs: z.array(z.string().trim().min(1)).default([]),
  risks: z.array(z.string().trim().min(1)).default([]),
  summary: z.string().trim().min(1),
  task_id: z.string().trim().min(1).max(120).optional(),
  workspace_id: UuidSchema.optional(),
});

export const CopilotExecutionResultSchema = z.object({
  action_id: z.string(),
  entity_id: z.string().optional(),
  entity_type: z.string().optional(),
  label: z.string(),
  message: z.string(),
  output: z.unknown().optional(),
  status: z.enum(["succeeded", "failed"]),
  type: CopilotActionTypeSchema,
});

export const CopilotAskResponseSchema = z.object({
  answer: z.string(),
  clarification: CopilotClarificationSchema.optional(),
  kind: z.enum(["message", "clarification", "proposal", "execution_result"]).default("message"),
  mode: z.enum(["ai", "direct"]),
  model: z.string().optional(),
  proposal: CopilotProposalSchema.optional(),
  results: z.array(CopilotExecutionResultSchema).optional(),
  sources: z.array(CopilotSourceSchema),
  query_receipts: z.array(CopilotQueryReceiptSchema).max(8).optional(),
});

export const CopilotExecuteRequestSchema = z.object({
  approval: z.literal(true),
  locale: CopilotLocaleSchema.optional(),
  proposal: CopilotProposalSchema,
});

export const CopilotExecuteResponseSchema = CopilotAskResponseSchema.extend({
  kind: z.literal("execution_result"),
  mode: z.literal("direct"),
  results: z.array(CopilotExecutionResultSchema),
  sources: z.array(CopilotSourceSchema).length(0),
});

// Wire format of the server-configured OpenAI-compatible model provider.
export const CopilotApiFormatSchema = z.enum(["responses", "chat-completions"]);

export const CopilotStatusResponseSchema = z.object({
  available: z.boolean(),
  checked_at: z.string(),
  message: z.string().optional(),
  // Null when Copilot is not configured on this server.
  model: z.string().nullable(),
  api_format: CopilotApiFormatSchema.nullable(),
});

export type CopilotApiFormat = z.infer<typeof CopilotApiFormatSchema>;

export type CopilotSource = z.infer<typeof CopilotSourceSchema>;
export type CopilotQueryReceipt = z.infer<typeof CopilotQueryReceiptSchema>;
export type CopilotConversationMessage = z.infer<typeof CopilotConversationMessageSchema>;
export type CopilotAction = z.infer<typeof CopilotActionSchema>;
export type CopilotAskRequest = z.infer<typeof CopilotAskRequestSchema>;
export type CopilotAskResponse = z.infer<typeof CopilotAskResponseSchema>;
export type CopilotClarification = z.infer<typeof CopilotClarificationSchema>;
export type CopilotClarificationSubmission = z.infer<typeof CopilotClarificationSubmissionSchema>;
export type CopilotExecutionResult = z.infer<typeof CopilotExecutionResultSchema>;
export type CopilotExecuteRequest = z.infer<typeof CopilotExecuteRequestSchema>;
export type CopilotExecuteResponse = z.infer<typeof CopilotExecuteResponseSchema>;
export type CopilotLocale = z.infer<typeof CopilotLocaleSchema>;
export type CopilotProposal = z.infer<typeof CopilotProposalSchema>;
export type CopilotStatusResponse = z.infer<typeof CopilotStatusResponseSchema>;
export type CopilotTaskOperation = z.infer<typeof CopilotTaskOperationSchema>;
export type CopilotTaskState = z.infer<typeof CopilotTaskStateSchema>;
