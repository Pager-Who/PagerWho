const labels: Readonly<Record<string, string>> = {
  on_call_schedules: "On-call schedules",
  escalation_policies: "Escalation policies",
  services: "Services",
  members: "Members",
  workspaces: "Workspaces",
  healthy: "Within limit",
  near_limit: "Near limit",
  exceeded: "Limit reached",
  unlimited: "Unlimited",
  dead_letter: "Delivery stopped",
  retrying: "Retrying",
  sent: "Sent",
  sent_after_ack: "Sent after acknowledgment",
  succeeded: "Succeeded",
  failed: "Failed",
  timed_out: "Timed out",
  active: "Active",
  suspended: "Suspended",
  user: "Account",
  workspace: "Workspace",
  incident: "Incident",
  notification: "Notification",
  worker: "Worker",
  worker_run: "Worker run",
  webhook: "Webhook",
  password: "Password",
  email_verification: "Email verification",
  password_reset: "Password reset",
  platform_admin: "Platform administrator",
  oidc: "OpenID Connect",
  saml: "SAML",
  sms: "SMS",
  phone: "Phone call",
  "platform.user_suspended": "Account suspended",
  "platform.user_restored": "Account restored",
  "platform.user_sessions_revoked": "Account sessions revoked",
  "platform.workspace_suspended": "Workspace suspended",
  "platform.workspace_restored": "Workspace restored",
  "platform.workspace_member_roles_updated": "Member permissions changed",
  "platform.workspace_quota_override_updated": "Temporary quota changed",
  "platform.workspace_quota_override_removed": "Temporary quota removed",
  "platform.notification_retry_requested": "Notification retry requested",
  "platform.resource_inspected": "Record inspected",
  "platform.resources_searched": "Records searched",
  "webhook.ingestion_failed": "Webhook processing failed",
  "webhook.ingestion_succeeded": "Webhook processed",
};

/** Converts operational codes to labels; callers retain the original value in raw data views. */
export function displayLabel(value: string): string {
  const label = Object.hasOwn(labels, value) ? labels[value] : undefined;
  if (label) {
    return label;
  }

  const words = value.replace(/[_.-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
