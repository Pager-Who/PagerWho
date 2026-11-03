import { z } from "zod";
import { OnCallService, WorkspaceError, WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import { UuidSchema, type CopilotAskRequest, type CopilotAskResponse, type CopilotQueryReceipt, type CopilotSource, type WorkspacePermission } from "@im/contracts";
import { HttpError } from "../http/errors/http-error";

const workspaceService = new WorkspaceService(prisma);
const onCallService = new OnCallService(prisma);
const kinds = ["service", "schedule", "policy", "member"] as const;
type Kind = typeof kinds[number];
const selector = { id: UuidSchema.optional(), name: z.string().trim().min(1).max(200).optional() };
const time = { at: z.string().datetime({ offset: true }).optional(), timezone: z.string().max(80).optional() };
const paging = { cursor: z.string().min(1).max(500).optional(), limit: z.number().int().min(1).max(20).default(10) };
const schemas = {
  find_project_resources: z.object({ kind: z.enum(kinds), query: z.string().trim().max(200).optional(), ...paging }).strict(),
  list_project_incidents: z.object({ service_id: UuidSchema.optional(), service_name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["open", "triggered", "acknowledged", "resolved", "all"]).default("open"),
    severity: z.enum(["critical", "high", "medium", "low"]).optional(),
    since: z.string().datetime({ offset: true }).optional(), until: z.string().datetime({ offset: true }).optional(), ...paging }).strict(),
  get_project_resource: z.object({ kind: z.enum(kinds), ...selector, ...time }).strict(),
  get_project_on_call: z.object({ ...selector, ...time }).strict(),
  get_service_routing: z.object({ ...selector, ...time }).strict(),
};
export type QueryToolName = keyof typeof schemas;
export function isQueryTool(name: string): name is QueryToolName { return Object.hasOwn(schemas, name); }
const str = { type: "string" };
const pageProperties = { cursor: { ...str, description: "Opaque next_cursor from the previous result; never invent one." }, limit: { type: "integer", minimum: 1, maximum: 20 } };
const selectProperties = { id: { ...str, description: "Exact project resource ID selected by the user or returned by a lookup." }, name: { ...str, description: "Literal resource name. Prefer a name over guessing an ID." } };
const timeProperties = { at: { ...str, description: "Optional ISO datetime with explicit offset. Omit for NOW; server calculates it. Ask for clarification for ambiguous local dates/times." }, timezone: { ...str, description: "Optional IANA display timezone. Schedule queries default to the schedule timezone; others to UTC." } };
export const queryTools = [
  { name: "find_project_resources", description: "Search/list project services, policies, schedules or members. Paginated; use get_project_resource for details.", properties: { kind: { enum: kinds }, query: str, ...pageProperties }, required: ["kind"] },
  { name: "list_project_incidents", description: "Read project incidents, optionally by service, status, severity and date range. Defaults to open (triggered or acknowledged). Paginated.", properties: { service_id: str, service_name: str, status: { enum: ["open", "triggered", "acknowledged", "resolved", "all"] }, severity: { enum: ["critical", "high", "medium", "low"] }, since: str, until: str, ...pageProperties }, required: [] },
  { name: "get_project_resource", description: "Read details of one service, policy, schedule or member. Server asks for selection if a name is ambiguous.", properties: { kind: { enum: kinds }, ...selectProperties, ...timeProperties }, required: ["kind"] },
  { name: "get_project_on_call", description: "Calculate primary and secondary on-call for one SCHEDULE, including active overrides. Supply its id or name; omit at for now. No notification is sent.", properties: { ...selectProperties, ...timeProperties }, required: [] },
  { name: "get_service_routing", description: "Read a SERVICE's policy, ordered steps, and server-resolved configured recipients at the requested time. Not delivery verification. For service-specific on-call use this tool.", properties: { ...selectProperties, ...timeProperties }, required: [] },
].map(({ name, description, properties, required }) => ({ type: "function", name, description,
  parameters: { type: "object", properties, required, additionalProperties: false } }));

