import { z } from "zod";
import { WorkspaceError, WorkspaceService } from "@im/backend-core";
import { UuidSchema, type CopilotAskRequest, type CopilotAskResponse, type CopilotQueryReceipt, type CopilotSource } from "@im/contracts";
import { prisma } from "@im/db";
import { HttpError } from "../http/errors/http-error";

const workspaces = new WorkspaceService(prisma);
const argsSchema = z.object({ id: UuidSchema.optional(), title: z.string().trim().min(1).max(300).optional(),
  cursor: z.string().min(1).max(500).optional(), limit: z.number().int().min(1).max(10).default(10) }).strict();
const cursorSchema = z.object({ id: UuidSchema, created_at: z.string().datetime() }).strict();

export const deliveryTool = { type: "function", name: "explain_incident_delivery",
  description: "Read one incident's escalation state, notification logs, and bounded delivery attempts. Returns server-classified outcomes, never raw provider errors, recipient addresses or credentials. No delivery is triggered.",
  parameters: { type: "object", properties: {
    id: { type: "string", description: "Incident ID from an explicit user choice or prior lookup." },
    title: { type: "string", description: "Exact incident title; duplicate titles require user selection." },
    cursor: { type: "string", description: "Opaque next_cursor from the preceding page; preserve the incident selection." },
    limit: { type: "integer", minimum: 1, maximum: 10 },
  }, required: [], additionalProperties: false } };

function classifiedError(value: string | null): string | null {
  if (!value) return null;
  if (/^Incident is (?:acknowledged|resolved)\b/i.test(value)) return "incident_already_handled";
  if (/\b(?:429|rate.?limit|too many requests)\b/i.test(value)) return "rate_limited";
  if (/\b(?:timed? out|timeout|ETIMEDOUT)\b/i.test(value)) return "timeout";
  if (/\b(?:not configured|missing configuration|missing credentials)\b/i.test(value)) return "provider_not_configured";
  if (/\b(?:401|403|unauthorized|forbidden|authentication failed)\b/i.test(value)) return "authentication_or_authorization";
  if (/\b(?:400|404|invalid recipient|invalid address|bad request)\b/i.test(value)) return "rejected_request_or_recipient";
  return "unclassified_provider_error";
}
function suggestedCheck(category: string | null): string | null {
  switch (category) {
    case "rate_limited": return "Check provider rate limits and the scheduled retry.";
    case "timeout": return "Check provider connectivity and retry state.";
    case "provider_not_configured": return "Check the saved project notification provider settings.";
    case "authentication_or_authorization": return "Check provider credential validity in project settings; do not paste credentials into chat.";
    case "rejected_request_or_recipient": return "Check the configured recipient or provider request settings.";
    case "incident_already_handled": return "Check the incident acknowledgement or resolution time against the attempt.";
    case "unclassified_provider_error": return "Inspect the restricted notification record with an authorized operator.";
    default: return null;
  }
}

function decodeCursor(cursor?: string) {
  if (!cursor) return undefined;
  try { return cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))); }
  catch { throw new HttpError(400, "copilot_invalid_cursor", "Invalid delivery cursor. Start again."); }
}
function denied(error: unknown): never {
  if (error instanceof WorkspaceError && ["workspace_access_forbidden", "workspace_member_not_found", "workspace_permission_required", "workspace_admin_required"].includes(error.code))
    throw new HttpError(403, "copilot_delivery_forbidden", "Incident read and notification management permissions are required.");
  throw error;
}

export async function explainIncidentDelivery(args: unknown, request: CopilotAskRequest, actor: string): Promise<
  { data: unknown; receipt: CopilotQueryReceipt; sources: CopilotSource[] } | { clarification: CopilotAskResponse }
