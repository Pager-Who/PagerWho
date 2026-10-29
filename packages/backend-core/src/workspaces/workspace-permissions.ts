import type { WorkspacePermission, WorkspaceRole, WorkspaceRoleKey } from "@im/contracts";

export const workspaceRoleKeys = [
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
] as const satisfies readonly WorkspaceRoleKey[];

const allPermissions = [
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
] as const satisfies readonly WorkspacePermission[];

export const workspaceRolePermissions: Record<WorkspaceRoleKey, readonly WorkspacePermission[]> = {
  escalation_admin: ["escalation.read", "escalation.manage"],
  escalation_manager: ["escalation.read", "escalation.manage"],
  escalation_viewer: ["escalation.read"],
  incident_admin: ["incident.read", "incident.respond", "incident.create"],
  incident_manager: ["incident.read", "incident.respond", "incident.create"],
  incident_responder: ["incident.read", "incident.respond"],
  incident_viewer: ["incident.read"],
  notification_manager: ["notification.receive", "notification.manage"],
  notification_recipient: ["notification.receive"],
  on_call_admin: ["on_call.read", "on_call.participate", "on_call.manage"],
  on_call_manager: ["on_call.read", "on_call.manage"],
  on_call_participant: ["on_call.read", "on_call.participate"],
  on_call_viewer: ["on_call.read"],
  project_admin: allPermissions,
  project_owner: allPermissions,
  project_viewer: [
    "project.read",
    "incident.read",
    "service.read",
    "on_call.read",
    "escalation.read",
  ],
  service_admin: ["service.read", "service.manage", "webhook.manage"],
  service_manager: ["service.read", "service.manage", "webhook.manage"],
  service_viewer: ["service.read"],
};

export function getWorkspacePermissions(roleKeys: readonly WorkspaceRoleKey[]): Set<WorkspacePermission> {
  const permissions = new Set<WorkspacePermission>();

  for (const roleKey of roleKeys) {
    for (const permission of workspaceRolePermissions[roleKey] ?? []) {
      permissions.add(permission);
    }
  }

  return permissions;
}

export function hasWorkspacePermission(
  roleKeys: readonly WorkspaceRoleKey[],
  permission: WorkspacePermission,
) {
  return getWorkspacePermissions(roleKeys).has(permission);
}

export function legacyRoleToRoleKeys(role: WorkspaceRole): WorkspaceRoleKey[] {
  switch (role) {
    case "owner":
      return ["project_owner"];
    case "admin":
      return ["project_admin"];
    case "responder":
      return ["incident_responder", "notification_recipient"];
    case "viewer":
    default:
      return ["project_viewer"];
  }
}

export function primaryLegacyRoleForRoleKeys(roleKeys: readonly WorkspaceRoleKey[]): WorkspaceRole {
  if (roleKeys.includes("project_owner")) {
    return "owner";
  }

  if (roleKeys.includes("project_admin")) {
    return "admin";
  }

  if (
    roleKeys.includes("incident_responder")
    || roleKeys.includes("incident_manager")
    || roleKeys.includes("incident_admin")
  ) {
    return "responder";
  }

  return "viewer";
}

export function normalizeWorkspaceRoleKeys(
  roleKeys: readonly string[] | undefined,
  fallbackRole: WorkspaceRole = "responder",
): WorkspaceRoleKey[] {
  const normalized = [...new Set((roleKeys ?? []).filter(isWorkspaceRoleKey))];

  return normalized.length > 0 ? normalized : legacyRoleToRoleKeys(fallbackRole);
}

export function isWorkspaceRoleKey(value: string): value is WorkspaceRoleKey {
  return (workspaceRoleKeys as readonly string[]).includes(value);
}
