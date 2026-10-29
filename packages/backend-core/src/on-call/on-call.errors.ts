export type OnCallErrorCode =
  | "invalid_override_window"
  | "invalid_preview_window"
  | "invalid_rotation_cadence"
  | "invalid_timezone"
  | "on_call_participant_role_required"
  | "on_call_schedule_in_use"
  | "on_call_schedule_not_found"
  | "service_not_found"
  | "team_not_found"
  | "user_not_found"
  | "workspace_member_not_found"
  | "workspace_mismatch"
  | "workspace_not_found";

export class OnCallError extends Error {
  constructor(
    public readonly code: OnCallErrorCode,
    message: string,
  ) {
    super(message);
  }
}