type Named = { id: string; name: string };
type QueryResult = { data: unknown; receipt: CopilotQueryReceipt; sources: CopilotSource[] };
class SelectionRequired extends Error {
  constructor(readonly response: CopilotAskResponse) { super("Select a project resource"); }
}
const paths: Record<Kind, string> = { service: "/services", schedule: "/on-call", policy: "/escalation-policies", member: "/project-settings?tab=members" };
const permissions: Record<Kind, WorkspacePermission> = { service: "service.read", schedule: "on_call.read", policy: "escalation.read", member: "project.read" };
function rethrowAccess(error: unknown): never {
  if (error instanceof WorkspaceError && ["workspace_access_forbidden", "workspace_admin_required", "workspace_permission_required"].includes(error.code))
    throw new HttpError(403, "copilot_query_forbidden", "You do not have permission to read this project resource.");
  if (error instanceof WorkspaceError && error.code === "workspace_member_not_found")
    throw new HttpError(403, "copilot_query_forbidden", "You do not have permission to read this project resource.");
  throw error;
}
async function authorize(workspaceId: string, actor: string, permission?: WorkspacePermission) {
  try {
    if (permission) await workspaceService.assertWorkspacePermission(workspaceId, actor, permission);
    else await workspaceService.assertMember(workspaceId, actor);
  } catch (error) { rethrowAccess(error); }
}
function source(kind: Kind, row: Named, snippet = row.name): CopilotSource {
  return { path: kind === "service" ? `/services/${row.id}` : paths[kind], title: row.name.slice(0, 200), snippet: snippet.slice(0, 600) };
}
const cursorSchema = z.object({ id: UuidSchema, created_at: z.string().datetime().optional() }).strict();
function decodeCursor(value?: string) {
  if (!value) return undefined;
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
  catch { throw new HttpError(400, "copilot_invalid_cursor", "Invalid query cursor. Start the query again."); }
}
function encodeCursor(id: string, createdAt?: Date) {
  return Buffer.from(JSON.stringify({ id, ...(createdAt ? { created_at: createdAt.toISOString() } : {}) })).toString("base64url");
}

// Only minimal names/IDs are returned here. Every query includes the authenticated project scope.
async function namedRows(kind: Kind, workspaceId: string, filter: { id?: string; name?: string; query?: string; after?: string }, take: number): Promise<Named[]> {
  const where = { ...(filter.id ? { id: filter.id } : {}), ...(filter.name ? { name: { equals: filter.name, mode: "insensitive" as const } } : {}),
    ...(filter.query ? { name: { contains: filter.query, mode: "insensitive" as const } } : {}), ...(filter.after ? { id: { gt: filter.after } } : {}) };
  if (kind === "service") return prisma.service.findMany({ where: { workspaceId, ...where }, orderBy: { id: "asc" }, take, select: { id: true, name: true } });
  if (kind === "schedule") return prisma.onCallSchedule.findMany({ where: { workspaceId, ...where }, orderBy: { id: "asc" }, take, select: { id: true, name: true } });
  if (kind === "policy") return prisma.escalationPolicy.findMany({ where: { workspaceId, ...where }, orderBy: { id: "asc" }, take, select: { id: true, name: true } });
  const rows = await prisma.workspaceMember.findMany({ where: { workspaceId, user: where }, orderBy: { userId: "asc" }, take, select: { user: { select: { id: true, name: true } } } });
  return rows.map((row) => row.user);
}

async function selectResource(kind: Kind, workspaceId: string, request: CopilotAskRequest, selection: { id?: string | undefined; name?: string | undefined }) {
  let rows = await namedRows(kind, workspaceId, selection.id ? { id: selection.id } : selection.name ? { name: selection.name } : {}, 21);
  if (!rows.length) throw new HttpError(404, "copilot_resource_not_found", "No matching resource in this project. Check the name or ID.");
  const text = [...(request.history ?? []).filter((message) => message.role === "user").map((message) => message.content), request.question].join("\n");
  const field = `lookup_${kind}`;
  const explicitId = request.structured_input?.values[field];
  if (selection.id && !text.includes(selection.id) && explicitId !== selection.id) {
    // A model-selected ID cannot bypass duplicate-name disambiguation.
    rows = await namedRows(kind, workspaceId, { name: rows[0]!.name }, 21);
  }
  if (selection.id && selection.name && rows.some((row) => row.name.toLowerCase() !== selection.name!.toLowerCase())) {
    throw new HttpError(400, "copilot_resource_mismatch", "The resource name and ID do not match.");
  }
  if (explicitId) {
    const selected = rows.find((row) => row.id === explicitId);
    if (selected) return selected;
  }
  if (selection.id && text.includes(selection.id)) return rows.find((row) => row.id === selection.id)!;
  if (rows.length === 1 && (selection.id || selection.name)) return rows[0]!;
  const locale = request.locale ?? "en";
  const answer = locale === "ko" ? "조회할 대상을 선택해 주세요. 같은 이름이 있으면 ID를 확인해 주세요."
    : locale === "zh-CN" ? "请选择要查询的对象。同名对象请核对 ID。" : "Select the resource to query. Check the ID when names are duplicated.";
  throw new SelectionRequired({ answer: rows.length > 20 ? `${answer} (${locale === "ko" ? "이름으로 검색해 범위를 좁혀 주세요" : locale === "zh-CN" ? "请按名称缩小搜索范围" : "Refine the search by name"})` : answer,
    kind: "clarification", mode: "direct", sources: [], clarification: { reason: "ambiguous_query_resource", fields: [{ id: field,
      label: locale === "ko" ? "조회 대상" : locale === "zh-CN" ? "查询对象" : "Resource", input_type: "select", required: true,
      options: rows.slice(0, 20).map((row) => ({ label: `${row.name} (${row.id})`, value: row.id })) }] } });
}

