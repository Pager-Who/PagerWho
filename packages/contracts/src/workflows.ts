import { z } from "zod";

import { DateTimeSchema, paginatedResponseSchema, PaginationQuerySchema, UuidSchema } from "./common";
import {
  ActivityResourceTypeSchema,
  WorkspacePermissionSchema,
  WorkflowActionRunStatusSchema,
  WorkflowActionTypeSchema,
  WorkflowRunStatusSchema,
  WorkflowTriggerFilterOperatorSchema,
} from "./enums";

const QueryBooleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const WorkflowTriggerFilterSchema = z.object({
  field: z.string().min(1),
  operator: WorkflowTriggerFilterOperatorSchema,
  value: z.unknown().optional(),
});

export const WorkflowActionGroupSchema = z.enum([
  "logic",
  "external",
  "incident",
  "service",
  "webhook",
  "escalation",
  "on_call",
  "notification",
]);

export const WorkflowActionConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["boolean", "json", "number", "select", "string", "textarea", "uuid"]),
  required: z.boolean().default(false),
  template: z.boolean().default(true),
  options: z.array(z.object({
    label: z.string().min(1),
    value: z.string(),
  })).optional(),
});

export const WorkflowActionOutputFieldSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["boolean", "json", "number", "string", "uuid"]).default("string"),
});

export const WorkflowActionCatalogItemSchema = z.object({
  type: WorkflowActionTypeSchema,
  group: WorkflowActionGroupSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  required_permission: WorkspacePermissionSchema.optional(),
  dangerous: z.boolean().default(false),
  target_fields: z.array(WorkflowActionConfigFieldSchema).default([]),
  body_fields: z.array(WorkflowActionConfigFieldSchema).default([]),
  output_fields: z.array(WorkflowActionOutputFieldSchema).default([]),
});