> {
  if (!request.workspace_id) throw new HttpError(400, "copilot_project_required", "Select a project first.");
  const parsed = argsSchema.safeParse(args);
  if (!parsed.success) throw new HttpError(400, "copilot_invalid_delivery_query", "Use an incident ID or exact title and a valid page cursor.");
  const workspaceId = request.workspace_id;
  try {
    await workspaces.assertMember(workspaceId, actor);
    await workspaces.assertWorkspacePermission(workspaceId, actor, "incident.read");
    await workspaces.assertWorkspacePermission(workspaceId, actor, "notification.manage");
  } catch (error) { denied(error); }
  const v = parsed.data;
  const selectedId = request.structured_input?.values.lookup_incident;
  const candidates = await prisma.incident.findMany({ where: { workspaceId,
    ...(v.id ? { id: v.id } : v.title ? { title: { equals: v.title, mode: "insensitive" } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
    select: { id: true, title: true, status: true, serviceId: true, createdAt: true } });
  if (!candidates.length) throw new HttpError(404, "copilot_incident_not_found", "No matching incident in this project.");
  let incident = candidates.find((candidate) => candidate.id === selectedId);
  if (!incident && v.id && candidates.length === 1) incident = candidates[0];
  if (!incident && v.title && candidates.length === 1) incident = candidates[0];
  if (!incident) {
    const locale = request.locale ?? "en";
    const label = locale === "ko" ? "인시던트 선택" : locale === "zh-CN" ? "选择事件" : "Select incident";
    return { clarification: { answer: candidates.length > 20
      ? (locale === "ko" ? "인시던트 ID로 범위를 좁혀 주세요." : locale === "zh-CN" ? "请使用事件 ID 缩小范围。" : "Narrow the selection using an incident ID.")
      : label, kind: "clarification", mode: "direct", sources: [], clarification: {
        reason: "ambiguous_query_resource", fields: [{ id: "lookup_incident", label, input_type: "select", required: true,
          options: candidates.slice(0, 20).map((candidate) => ({ label: `${candidate.title.slice(0, 100)} (${candidate.id})`, value: candidate.id })) }],
      } } };
  }
  if (v.title && incident.title.toLowerCase() !== v.title.toLowerCase())
    throw new HttpError(400, "copilot_incident_mismatch", "The incident ID and title do not match.");
  const cursor = decodeCursor(v.cursor);
  const [escalation, logs] = await Promise.all([
    prisma.incidentEscalationState.findUnique({ where: { incidentId: incident.id },
      select: { policyId: true, currentStep: true, repeatIteration: true, nextRunAt: true, status: true, updatedAt: true } }),
    prisma.notificationLog.findMany({ where: { incidentId: incident.id,
      ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.created_at) } },
        { createdAt: new Date(cursor.created_at), id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: v.limit + 1,
      select: { id: true, policyStepId: true, repeatIteration: true, channel: true, targetType: true,
        status: true, attempt: true, errorMessage: true, nextRetryAt: true, sentAt: true, createdAt: true,
        deliveryAttempts: { orderBy: { attempt: "desc" }, take: 6,
          select: { id: true, attempt: true, status: true, errorMessage: true, startedAt: true, completedAt: true } } } }),
  ]);
  const visible = logs.slice(0, v.limit);
  const notifications = visible.map((log) => ({ id: log.id, policy_step_id: log.policyStepId,
    repeat_iteration: log.repeatIteration, channel: log.channel, target_type: log.targetType,
    status: log.status, attempt_count: log.attempt,
    error_category: ["failed", "retrying", "skipped"].includes(log.status) ? classifiedError(log.errorMessage) : null,
    suggested_check: ["failed", "retrying", "skipped"].includes(log.status) ? suggestedCheck(classifiedError(log.errorMessage)) : null,
    next_retry_at: log.nextRetryAt?.toISOString() ?? null, sent_at: log.sentAt?.toISOString() ?? null,
    created_at: log.createdAt.toISOString(), attempts: log.deliveryAttempts.slice(0, 5).map((attempt) => ({
      id: attempt.id, attempt: attempt.attempt, status: attempt.status, error_category: classifiedError(attempt.errorMessage),
      started_at: attempt.startedAt.toISOString(), completed_at: attempt.completedAt?.toISOString() ?? null,
    })), has_more_attempts: log.deliveryAttempts.length > 5 }));
  const hasMore = logs.length > v.limit;
  const last = visible.at(-1);
  const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ id: last.id, created_at: last.createdAt.toISOString() })).toString("base64url") : undefined;
  const statuses = notifications.map((item) => item.status);
  const hasFailedAttempt = notifications.some((item) => item.attempts.some((attempt) => attempt.status === "failed" || attempt.status === "timed_out"));
  const outcome = !statuses.length ? cursor ? "no_more_records" : escalation?.nextRunAt && escalation.nextRunAt > new Date() ? "scheduled_no_log_yet" : "no_notification_records"
    : statuses.every((status) => status === "sent" || status === "sent_after_ack") ? "provider_accepted"
      : statuses.some((status) => status === "failed") ? "failed_or_mixed" : statuses.some((status) => status === "retrying") ? "retrying"
        : statuses.some((status) => status === "pending" || status === "sending") ? hasFailedAttempt ? "attempt_failed_pending" : "pending_or_sending" : "skipped_or_mixed";
  const queriedAt = new Date().toISOString();
  const sources: CopilotSource[] = [
    { path: `/incidents/${incident.id}`, title: incident.title.slice(0, 200), snippet: `Incident ${incident.status}; ${incident.createdAt.toISOString()}` },
    ...notifications.slice(0, 20).map((item) => ({ path: `/incidents/${incident.id}`, title: `Notification ${item.id}`,
      snippet: `${item.channel}; ${item.status}; ${item.created_at}` })),
  ];
  const receipt: CopilotQueryReceipt = { operation: "explain_incident_delivery", queried_at: queriedAt, at: queriedAt,
    timezone: "UTC", local_time: new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC", dateStyle: "short", timeStyle: "long" }).format(new Date(queriedAt)),
    scope: `project:${workspaceId}; incident:${incident.id}; notification_page_limit:${v.limit}; attempts_per_notification_limit:5`,
    returned_count: notifications.length, has_more: hasMore || notifications.some((item) => item.has_more_attempts),
    ...(nextCursor ? { next_cursor: nextCursor } : {}), delivery_verified: false };
  return { data: { incident: { id: incident.id, title: incident.title.slice(0, 300), status: incident.status, service_id: incident.serviceId },
    escalation: escalation ? { policy_id: escalation.policyId, status: escalation.status, current_step: escalation.currentStep,
      repeat_iteration: escalation.repeatIteration, next_run_at: escalation.nextRunAt?.toISOString() ?? null,
      updated_at: escalation.updatedAt.toISOString() } : null,
    outcome, notifications, has_more_notifications: hasMore, limitation: "Only recorded attempts are described. No log does not establish a cause. Provider acceptance is not proof of recipient receipt, reading, or incident response. Raw provider errors and addresses are withheld." },
    receipt, sources };
}
