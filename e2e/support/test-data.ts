export const e2eNow = "2026-06-16T00:00:00.000Z";
export const e2eUserId = "00000000-0000-4000-8000-000000000001";
export const e2eOwnerUserId = "00000000-0000-4000-8000-000000000002";
export const e2eSecondaryUserId = "00000000-0000-4000-8000-000000000003";
export const e2eWorkspaceId = "00000000-0000-4000-8000-000000000101";
export const e2eInviteId = "00000000-0000-4000-8000-000000000201";
export const e2eServiceId = "00000000-0000-4000-8000-000000000301";
export const e2eIncidentId = "00000000-0000-4000-8000-000000000401";
export const e2eEscalationPolicyId = "00000000-0000-4000-8000-000000000501";
export const e2eWebhookEndpointId = "00000000-0000-4000-8000-000000000601";
export const e2eWebhookEventId = "00000000-0000-4000-8000-000000000701";
export const e2eOnCallScheduleId = "00000000-0000-4000-8000-000000000901";
export const e2eOnCallPrimaryRotationId = "00000000-0000-4000-8000-000000000902";
export const e2eOnCallSecondaryRotationId = "00000000-0000-4000-8000-000000000903";
export const e2eOnCallOverrideId = "00000000-0000-4000-8000-000000000904";
export const e2eEscalationPolicyStepOneId = "00000000-0000-4000-8000-000000001001";
export const e2eEscalationPolicyStepTwoId = "00000000-0000-4000-8000-000000001002";

export const e2eInvitedWorkspace = {
  id: e2eWorkspaceId,
  name: "Core Platform",
  slug: "core-platform",
  role: "responder",
  roles: [
    "project_admin",
    "incident_manager",
    "service_manager",
    "on_call_manager",
    "escalation_manager",
    "notification_manager",
  ],
  created_by_user_id: e2eOwnerUserId,
  created_at: e2eNow,
  updated_at: e2eNow,
};

export const e2eActiveWorkspace = {
  ...e2eInvitedWorkspace,
  role: "responder",
};

export const e2eService = {
  id: e2eServiceId,
  workspace_id: e2eWorkspaceId,
  name: "Checkout API",
  description: "Checkout request path and payment handoff.",
  team_id: null,
  escalation_policy_id: e2eEscalationPolicyId,
  status: "normal",
  open_incident_count: 0,
  created_at: e2eNow,
  updated_at: e2eNow,
};

export const e2ePendingInvite = {
  id: e2eInviteId,
  workspace_id: e2eWorkspaceId,
  workspace_name: "Core Platform",
  invited_user_id: e2eUserId,
  invited_user_email: "responder@example.com",
  invited_by_user_id: e2eOwnerUserId,
  role: "responder",
  status: "pending",
  accepted_at: null,
  declined_at: null,
  revoked_at: null,
  expires_at: "2026-06-30T00:00:00.000Z",
  created_at: e2eNow,
  updated_at: e2eNow,
};