async function member(workspaceId: string, id: string | null) {
  if (!id || !UuidSchema.safeParse(id).success) return null;
  const row = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: id }, select: { user: { select: { id: true, name: true } } } });
  return row?.user ?? null;
}

async function scheduleAt(workspaceId: string, id: string, at: Date) {
  const schedule = await prisma.onCallSchedule.findFirst({ where: { workspaceId, id }, select: { id: true, name: true, timezone: true } });
  if (!schedule) return { schedule: null, primary: null, secondary: null };
  const resolve = async (layer: "primary" | "secondary") => {
    // Use the same override and rotation calculation as the application, without allowing pre-start coverage.
    const override = await prisma.onCallOverride.findFirst({ where: { scheduleId: id, layer, startsAt: { lte: at }, endsAt: { gt: at } }, orderBy: { createdAt: "desc" }, select: { userId: true } });
    const rotation = override ? null : await prisma.onCallRotation.findFirst({ where: { scheduleId: id, layer }, orderBy: { createdAt: "asc" }, select: { startsAt: true } });
    if (!override && (!rotation || rotation.startsAt > at)) return null;
    const userId = override?.userId ?? await onCallService.resolveScheduleLayerUserIdInTransaction(prisma, id, layer, at);
    return member(workspaceId, userId);
  };
  const [primary, secondary] = await Promise.all([resolve("primary"), resolve("secondary")]);
  return { schedule, primary, secondary };
}

async function policyAt(workspaceId: string, id: string, at: Date, actor: string, sources: CopilotSource[]) {
  const policy = await prisma.escalationPolicy.findFirst({ where: { workspaceId, id }, select: { id: true, name: true, repeatEnabled: true, repeatIntervalSeconds: true, repeatLimit: true,
    steps: { orderBy: { stepOrder: "asc" }, take: 51, select: { id: true, stepOrder: true, delaySeconds: true, targetType: true, targetId: true } } } });
  if (!policy) return null;
  sources.push(source("policy", policy));
  const steps = [];
  for (const step of policy.steps.slice(0, 50)) {
    let recipients: Named[] = [];
    let target: Named | null = null;
    let resolution = "no_responder";
    let hasMore = false;
    if (step.targetType === "user") {
      const user = await member(workspaceId, step.targetId); target = user;
      if (user) { recipients = [user]; resolution = "configured_user"; }
    } else if (step.targetType === "team" && step.targetId && UuidSchema.safeParse(step.targetId).success) {
      const team = await prisma.team.findFirst({ where: { id: step.targetId, workspaceId }, select: { id: true, name: true,
        members: { take: 21, orderBy: { userId: "asc" }, where: { user: { workspaceMemberships: { some: { workspaceId } } } }, select: { user: { select: { id: true, name: true } } } } } });
      if (team) { target = { id: team.id, name: team.name }; recipients = team.members.slice(0, 20).map((entry) => entry.user); hasMore = team.members.length > 20; resolution = "configured_team_members"; }
    } else if ((step.targetType === "primary_on_call" || step.targetType === "secondary_on_call") && step.targetId && UuidSchema.safeParse(step.targetId).success) {
      await authorize(workspaceId, actor, "on_call.read");
      const current = await scheduleAt(workspaceId, step.targetId, at);
      target = current.schedule;
      const user = step.targetType === "primary_on_call" ? current.primary : current.secondary;
      if (user) { recipients = [user]; resolution = "calculated_on_call"; }
      if (current.schedule) sources.push(source("schedule", current.schedule));
    } else if (!["user", "team", "primary_on_call", "secondary_on_call"].includes(step.targetType)) resolution = "external_target_not_inspected";
    steps.push({ id: step.id, order: step.stepOrder, delay_seconds: step.delaySeconds, target_type: step.targetType,
      target, recipients, resolution, has_more_recipients: hasMore });
  }
  return { id: policy.id, name: policy.name, repeat_enabled: policy.repeatEnabled,
    repeat_interval_seconds: policy.repeatIntervalSeconds, repeat_limit: policy.repeatLimit, steps, has_more_steps: policy.steps.length > 50 };
}

