import { describe, expect, it } from "vitest";

import {
  getWorkspacePermissions,
  hasWorkspacePermission,
  legacyRoleToRoleKeys,
  normalizeWorkspaceRoleKeys,
  primaryLegacyRoleForRoleKeys,
} from "./workspace-permissions";

describe("workspace permissions", () => {
  it("calculates permissions as an additive union across multiple roles", () => {
    const permissions = getWorkspacePermissions([
      "incident_responder",
      "on_call_participant",
      "notification_recipient",
    ]);

    expect(permissions.has("incident.respond")).toBe(true);
    expect(permissions.has("on_call.participate")).toBe(true);
    expect(permissions.has("notification.receive")).toBe(true);
    expect(permissions.has("service.manage")).toBe(false);
  });

  it("keeps domain manager permissions isolated", () => {
    expect(hasWorkspacePermission(["service_manager"], "service.manage")).toBe(true);
    expect(hasWorkspacePermission(["service_manager"], "webhook.manage")).toBe(true);
    expect(hasWorkspacePermission(["service_manager"], "incident.respond")).toBe(false);
    expect(hasWorkspacePermission(["escalation_manager"], "escalation.manage")).toBe(true);
    expect(hasWorkspacePermission(["escalation_manager"], "on_call.manage")).toBe(false);
  });

  it("maps legacy roles into v1 preset role keys", () => {
    expect(legacyRoleToRoleKeys("owner")).toEqual(["project_owner"]);
    expect(legacyRoleToRoleKeys("admin")).toEqual(["project_admin"]);
    expect(legacyRoleToRoleKeys("responder")).toEqual(["incident_responder", "notification_recipient"]);
    expect(legacyRoleToRoleKeys("viewer")).toEqual(["project_viewer"]);
  });

  it("derives a deprecated primary legacy role from new role keys", () => {
    expect(primaryLegacyRoleForRoleKeys(["project_owner", "service_manager"])).toBe("owner");
    expect(primaryLegacyRoleForRoleKeys(["project_admin", "incident_responder"])).toBe("admin");
    expect(primaryLegacyRoleForRoleKeys(["incident_responder", "notification_recipient"])).toBe("responder");
    expect(primaryLegacyRoleForRoleKeys(["service_manager", "notification_recipient"])).toBe("viewer");
  });

  it("falls back to legacy role mapping when no valid role keys are provided", () => {
    expect(normalizeWorkspaceRoleKeys([], "responder")).toEqual(["incident_responder", "notification_recipient"]);
    expect(normalizeWorkspaceRoleKeys(["unknown"], "viewer")).toEqual(["project_viewer"]);
  });
});
