import { z } from "zod";
import { hasWorkspacePermission, OnCallService, WorkspaceError, WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import { type CopilotAskRequest, type CopilotQueryReceipt, type CopilotSource } from "@im/contracts";
import { HttpError } from "../http/errors/http-error";

const workspaces = new WorkspaceService(prisma);
const onCall = new OnCallService(prisma);
const argsSchema = z.object({ at: z.string().datetime({ offset: true }).optional(), timezone: z.string().max(80).optional() }).strict();
export const auditTool = { type: "function", name: "inspect_project_settings",
  description: "Server-computed, read-only project-wide configuration gap audit: services without policies, policy target responders, on-call coverage and permitted provider/channel readiness. No delivery test or changes.",
  parameters: { type: "object", properties: {
    at: { type: "string", description: "Optional ISO time with numeric offset; omit for now." },
    timezone: { type: "string", description: "Optional IANA display timezone; defaults to UTC." },
  }, required: [], additionalProperties: false } };

type Finding = { code: string; level: "missing" | "check"; resource: string; name: string; detail: string; path: string };
function denied(error: unknown): never {
  if (error instanceof WorkspaceError && ["workspace_access_forbidden", "workspace_member_not_found", "workspace_permission_required", "workspace_admin_required"].includes(error.code))
    throw new HttpError(403, "copilot_audit_forbidden", "Project service, policy and on-call read permissions are required for this audit.");
  throw error;
}

export async function inspectProjectSettings(args: unknown, request: CopilotAskRequest, actor: string) {
  if (!request.workspace_id) throw new HttpError(400, "copilot_project_required", "Select a project first.");
  const parsed = argsSchema.safeParse(args);
  if (!parsed.success) throw new HttpError(400, "copilot_invalid_audit", "Use an ISO time with offset and a valid timezone.");
  const workspaceId = request.workspace_id;
  const now = new Date();
  const at = parsed.data.at ? new Date(parsed.data.at) : now;
  const timezone = parsed.data.timezone ?? "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(at); }
  catch { throw new HttpError(400, "copilot_invalid_timezone", "Use a valid IANA timezone."); }
  try {
    await workspaces.assertMember(workspaceId, actor);
    for (const permission of ["service.read", "escalation.read", "on_call.read"] as const)
      await workspaces.assertWorkspacePermission(workspaceId, actor, permission);
  } catch (error) { denied(error); }
  const roles = await workspaces.listMemberRoleKeys(workspaceId, actor);
  const canInspectChannels = hasWorkspacePermission(roles, "notification.manage");

  const [services, policies, schedules, memberships, teams] = await Promise.all([
    prisma.service.findMany({ where: { workspaceId }, orderBy: { id: "asc" }, take: 201,
      select: { id: true, name: true, escalationPolicyId: true } }),
    prisma.escalationPolicy.findMany({ where: { workspaceId }, orderBy: { id: "asc" }, take: 201,
      select: { id: true, name: true, steps: { orderBy: { stepOrder: "asc" }, take: 201,
        select: { id: true, stepOrder: true, targetType: true, targetId: true } } } }),
    prisma.onCallSchedule.findMany({ where: { workspaceId }, orderBy: { id: "asc" }, take: 201,
      select: { id: true, name: true, rotations: { take: 201, orderBy: { createdAt: "asc" }, select: { layer: true, startsAt: true,
        participants: { take: 201, select: { userId: true } } } } } }),
    prisma.workspaceMember.findMany({ where: { workspaceId }, take: 201, select: { userId: true } }),
    prisma.team.findMany({ where: { workspaceId }, take: 201, select: { id: true,
      members: { take: 201, select: { userId: true } } } }),
  ]);
  if ([services, policies, schedules, memberships, teams].some((rows) => rows.length > 200)
    || policies.some((policy) => policy.steps.length > 200)
    || schedules.some((schedule) => schedule.rotations.length > 200 || schedule.rotations.some((rotation) => rotation.participants.length > 200))
    || teams.some((team) => team.members.length > 200))
    throw new HttpError(413, "copilot_audit_too_large", "Project settings exceed the audit limit. No completeness claim can be made.");

  const findings: Finding[] = [];
  const add = (code: string, level: Finding["level"], resource: string, name: string, detail: string, path: string) => {
    if (findings.length >= 40) throw new HttpError(413, "copilot_audit_too_many_findings", "Audit findings exceed the response limit. No completeness claim can be made.");
    findings.push({ code, level, resource, name: name.slice(0, 200), detail, path });
  };
  const members = new Set(memberships.map((entry) => entry.userId));
  const policyById = new Map(policies.map((policy) => [policy.id, policy]));
  const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const affectedUsers = new Set<string>();

  async function responder(scheduleId: string, layer: "primary" | "secondary") {
    const override = await prisma.onCallOverride.findFirst({ where: { scheduleId, layer, startsAt: { lte: at }, endsAt: { gt: at } },
      orderBy: { createdAt: "desc" }, select: { userId: true } });
    if (override) return members.has(override.userId) ? override.userId : null;
    const schedule = scheduleById.get(scheduleId);
    const rotation = schedule?.rotations.find((entry) => entry.layer === layer);
    if (!rotation || rotation.startsAt > at || rotation.participants.length === 0) return null;
    const userId = await onCall.resolveScheduleLayerUserIdInTransaction(prisma, scheduleId, layer, at);
    return userId && members.has(userId) ? userId : null;
  }

  for (const service of services) {
    if (!service.escalationPolicyId) add("service_without_policy", "missing", "service", service.name,
      "No escalation policy is connected; incidents on this service have no configured policy route.", `/services/${service.id}`);
    else if (!policyById.has(service.escalationPolicyId)) add("service_policy_unavailable", "missing", "service", service.name,
      "The connected policy is unavailable in this project.", `/services/${service.id}`);
  }
  for (const policy of policies) {
    if (!policy.steps.length) add("policy_without_steps", "missing", "policy", policy.name,
      "No escalation steps are configured.", "/escalation-policies");
    for (const step of policy.steps) {
      const detailName = `${policy.name} / step ${step.stepOrder}`;
      if (step.targetType === "user") {
        if (!step.targetId || !members.has(step.targetId)) add("policy_user_unavailable", "missing", "policy", detailName,
          "The user target is not a project member.", "/escalation-policies");
        else affectedUsers.add(step.targetId);
      } else if (step.targetType === "team") {
        const team = step.targetId ? teamById.get(step.targetId) : null;
        const users = team?.members.filter((entry) => members.has(entry.userId)) ?? [];
        if (!users.length) add("policy_team_empty", "missing", "policy", detailName,
          "The team target has no current project members.", "/escalation-policies");
        else users.forEach((entry) => affectedUsers.add(entry.userId));
      } else if (step.targetType === "primary_on_call" || step.targetType === "secondary_on_call") {
        const schedule = step.targetId ? scheduleById.get(step.targetId) : null;
        const layer = step.targetType === "primary_on_call" ? "primary" : "secondary";
        if (!schedule) add("policy_schedule_unavailable", "missing", "policy", detailName,
          "The on-call schedule target is unavailable in this project.", "/escalation-policies");
        else {
          const userId = await responder(schedule.id, layer);
          if (!userId) add("on_call_coverage_gap", "missing", "schedule", `${schedule.name} / ${layer}`,
            "No eligible project member covers this layer at the inspected time; check rotation participants and active overrides.", "/on-call");
          else affectedUsers.add(userId);
        }
      } else add("external_target_unverified", "check", "policy", detailName,
        "External channel/webhook target exists; this audit does not inspect its address or delivery readiness.", "/escalation-policies");
    }
  }
  for (const schedule of schedules) {
    if (!schedule.rotations.length) add("schedule_without_rotation", "missing", "schedule", schedule.name,
      "No rotation is configured; a temporary override alone does not provide continuing coverage.", "/on-call");
    for (const layer of ["primary", "secondary"] as const) {
      // Only configured layers are expected; a primary-only schedule is valid.
      if (!schedule.rotations.some((entry) => entry.layer === layer)) continue;
      if (!await responder(schedule.id, layer) && !findings.some((item) => item.code === "on_call_coverage_gap" && item.name === `${schedule.name} / ${layer}`))
        add("on_call_coverage_gap", "missing", "schedule", `${schedule.name} / ${layer}`,
          "No eligible project member covers this configured layer at the inspected time.", "/on-call");
    }
  }

  let providerCheck: { status: "checked" | "not_permitted"; providers?: Array<{ provider: string; ready: boolean }> } = { status: "not_permitted" };
  if (canInspectChannels) {
    const settings = await workspaces.listNotificationProviderSettings(workspaceId, actor);
    const providers = settings.map((setting) => ({ provider: setting.provider, ready: setting.enabled && setting.configured }));
    providerCheck = { status: "checked", providers };
    if (services.length && !providers.some((entry) => entry.ready)) add("no_ready_provider", "missing", "project", "Notification providers",
      "No enabled provider has the required saved configuration. This is not a live connectivity test.", "/project-settings");
    if (affectedUsers.size) {
      const ids = [...affectedUsers];
      const [preferences, contacts] = await Promise.all([
        prisma.userNotificationPreference.findMany({ where: { userId: { in: ids } }, select: { userId: true, channel: true, enabled: true } }),
        prisma.userNotificationContact.findMany({ where: { userId: { in: ids } }, select: { userId: true, type: true, verifiedAt: true } }),
      ]);
      for (const id of ids) {
        const active = preferences.filter((entry) => entry.userId === id && entry.enabled);
        const contact = (type: string, verified = false) => contacts.some((entry) => entry.userId === id && entry.type === type && (!verified || Boolean(entry.verifiedAt)));
        const viable = active.some((entry) => {
          const provider = entry.channel === "sms" || entry.channel === "phone" ? "twilio" : entry.channel;
          if (!providers.some((candidate) => candidate.provider === provider && candidate.ready)) return false;
          if (entry.channel === "slack") return contact("slack_webhook");
          if (entry.channel === "sms") return contact("phone_sms", true);
          if (entry.channel === "phone") return contact("phone_voice", true);
          return entry.channel === "email";
        });
        if (!viable) add("responder_channel_unready", "check", "member", id,
          "No enabled user preference currently matches a saved provider and required contact. Contact values and credentials were not inspected.", "/project-settings?tab=members");
      }
    }
  }
  const sources: CopilotSource[] = findings.slice(0, 24).map((item) => ({ path: item.path, title: item.name, snippet: `${item.code}: ${item.detail}` }));
  const receipt: CopilotQueryReceipt = { operation: "inspect_project_settings", queried_at: now.toISOString(), at: at.toISOString(),
    timezone, local_time: new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, dateStyle: "short", timeStyle: "long" }).format(at),
    scope: `project:${workspaceId}; services:${services.length}; policies:${policies.length}; schedules:${schedules.length}; members:${members.size}; provider_check:${providerCheck.status}; evidence_links:${sources.length}/${findings.length}`,
    returned_count: findings.length, has_more: false, delivery_verified: false };
  return { data: { status: findings.length ? "findings" : canInspectChannels ? "no_observed_gaps" : "incomplete", findings, provider_check: providerCheck,
    inspected_at: at.toISOString(), limitation: "This is a bounded snapshot of saved configuration, not a delivery test. Intentionally inactive routes may be valid. User channel readiness is not inspected without notification.manage permission." },
    receipt, sources };
}
