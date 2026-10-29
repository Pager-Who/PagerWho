import { z } from "zod";

export const ServiceStatusSchema = z.enum(["normal", "degraded", "major", "critical"]);
export const IncidentSeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export const IncidentPrioritySchema = z.enum(["P1", "P2", "P3", "P4", "P5"]);
export const IncidentStatusSchema = z.enum(["triggered", "acknowledged", "resolved"]);
export const EscalationStateStatusSchema = z.enum(["active", "paused", "stopped", "completed"]);
export const NotificationStatusSchema = z.enum([
  "pending",
  "sending",
  "sent",
  "sent_after_ack",
  "failed",
  "retrying",
  "skipped",
]);
export const NotificationDeliveryAttemptStatusSchema = z.enum(["sending", "sent", "failed", "skipped", "timed_out"]);
export const NotificationChannelSchema = z.enum(["slack", "email", "sms", "phone", "webhook"]);
export const ActivityResourceTypeSchema = z.enum([
  "workspace",
  "workspace_invite",
  "workspace_notification_provider_setting",
  "workspace_webhook_integration",
  "user",
  "service",
  "incident",
  "webhook_endpoint",
  "on_call_schedule",
  "on_call_override",
  "escalation_policy",
  "notification",
  "worker_run",
  "api_request",
]);
export const EscalationTargetTypeSchema = z.enum([
  "primary_on_call",
  "secondary_on_call",
  "team",
  "user",
  "team_channel",
  "webhook",
]);
export const OnCallRotationTypeSchema = z.enum(["daily", "weekly", "custom"]);
export const OnCallLayerSchema = z.enum(["primary", "secondary"]);
export const WorkspaceRoleSchema = z.enum(["owner", "admin", "responder", "viewer"]);
export const WorkspaceRoleKeySchema = z.enum([
  "project_owner",
  "project_admin",
  "project_viewer",
  "incident_viewer",
  "incident_responder",
  "incident_manager",
  "incident_admin",
  "service_viewer",
  "service_manager",
  "service_admin",
  "on_call_viewer",
  "on_call_participant",
  "on_call_manager",
  "on_call_admin",
  "escalation_viewer",
  "escalation_manager",
  "escalation_admin",
  "notification_recipient",
  "notification_manager",
]);
export const WorkspacePermissionSchema = z.enum([
  "project.manage",
  "project.read",
  "incident.create",
  "incident.read",
  "incident.respond",
  "service.manage",
  "service.read",
  "webhook.manage",
  "on_call.manage",
  "on_call.participate",
  "on_call.read",
  "escalation.manage",
  "escalation.read",
  "notification.manage",
  "notification.receive",
]);
export const WorkspaceInviteStatusSchema = z.enum(["pending", "accepted", "declined", "revoked", "expired"]);
export const WorkerRunStatusSchema = z.enum(["running", "succeeded", "failed"]);
export const PlatformRoleSchema = z.enum(["platform_admin"]);
export const WorkflowTriggerFilterOperatorSchema = z.enum(["equals", "in", "exists"]);
export const WorkflowActionTypeSchema = z.enum([
  "condition",
  "http_request",
  "notification_webhook",
  "integration_webhook",
  "service_create",
  "service_update",
  "service_delete",
  "webhook_endpoint_create",
  "webhook_endpoint_rotate_secret",
  "webhook_endpoint_delete",
  "incident_create",
  "incident_ack",
  "incident_resolve",
  "incident_update_priority",
  "incident_manual_escalation",
  "escalation_policy_create",
  "escalation_policy_update",
  "escalation_policy_delete",
  "on_call_schedule_create",
  "on_call_schedule_update",
  "on_call_schedule_delete",
  "on_call_override_create",
  "on_call_override_delete",
  "notification_provider_update",
]);
export const WorkflowRunStatusSchema = z.enum(["pending", "running", "succeeded", "failed", "retrying", "skipped"]);
export const WorkflowActionRunStatusSchema = z.enum(["pending", "running", "succeeded", "failed", "retrying", "skipped"]);

export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;
export type IncidentSeverity = z.infer<typeof IncidentSeveritySchema>;
export type IncidentPriority = z.infer<typeof IncidentPrioritySchema>;
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;
export type EscalationStateStatus = z.infer<typeof EscalationStateStatusSchema>;
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;
export type NotificationDeliveryAttemptStatus = z.infer<typeof NotificationDeliveryAttemptStatusSchema>;
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type ActivityResourceType = z.infer<typeof ActivityResourceTypeSchema>;
export type EscalationTargetType = z.infer<typeof EscalationTargetTypeSchema>;
export type OnCallRotationType = z.infer<typeof OnCallRotationTypeSchema>;
export type OnCallLayer = z.infer<typeof OnCallLayerSchema>;
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type WorkspaceRoleKey = z.infer<typeof WorkspaceRoleKeySchema>;
export type WorkspacePermission = z.infer<typeof WorkspacePermissionSchema>;
export type WorkspaceInviteStatus = z.infer<typeof WorkspaceInviteStatusSchema>;
export type WorkerRunStatus = z.infer<typeof WorkerRunStatusSchema>;
export type PlatformRole = z.infer<typeof PlatformRoleSchema>;
export type WorkflowTriggerFilterOperator = z.infer<typeof WorkflowTriggerFilterOperatorSchema>;
export type WorkflowActionType = z.infer<typeof WorkflowActionTypeSchema>;
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;
export type WorkflowActionRunStatus = z.infer<typeof WorkflowActionRunStatusSchema>;
