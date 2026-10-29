import { describe, expect, it } from "vitest";

import { displayLabel } from "./admin-display";

describe("displayLabel", () => {
  it.each([
    ["on_call_schedules", "On-call schedules"],
    ["escalation_policies", "Escalation policies"],
    ["healthy", "Within limit"],
    ["near_limit", "Near limit"],
    ["exceeded", "Limit reached"],
    ["unlimited", "Unlimited"],
    ["dead_letter", "Delivery stopped"],
    ["sent_after_ack", "Sent after acknowledgment"],
    ["user", "Account"],
    ["worker_run", "Worker run"],
    ["platform_admin", "Platform administrator"],
    ["oidc", "OpenID Connect"],
    ["sms", "SMS"],
  ])("labels the operational code %s as %s", (value, expected) => {
    expect(displayLabel(value)).toBe(expected);
  });

  it("describes administrative actions without internal namespace prefixes", () => {
    expect(displayLabel("platform.workspace_member_roles_updated")).toBe("Member permissions changed");
    expect(displayLabel("platform.workspace_quota_override_removed")).toBe("Temporary quota removed");
  });

  it("makes unknown codes readable without dropping their words", () => {
    expect(displayLabel("future.resource_update-requested")).toBe("Future resource update requested");
    expect(displayLabel("running")).toBe("Running");
    expect(displayLabel("P1")).toBe("P1");
  });

  it("does not treat inherited object properties as registered labels", () => {
    expect(displayLabel("constructor")).toBe("Constructor");
    expect(displayLabel("toString")).toBe("ToString");
  });

  it("handles missing and separator-only values without inventing a status", () => {
    expect(displayLabel("")).toBe("");
    expect(displayLabel("__.-")).toBe("");
  });
});