export const WORKFLOW_ACTION_CATALOG = [
  {
    type: "condition",
    group: "logic",
    label: "Condition",
    description: "Branch the workflow by checking event data.",
    target_fields: [],
    body_fields: [
      { key: "field", label: "Value to check", kind: "string", required: true },
      {
        key: "operator",
        label: "Operator",
        kind: "select",
        required: true,
        template: false,
        options: [
          { label: "equals", value: "equals" },
          { label: "in", value: "in" },
          { label: "exists", value: "exists" },
        ],
      },
      { key: "value", label: "Value", kind: "string" },
    ],
    output_fields: [
      { path: "matched", label: "Matched", kind: "boolean" },
      { path: "left_value", label: "Checked value", kind: "json" },
    ],
  },
  {
    type: "http_request",
    group: "external",
    label: "HTTP request",
    description: "Call an external HTTP endpoint.",
    required_permission: "project.manage",
    target_fields: [],
    body_fields: [
      { key: "url", label: "URL", kind: "string", required: true },
      {
        key: "method",
        label: "Method",
        kind: "select",
        required: true,
        template: false,
        options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => ({ label: method, value: method })),
      },
      { key: "headers", label: "Headers", kind: "json" },
      { key: "body", label: "Body", kind: "json" },
      { key: "timeout_ms", label: "Timeout ms", kind: "number" },
    ],
    output_fields: [
      { path: "status", label: "Status code", kind: "number" },
      { path: "body", label: "Response body", kind: "string" },
    ],
  },
  {
    type: "notification_webhook",
    group: "external",
    label: "Notification webhook",
    description: "Legacy alias for HTTP webhook delivery.",
    required_permission: "project.manage",
    target_fields: [],
    body_fields: [
      { key: "url", label: "URL", kind: "string", required: true },
      { key: "method", label: "Method", kind: "select", required: true, template: false, options: [{ label: "POST", value: "POST" }] },
      { key: "body", label: "Body", kind: "json" },
      { key: "timeout_ms", label: "Timeout ms", kind: "number" },
    ],
    output_fields: [
      { path: "status", label: "Status code", kind: "number" },
      { path: "body", label: "Response body", kind: "string" },
    ],
  },
  {
    type: "integration_webhook",
    group: "external",
    label: "Integration webhook",
    description: "Send JSON to a webhook configured in Project settings.",
    required_permission: "project.manage",
    target_fields: [{
      key: "integration_type",
      label: "Integration",
      kind: "select",
      required: true,
      template: false,
      options: ["slack", "discord", "teams", "custom"].map((value) => ({ label: value, value })),
    }],
    body_fields: [{ key: "payload", label: "Payload override", kind: "json" }],
    output_fields: [
      { path: "status", label: "Status code", kind: "number" },
      { path: "body", label: "Response body", kind: "string" },
    ],
  },
  {
    type: "service_create",
    group: "service",
    label: "Create service",
    description: "Create a monitored service and default webhook endpoint.",
    required_permission: "service.manage",
    target_fields: [],
    body_fields: [
      { key: "name", label: "Service name", kind: "string", required: true },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "team_id", label: "Team ID", kind: "uuid" },
      { key: "escalation_policy_id", label: "Escalation policy ID", kind: "uuid" },
    ],
    output_fields: [
      { path: "service.id", label: "Service ID", kind: "uuid" },
      { path: "service.name", label: "Service name", kind: "string" },
      { path: "service.escalation_policy_id", label: "Escalation policy ID", kind: "uuid" },
      { path: "default_webhook_endpoint.id", label: "Webhook endpoint ID", kind: "uuid" },
    ],
  },
  {
    type: "service_update",
    group: "service",
    label: "Update service",
    description: "Update service fields such as name, team, or escalation policy.",
    required_permission: "service.manage",
    target_fields: [{ key: "service_id", label: "Target service", kind: "uuid", required: true }],
    body_fields: [
      { key: "name", label: "Service name", kind: "string" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "team_id", label: "Team ID", kind: "uuid" },
      { key: "escalation_policy_id", label: "Escalation policy ID", kind: "uuid" },
    ],
    output_fields: [
      { path: "id", label: "Service ID", kind: "uuid" },
      { path: "name", label: "Service name", kind: "string" },
      { path: "escalation_policy_id", label: "Escalation policy ID", kind: "uuid" },
    ],
  },
  {
    type: "service_delete",
    group: "service",
    label: "Delete service",
    description: "Delete a service when it has no incident history.",
    required_permission: "service.manage",
    dangerous: true,
    target_fields: [{ key: "service_id", label: "Target service", kind: "uuid", required: true }],
    body_fields: [],
    output_fields: [
      { path: "service_id", label: "Deleted service ID", kind: "uuid" },
    ],
  },
  {
    type: "webhook_endpoint_create",
    group: "webhook",
    label: "Create webhook endpoint",
    description: "Create an active webhook endpoint for a service.",
    required_permission: "webhook.manage",
    target_fields: [{ key: "service_id", label: "Target service", kind: "uuid", required: true }],
    body_fields: [],
    output_fields: [
      { path: "id", label: "Webhook endpoint ID", kind: "uuid" },
      { path: "service_id", label: "Service ID", kind: "uuid" },
      { path: "name", label: "Webhook endpoint name", kind: "string" },
    ],
  },
  {
    type: "webhook_endpoint_rotate_secret",
    group: "webhook",
    label: "Rotate webhook secret",
    description: "Rotate a webhook endpoint secret.",
    required_permission: "webhook.manage",
    dangerous: true,
    target_fields: [{ key: "endpoint_id", label: "Webhook endpoint", kind: "uuid", required: true }],
    body_fields: [],
    output_fields: [
      { path: "id", label: "Webhook endpoint ID", kind: "uuid" },
      { path: "service_id", label: "Service ID", kind: "uuid" },
    ],
  },
  {
    type: "webhook_endpoint_delete",
    group: "webhook",
    label: "Delete webhook endpoint",
    description: "Disable a webhook endpoint.",
    required_permission: "webhook.manage",
    dangerous: true,
    target_fields: [{ key: "endpoint_id", label: "Webhook endpoint", kind: "uuid", required: true }],
    body_fields: [],
    output_fields: [
      { path: "endpoint_id", label: "Deleted endpoint ID", kind: "uuid" },
    ],
  },
  {
    type: "incident_create",
    group: "incident",
    label: "Create incident",
    description: "Create an incident for a service.",
    required_permission: "incident.create",
    target_fields: [],
    body_fields: [
      { key: "service_id", label: "Service ID", kind: "uuid", required: true },
      { key: "title", label: "Title", kind: "string", required: true },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "severity", label: "Severity", kind: "select", required: true, template: false, options: ["critical", "high", "medium", "low"].map((value) => ({ label: value, value })) },
      { key: "priority", label: "Priority", kind: "select", template: false, options: ["P1", "P2", "P3", "P4", "P5"].map((value) => ({ label: value, value })) },
      { key: "source", label: "Source", kind: "string" },
      { key: "dedup_key", label: "Dedup key", kind: "string" },
    ],
    output_fields: [
      { path: "id", label: "Incident ID", kind: "uuid" },
      { path: "service_id", label: "Service ID", kind: "uuid" },
      { path: "priority", label: "Priority", kind: "string" },
      { path: "status", label: "Status", kind: "string" },
    ],
  },
  {
    type: "incident_ack",
    group: "incident",
    label: "Acknowledge incident",
    description: "Acknowledge the target incident.",
    required_permission: "incident.respond",
    target_fields: [{ key: "incident_id", label: "Target incident", kind: "uuid" }],
    body_fields: [],
    output_fields: [
      { path: "id", label: "Incident ID", kind: "uuid" },
      { path: "status", label: "Status", kind: "string" },
    ],
  },
  {
    type: "incident_resolve",
    group: "incident",
    label: "Resolve incident",
    description: "Resolve the target incident.",
    required_permission: "incident.respond",
    target_fields: [{ key: "incident_id", label: "Target incident", kind: "uuid" }],
    body_fields: [],
    output_fields: [
      { path: "id", label: "Incident ID", kind: "uuid" },
      { path: "status", label: "Status", kind: "string" },
    ],
  },
  {
    type: "incident_update_priority",
    group: "incident",
    label: "Update incident priority",
    description: "Set a new priority on an incident.",
    required_permission: "incident.respond",
    target_fields: [{ key: "incident_id", label: "Target incident", kind: "uuid" }],
    body_fields: [{ key: "priority", label: "Priority", kind: "select", required: true, template: false, options: ["P1", "P2", "P3", "P4", "P5"].map((value) => ({ label: value, value })) }],
    output_fields: [
      { path: "id", label: "Incident ID", kind: "uuid" },
      { path: "priority", label: "Priority", kind: "string" },
    ],
  },
  {
    type: "incident_manual_escalation",
    group: "incident",
    label: "Manual escalation",
    description: "Trigger or advance incident escalation.",
    required_permission: "incident.respond",
    target_fields: [{ key: "incident_id", label: "Target incident", kind: "uuid" }],
    body_fields: [
      { key: "action", label: "Escalation action", kind: "select", required: true, template: false, options: ["trigger_current_step", "advance_to_next_step", "run_specific_step"].map((value) => ({ label: value, value })) },
      { key: "step_order", label: "Step order", kind: "number" },
      { key: "reason", label: "Reason", kind: "textarea" },
      { key: "force", label: "Force acknowledged incident", kind: "boolean", template: false },
      { key: "update_current_step", label: "Update current step", kind: "boolean", template: false },
    ],
    output_fields: [
      { path: "incident_id", label: "Incident ID", kind: "uuid" },
      { path: "action", label: "Escalation action", kind: "string" },
    ],
  },
  {
    type: "escalation_policy_create",
    group: "escalation",
    label: "Create escalation policy",
    description: "Create an escalation policy with steps.",
    required_permission: "escalation.manage",
    target_fields: [],
    body_fields: [
      { key: "name", label: "Policy name", kind: "string", required: true },
      { key: "steps", label: "Steps JSON", kind: "json", required: true },
      { key: "repeat_enabled", label: "Repeat enabled", kind: "boolean", template: false },
      { key: "repeat_interval_seconds", label: "Repeat interval seconds", kind: "number" },
      { key: "repeat_limit", label: "Repeat limit", kind: "number" },
    ],
    output_fields: [
      { path: "id", label: "Policy ID", kind: "uuid" },
      { path: "name", label: "Policy name", kind: "string" },
    ],
  },
  {
    type: "escalation_policy_update",
    group: "escalation",
    label: "Update escalation policy",
    description: "Update escalation policy fields and optionally replace steps.",
    required_permission: "escalation.manage",
    target_fields: [{ key: "policy_id", label: "Escalation policy", kind: "uuid", required: true }],
    body_fields: [
      { key: "name", label: "Policy name", kind: "string" },
      { key: "steps", label: "Steps JSON", kind: "json" },
      { key: "repeat_enabled", label: "Repeat enabled", kind: "boolean", template: false },
      { key: "repeat_interval_seconds", label: "Repeat interval seconds", kind: "number" },
      { key: "repeat_limit", label: "Repeat limit", kind: "number" },
    ],
    output_fields: [
      { path: "id", label: "Policy ID", kind: "uuid" },
      { path: "name", label: "Policy name", kind: "string" },
    ],
  },
  {
    type: "escalation_policy_delete",
    group: "escalation",
    label: "Delete escalation policy",
    description: "Delete an unused escalation policy.",
    required_permission: "escalation.manage",
    dangerous: true,
    target_fields: [{ key: "policy_id", label: "Escalation policy", kind: "uuid", required: true }],
    body_fields: [],
    output_fields: [
      { path: "policy_id", label: "Deleted policy ID", kind: "uuid" },
    ],
  },
  {
    type: "on_call_schedule_create",
    group: "on_call",
    label: "Create on-call schedule",
    description: "Create a schedule with primary/secondary rotations.",
    required_permission: "on_call.manage",
    target_fields: [],
    body_fields: [
      { key: "name", label: "Schedule name", kind: "string", required: true },
      { key: "timezone", label: "Timezone", kind: "string", required: true },
      { key: "rotations", label: "Rotations JSON", kind: "json", required: true },
      { key: "team_id", label: "Team ID", kind: "uuid" },
      { key: "service_id", label: "Service ID", kind: "uuid" },
    ],
    output_fields: [
      { path: "id", label: "Schedule ID", kind: "uuid" },
      { path: "name", label: "Schedule name", kind: "string" },
      { path: "timezone", label: "Timezone", kind: "string" },
    ],
  },
  {
    type: "on_call_schedule_update",
    group: "on_call",
    label: "Update on-call schedule",
    description: "Update schedule fields and optionally replace rotations.",
    required_permission: "on_call.manage",
    target_fields: [{ key: "schedule_id", label: "On-call schedule", kind: "uuid", required: true }],
    body_fields: [
      { key: "name", label: "Schedule name", kind: "string" },
      { key: "timezone", label: "Timezone", kind: "string" },
      { key: "rotations", label: "Rotations JSON", kind: "json" },
      { key: "team_id", label: "Team ID", kind: "uuid" },
      { key: "service_id", label: "Service ID", kind: "uuid" },
    ],
    output_fields: [
      { path: "id", label: "Schedule ID", kind: "uuid" },
      { path: "name", label: "Schedule name", kind: "string" },
      { path: "timezone", label: "Timezone", kind: "string" },
    ],
  },
  {
    type: "on_call_schedule_delete",
    group: "on_call",
    label: "Delete on-call schedule",
    description: "Delete an unused on-call schedule.",
    required_permission: "on_call.manage",
    dangerous: true,
    target_fields: [{ key: "schedule_id", label: "On-call schedule", kind: "uuid", required: true }],
    body_fields: [],
    output_fields: [
      { path: "schedule_id", label: "Deleted schedule ID", kind: "uuid" },
    ],
  },
  {
    type: "on_call_override_create",
    group: "on_call",
    label: "Create on-call override",
    description: "Create a temporary on-call override.",
    required_permission: "on_call.manage",
    target_fields: [],
    body_fields: [
      { key: "schedule_id", label: "Schedule ID", kind: "uuid", required: true },
      { key: "user_id", label: "User ID", kind: "uuid", required: true },
      { key: "layer", label: "Layer", kind: "select", required: true, template: false, options: ["primary", "secondary"].map((value) => ({ label: value, value })) },
      { key: "starts_at", label: "Starts at", kind: "string", required: true },
      { key: "ends_at", label: "Ends at", kind: "string", required: true },
    ],
    output_fields: [
      { path: "id", label: "Override ID", kind: "uuid" },
      { path: "schedule_id", label: "Schedule ID", kind: "uuid" },
      { path: "user_id", label: "User ID", kind: "uuid" },
    ],
  },
  {
    type: "on_call_override_delete",
    group: "on_call",
    label: "Delete on-call override",
    description: "Delete an on-call override.",
    required_permission: "on_call.manage",
    dangerous: true,
    target_fields: [{ key: "override_id", label: "On-call override", kind: "uuid", required: true }],
    body_fields: [],
    output_fields: [
      { path: "override_id", label: "Deleted override ID", kind: "uuid" },
    ],
  },
  {
    type: "notification_provider_update",
    group: "notification",
    label: "Update notification provider",
    description: "Update project notification provider settings.",
    required_permission: "notification.manage",
    target_fields: [{ key: "provider", label: "Provider", kind: "select", required: true, template: false, options: ["slack", "email", "twilio"].map((value) => ({ label: value, value })) }],
    body_fields: [
      { key: "enabled", label: "Enabled", kind: "boolean", template: false },
      { key: "slack", label: "Slack config JSON", kind: "json" },
      { key: "email", label: "Email config JSON", kind: "json" },
      { key: "twilio", label: "Twilio config JSON", kind: "json" },
    ],
    output_fields: [
      { path: "provider", label: "Provider", kind: "string" },
      { path: "enabled", label: "Enabled", kind: "boolean" },
    ],
  },
] as const satisfies readonly z.input<typeof WorkflowActionCatalogItemSchema>[];

