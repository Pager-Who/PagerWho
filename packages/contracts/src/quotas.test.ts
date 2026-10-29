import { describe, expect, it } from "vitest";

import {
  InstallationLimitsSchema,
  UpdateWorkspaceQuotaOverrideRequestSchema,
  WorkspaceUsageSchema,
} from "./quotas";

describe("quota contracts", () => {
  it("accepts a complete workspace usage response", () => {
    const parsed = WorkspaceUsageSchema.parse({
      workspace_id: "11111111-1111-4111-8111-111111111111",
      quota_settings: { updated_at: null, updated_by_user_id: null, quota_overrides: [] },
      exceeded: { workspaces: false, members: false, services: false, on_call_schedules: false, escalation_policies: false },
      limits: { workspaces: null, members: 20, services: 10, on_call_schedules: null, escalation_policies: null, retention_days: 365 },
      usage: { workspaces: 1, members: 3, active_members: 2, pending_invites: 1, services: 4, on_call_schedules: 1, escalation_policies: 2 },
    });

    expect(parsed.usage.members).toBe(3);
  });

  it("rejects zero retention and non-positive finite limits", () => {
    expect(InstallationLimitsSchema.safeParse({
      workspaces: null, members: 0, services: null, on_call_schedules: null, escalation_policies: null, retention_days: 0,
    }).success).toBe(false);
  });

  it("requires an expiry when setting an override but allows clearing one", () => {
    expect(UpdateWorkspaceQuotaOverrideRequestSchema.safeParse({ resource: "services", limit: 5, expires_at: null }).success).toBe(false);
    expect(UpdateWorkspaceQuotaOverrideRequestSchema.safeParse({ resource: "services", limit: null, expires_at: null }).success).toBe(true);
    expect(UpdateWorkspaceQuotaOverrideRequestSchema.safeParse({ resource: "workspaces", limit: null, expires_at: null }).success).toBe(false);
  });
});
