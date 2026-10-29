import type { WorkspacePermission, WorkspaceRoleKey } from "@im/contracts";

export const workspaceRoleGroups = [
  {
    label: "Project roles",
    roles: ["project_owner", "project_admin", "project_viewer"],
  },
  {
    label: "Incident roles",
    roles: ["incident_viewer", "incident_responder", "incident_manager", "incident_admin"],
  },
  {
    label: "Service roles",
    roles: ["service_viewer", "service_manager", "service_admin"],
  },
  {
    label: "On-call roles",
    roles: ["on_call_viewer", "on_call_participant", "on_call_manager", "on_call_admin"],
  },
  {
    label: "Escalation roles",
    roles: ["escalation_viewer", "escalation_manager", "escalation_admin"],
  },
  {
    label: "Notification roles",
    roles: ["notification_recipient", "notification_manager"],
  },
] as const satisfies readonly {
  label: string;
  roles: readonly WorkspaceRoleKey[];
}[];

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

const rolePermissions: Record<WorkspaceRoleKey, readonly WorkspacePermission[]> = {
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
  project_viewer: ["project.read", "incident.read", "service.read", "on_call.read", "escalation.read"],
  service_admin: ["service.read", "service.manage", "webhook.manage"],
  service_manager: ["service.read", "service.manage", "webhook.manage"],
  service_viewer: ["service.read"],
};

export function hasWorkspacePermission(
  roles: readonly WorkspaceRoleKey[] | undefined,
  permission: WorkspacePermission,
) {
  return getWorkspacePermissions(roles).has(permission);
}

export function getWorkspacePermissions(roles: readonly WorkspaceRoleKey[] | undefined) {
  const permissions = new Set<WorkspacePermission>();

  for (const role of roles ?? []) {
    for (const permission of rolePermissions[role] ?? []) {
      permissions.add(permission);
    }
  }

  return permissions;
}

export function formatWorkspaceRoleKey(role: WorkspaceRoleKey) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