export const WorkflowTriggerInputSchema = z.object({
  trigger_key: z.string().min(1).max(80).optional(),
  event_action: z.string().min(1),
  resource_type: ActivityResourceTypeSchema.optional().nullable(),
  filters: z.array(WorkflowTriggerFilterSchema).default([]),
  entry_action_key: z.string().min(1).max(80).optional().nullable(),
});

export const WorkflowActionInputSchema = z.object({
  action_key: z.string().min(1).max(80).optional(),
  type: WorkflowActionTypeSchema,
  config: z.record(z.string(), z.unknown()).default({}),
  next_action_key: z.string().min(1).max(80).optional().nullable(),
  failure_action_key: z.string().min(1).max(80).optional().nullable(),
});

export const WorkflowTriggerSchema = WorkflowTriggerInputSchema.extend({
  id: UuidSchema,
  workflow_id: UuidSchema,
  trigger_key: z.string(),
  entry_action_key: z.string().nullable(),
  created_at: DateTimeSchema,
});

export const WorkflowActionSchema = WorkflowActionInputSchema.extend({
  id: UuidSchema,
  workflow_id: UuidSchema,
  action_order: z.number().int().min(1),
  action_key: z.string(),
  next_action_key: z.string().nullable(),
  failure_action_key: z.string().nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const WorkflowSchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  graph_metadata: z.record(z.string(), z.unknown()).nullable(),
  run_as_user_id: UuidSchema,
  created_by_user_id: UuidSchema.nullable(),
  triggers: z.array(WorkflowTriggerSchema),
  actions: z.array(WorkflowActionSchema),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const WorkflowEventSchema = z.object({
  id: UuidSchema,
  activity_log_id: UuidSchema.nullable(),
  workspace_id: UuidSchema,
  action: z.string(),
  resource_type: ActivityResourceTypeSchema,
  resource_id: UuidSchema.nullable(),
  actor_user_id: UuidSchema.nullable(),
  metadata: z.unknown().nullable(),
  origin: z.string(),
  occurred_at: DateTimeSchema,
  processed_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
});

export const WorkflowActionRunSchema = z.object({
  id: UuidSchema,
  workflow_run_id: UuidSchema,
  workflow_action_id: UuidSchema,
  action_order: z.number().int().min(1),
  type: WorkflowActionTypeSchema,
  status: WorkflowActionRunStatusSchema,
  attempt: z.number().int().min(0),
  error_message: z.string().nullable(),
  output: z.unknown().nullable(),
  started_at: DateTimeSchema.nullable(),
  completed_at: DateTimeSchema.nullable(),
  next_retry_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const WorkflowRunSchema = z.object({
  id: UuidSchema,
  workflow_id: UuidSchema,
  workflow_event_id: UuidSchema,
  workspace_id: UuidSchema,
  matched_trigger_id: UuidSchema.nullable(),
  entry_action_key: z.string().nullable(),
  status: WorkflowRunStatusSchema,
  attempt: z.number().int().min(0),
  error_message: z.string().nullable(),
  started_at: DateTimeSchema.nullable(),
  completed_at: DateTimeSchema.nullable(),
  next_retry_at: DateTimeSchema.nullable(),
  event: WorkflowEventSchema.optional(),
  action_runs: z.array(WorkflowActionRunSchema).optional(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const WorkflowTriggerCatalogItemSchema = z.object({
  action: z.string(),
  resource_type: ActivityResourceTypeSchema,
  label: z.string(),
});

export const WorkflowTriggerCatalogSchema = z.object({
  items: z.array(WorkflowTriggerCatalogItemSchema),
});

export const WorkflowActionCatalogSchema = z.object({
  items: z.array(WorkflowActionCatalogItemSchema),
});

export const CreateWorkflowRequestSchema = z.object({
  workspace_id: UuidSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional().nullable(),
  enabled: z.boolean().optional(),
  graph_metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  run_as_user_id: UuidSchema.optional(),
  triggers: z.array(WorkflowTriggerInputSchema).min(1).optional(),
  actions: z.array(WorkflowActionInputSchema).min(1).optional(),
});

export const UpdateWorkflowRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  enabled: z.boolean().optional(),
  graph_metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  run_as_user_id: UuidSchema.optional(),
  triggers: z.array(WorkflowTriggerInputSchema).min(1).optional(),
  actions: z.array(WorkflowActionInputSchema).min(1).optional(),
});

export const WorkflowListQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  workspace_id: UuidSchema.optional(),
  enabled: QueryBooleanSchema,
});

export const WorkflowRunListQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional(),
  status: WorkflowRunStatusSchema.optional(),
});

export const WorkflowTestRunRequestSchema = z.object({
  actor_user_id: UuidSchema.optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  resource_id: UuidSchema.optional().nullable(),
  trigger_key: z.string().min(1).optional(),
});

export const PaginatedWorkflowsSchema = paginatedResponseSchema(WorkflowSchema);
export const PaginatedWorkflowRunsSchema = paginatedResponseSchema(WorkflowRunSchema);

export type WorkflowTriggerFilter = z.infer<typeof WorkflowTriggerFilterSchema>;
export type WorkflowActionGroup = z.infer<typeof WorkflowActionGroupSchema>;
export type WorkflowActionConfigField = z.infer<typeof WorkflowActionConfigFieldSchema>;
export type WorkflowActionOutputField = z.infer<typeof WorkflowActionOutputFieldSchema>;
export type WorkflowActionCatalogItem = z.infer<typeof WorkflowActionCatalogItemSchema>;
export type WorkflowActionCatalog = z.infer<typeof WorkflowActionCatalogSchema>;
export type WorkflowTriggerInput = z.infer<typeof WorkflowTriggerInputSchema>;
export type WorkflowActionInput = z.infer<typeof WorkflowActionInputSchema>;
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;
export type WorkflowActionRun = z.infer<typeof WorkflowActionRunSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type WorkflowTriggerCatalogItem = z.infer<typeof WorkflowTriggerCatalogItemSchema>;
export type WorkflowTriggerCatalog = z.infer<typeof WorkflowTriggerCatalogSchema>;
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequestSchema>;
export type UpdateWorkflowRequest = z.infer<typeof UpdateWorkflowRequestSchema>;
export type WorkflowListQuery = z.infer<typeof WorkflowListQuerySchema>;
export type WorkflowRunListQuery = z.infer<typeof WorkflowRunListQuerySchema>;
export type WorkflowTestRunRequest = z.infer<typeof WorkflowTestRunRequestSchema>;
export type PaginatedWorkflows = z.infer<typeof PaginatedWorkflowsSchema>;
export type PaginatedWorkflowRuns = z.infer<typeof PaginatedWorkflowRunsSchema>;
