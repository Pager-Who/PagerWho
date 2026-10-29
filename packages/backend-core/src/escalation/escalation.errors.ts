export type EscalationErrorCode =
  | "actor_not_found"
  | "escalation_policy_in_use"
  | "escalation_policy_not_found"
  | "incident_escalation_state_not_found"
  | "incident_not_found"
  | "invalid_incident_state"
  | "invalid_manual_escalation_action"
  | "invalid_escalation_policy"
  | "notification_target_role_required"
  | "on_call_schedule_not_found"
  | "workspace_member_not_found"
  | "workspace_not_found";

export class EscalationError extends Error {
  constructor(
    public readonly code: EscalationErrorCode,
    message: string,
  ) {
    super(message);
  }
}