export async function executeProjectQuery(name: QueryToolName, args: unknown, request: CopilotAskRequest, actor: string): Promise<QueryResult | { clarification: CopilotAskResponse }> {
  if (!request.workspace_id) throw new HttpError(400, "copilot_project_required", "Select a project first.");
  const workspaceId = request.workspace_id;
  await authorize(workspaceId, actor);
  const raw = schemas[name].safeParse(args);
  if (!raw.success) throw new HttpError(400, "copilot_invalid_query", "Invalid query fields. Use exact resource names/IDs and ISO times with explicit offsets.");
  const values = raw.data;
  const now = new Date();
  const at = "at" in values && values.at ? new Date(values.at) : now;
  let zone = "timezone" in values && values.timezone ? values.timezone : "UTC";
  const requirePermission = async (permission: WorkspacePermission) => authorize(workspaceId, actor, permission);
  const receipt: CopilotQueryReceipt = { operation: name, queried_at: now.toISOString(), at: at.toISOString(), timezone: zone, local_time: "",
    scope: `project:${workspaceId}`, returned_count: 0, has_more: false, delivery_verified: false };
  const sources: CopilotSource[] = [];
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(at);
  } catch { throw new HttpError(400, "copilot_invalid_timezone", "Use a valid IANA timezone and datetime."); }
  let data: unknown;
  try {
    if (name === "find_project_resources") {
      const v = schemas.find_project_resources.parse(args);
      await requirePermission(permissions[v.kind]);
      const cursor = decodeCursor(v.cursor);
      const rows = await namedRows(v.kind, workspaceId, { ...(v.query ? { query: v.query } : {}), ...(cursor ? { after: cursor.id } : {}) }, v.limit + 1);
      const items = rows.slice(0, v.limit);
      receipt.has_more = rows.length > v.limit; receipt.returned_count = items.length;
      if (receipt.has_more) receipt.next_cursor = encodeCursor(items.at(-1)!.id);
      receipt.scope += `; kind:${v.kind}; query:${v.query ?? ""}; limit:${v.limit}`;
      sources.push(...items.map((row) => source(v.kind, row)));
      data = { kind: v.kind, items };
    } else if (name === "list_project_incidents") {
      const v = schemas.list_project_incidents.parse(args);
      await requirePermission("incident.read");
      const selected = v.service_id || v.service_name ? (await requirePermission("service.read"), await selectResource("service", workspaceId, request, { id: v.service_id, name: v.service_name })) : null;
      if (v.since && v.until && new Date(v.since) > new Date(v.until)) throw new HttpError(400, "copilot_invalid_range", "The start time must be before the end time.");
      const cursor = decodeCursor(v.cursor);
      if (cursor && !cursor.created_at) throw new HttpError(400, "copilot_invalid_cursor", "Use the incident result cursor.");
      const rows = await prisma.incident.findMany({ where: { workspaceId, ...(selected ? { serviceId: selected.id } : {}),
        ...(v.status === "open" ? { status: { in: ["triggered" as const, "acknowledged" as const] } } : v.status === "all" ? {} : { status: v.status }),
        ...(v.severity ? { severity: v.severity } : {}), ...(v.since || v.until ? { createdAt: { ...(v.since ? { gte: new Date(v.since) } : {}), ...(v.until ? { lte: new Date(v.until) } : {}) } } : {}),
        ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.created_at!) } }, { createdAt: new Date(cursor.created_at!), id: { lt: cursor.id } }] } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: v.limit + 1,
        select: { id: true, title: true, status: true, severity: true, priority: true, createdAt: true, serviceId: true } });
      const items = rows.slice(0, v.limit).map((row) => ({ id: row.id, title: row.title.slice(0, 300), status: row.status, severity: row.severity, priority: row.priority, service_id: row.serviceId, created_at: row.createdAt.toISOString() }));
      receipt.has_more = rows.length > v.limit; receipt.returned_count = items.length;
      if (receipt.has_more) receipt.next_cursor = encodeCursor(rows[v.limit - 1]!.id, rows[v.limit - 1]!.createdAt);
      receipt.scope += `; service:${selected?.id ?? "all"}; status:${v.status}; severity:${v.severity ?? "all"}; since:${v.since ?? "unbounded"}; until:${v.until ?? "unbounded"}; limit:${v.limit}`;
      sources.push({ path: "/incidents", title: "Incidents", snippet: `${v.status}; ${items.length} returned; has_more=${receipt.has_more}` }, ...items.map((row) => ({ path: `/incidents/${row.id}`, title: row.title, snippet: `${row.status}; ${row.severity}; ${row.created_at}` })));
      data = { items };
    } else {
      const kind: Kind = name === "get_project_on_call" ? "schedule" : name === "get_service_routing" ? "service" : schemas.get_project_resource.parse(args).kind;
      await requirePermission(permissions[kind]);
      const v = values as z.infer<typeof schemas.get_project_resource>;
      const selected = await selectResource(kind, workspaceId, request, v);
      receipt.scope += `; ${kind}:${selected.id}`; receipt.returned_count = 1;
      sources.push(source(kind, selected));
      if (kind === "schedule") {
        data = await scheduleAt(workspaceId, selected.id, at);
        const current = data as Awaited<ReturnType<typeof scheduleAt>>;
        if (!current.schedule) throw new HttpError(404, "copilot_resource_not_found", "Schedule no longer exists in this project.");
        if (name === "get_project_resource") {
          const details = await prisma.onCallSchedule.findFirst({ where: { workspaceId, id: selected.id }, select: {
            teamId: true, serviceId: true,
            rotations: { take: 21, orderBy: { id: "asc" }, select: { id: true, layer: true, rotationType: true,
              rotationInterval: true, startsAt: true, timezone: true,
              participants: { take: 21, orderBy: { position: "asc" }, select: { userId: true, position: true } } } },
          } });
          if (!details) throw new HttpError(404, "copilot_resource_not_found", "Schedule no longer exists in this project.");
          receipt.has_more = details.rotations.length > 20 || details.rotations.some((rotation) => rotation.participants.length > 20);
          receipt.scope += "; rotations_limit:20; participants_per_rotation_limit:20";
          data = { ...current, team_id: details.teamId, service_id: details.serviceId,
            rotations: details.rotations.slice(0, 20).map((rotation) => ({ id: rotation.id, layer: rotation.layer,
              rotation_type: rotation.rotationType, rotation_interval: rotation.rotationInterval,
              starts_at: rotation.startsAt.toISOString(), timezone: rotation.timezone,
              participants: rotation.participants.slice(0, 20).map((participant) => ({ user_id: participant.userId, position: participant.position })),
              has_more_participants: rotation.participants.length > 20 })) };
        }
        if (!("timezone" in values) || !values.timezone) zone = current.schedule.timezone;
        sources[0] = source(kind, selected, `primary: ${current.primary?.name ?? "no responder"}; secondary: ${current.secondary?.name ?? "no responder"}; ${at.toISOString()}; ${zone}`);
      } else if (kind === "policy") {
        data = await policyAt(workspaceId, selected.id, at, actor, sources);
        const policy = data as Awaited<ReturnType<typeof policyAt>>;
        if (!policy) throw new HttpError(404, "copilot_resource_not_found", "Policy no longer exists in this project.");
        receipt.has_more = Boolean(policy && (policy.has_more_steps || policy.steps.some((step) => step.has_more_recipients)));
        receipt.scope += "; steps_limit:50; team_members_limit:20";
      } else if (kind === "member") {
        data = await member(workspaceId, selected.id);
        if (!data) throw new HttpError(404, "copilot_resource_not_found", "Member no longer exists in this project.");
      } else {
        const service = await prisma.service.findFirst({ where: { workspaceId, id: selected.id }, select: { id: true, name: true, description: true, teamId: true, escalationPolicyId: true } });
        if (!service) throw new HttpError(404, "copilot_resource_not_found", "Service no longer exists in this project.");
        if (name === "get_service_routing") {
          await requirePermission("escalation.read");
          const policy = service.escalationPolicyId ? await policyAt(workspaceId, service.escalationPolicyId, at, actor, sources) : null;
          receipt.has_more = Boolean(policy && (policy.has_more_steps || policy.steps.some((step) => step.has_more_recipients)));
          receipt.scope += "; steps_limit:50; team_members_limit:20";
          data = { service: { id: service.id, name: service.name }, policy, delivery_verified: false,
            limitation: "Configured recipients only. Contact availability, channel preferences, provider health, delivery and receipt are NOT verified. Future steps may resolve different on-call users when actually executed." };
        } else data = { id: service.id, name: service.name, description: service.description?.slice(0, 2000) ?? null, team_id: service.teamId, escalation_policy_id: service.escalationPolicyId };
      }
    }
    receipt.timezone = zone;
    receipt.local_time = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, dateStyle: "short", timeStyle: "long" }).format(at);
    return { data, receipt, sources: [...new Map(sources.map((entry) => [entry.path + entry.title, entry])).values()].slice(0, 24) };
  } catch (error) {
    if (error instanceof SelectionRequired) return { clarification: error.response };
    throw error;
  }
}
