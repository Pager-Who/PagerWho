import { WebhookIngestionError, WebhookIngestionService, WorkspaceError, WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import { type CopilotAskRequest, type CopilotQueryReceipt, type CopilotSource } from "@im/contracts";
import { HttpError } from "../http/errors/http-error";

const workspaces = new WorkspaceService(prisma);
const ingestion = new WebhookIngestionService(prisma);
const intent = /web[ -]?hook|웹훅|웹 후크|페이로드|payload|网络钩子|網絡鉤子|请求体/i;

export function isWebhookHelpRequest(request: CopilotAskRequest) {
  if (intent.test(request.question)) return true;
  // Treat follow-ups in a webhook conversation as sensitive until the chat is cleared.
  return (request.history ?? []).some((item) => item.role === "user" && intent.test(item.content));
}

export function hasWebhookHistory(request: CopilotAskRequest) {
  return (request.history ?? []).some((item) => intent.test(item.content));
}

function sampleFromRequest(request: CopilotAskRequest) {
  const messages = [request.question, ...(request.history ?? []).filter((item) => item.role === "user").map((item) => item.content).reverse()];
  for (const message of messages) {
    const fenced = /```json\s*([\s\S]*?)```/i.exec(message)?.[1]
      ?? /```\s*\r?\n([\s\S]*?)```/.exec(message)?.[1];
    if (fenced) return fenced.trim();
    const start = message.indexOf("{");
    const end = message.lastIndexOf("}");
    if (start >= 0 && end > start) return message.slice(start, end + 1);
    const arrayStart = message.indexOf("[");
    const arrayEnd = message.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) return message.slice(arrayStart, arrayEnd + 1);
  }
  return null;
}

const examples = {
  generic: { title: "Example alert", description: "Example details", severity: "high", event_key: "example-event-001", fingerprint: "example-alert" },
  grafana: { status: "firing", alerts: [{ labels: { alertname: "Example alert", severity: "high" }, startsAt: "2030-01-01T00:00:00Z", fingerprint: "example-alert" }] },
  sentry: { action: "created", issue: { title: "Example alert", id: "example-issue" }, event: { level: "error", message: "Example details", event_id: "example-event" } },
  datadog: { alert_title: "Example alert", alert_priority: "P2", alert_id: "example-alert-id", alert_transition: "Triggered", alert_body: "Example details" },
} as const;

export async function inspectWebhookPayload(request: CopilotAskRequest, actor: string) {
  if (!request.workspace_id) throw new HttpError(400, "copilot_project_required", "Select a project first.");
  try {
    await workspaces.assertMember(request.workspace_id, actor);
    await workspaces.assertWorkspacePermission(request.workspace_id, actor, "service.read");
  }
  catch (error) {
    if (error instanceof WorkspaceError && ["workspace_access_forbidden", "workspace_member_not_found", "workspace_permission_required", "workspace_admin_required"].includes(error.code))
      throw new HttpError(403, "copilot_webhook_forbidden", "Project service read permission is required.");
    throw error;
  }
  const sample = sampleFromRequest(request);
  const issues: string[] = [];
  const recommendations: string[] = [];
  let format: keyof typeof examples = "generic";
  let normalized: { severity: string; priority: string; status: string; has_description: boolean } | null = null;
  if (sample) {
    try {
      const value: unknown = JSON.parse(sample);
      if (!value || typeof value !== "object" || Array.isArray(value)) issues.push("top_level_object_required");
      else {
        format = ingestion.detectPayloadFormat(value);
        try {
          const preview = ingestion.previewPayload(value);
          normalized = { severity: preview.severity, priority: preview.priority, status: preview.status,
            has_description: preview.has_description };
          const fields = value as Record<string, unknown>;
          if (format === "generic") {
            const severity = fields.severity ?? fields.level;
            if (severity !== undefined && !["critical", "crit", "p1", "sev1", "down", "high", "p2", "sev2", "error",
              "medium", "warning", "warn", "p3", "sev3", "degraded", "low", "p4", "sev4", "info", "informational"].includes(String(severity).trim().toLowerCase()))
              recommendations.push("The supplied severity is not a recognized alias and may normalize to low; use critical, high, medium or low.");
            const priority = fields.priority ?? fields.incident_priority;
            if (priority !== undefined && !/^(?:p[1-5]|priority[1-5]|priority_[1-5]|sev[1-5]|severity[1-5])$/i.test(String(priority).trim()))
              recommendations.push("The supplied priority is not a recognized alias; the server will derive priority from severity.");
            if (!fields.event_key && !fields.eventKey && !fields.event_id && !fields.dedup_key)
              recommendations.push("Add a stable event_key for duplicate delivery detection; otherwise the server hashes the payload.");
            if (!fields.fingerprint && !fields.dedup_key && !fields.alert_key)
              recommendations.push("Add a stable fingerprint for related alerts; otherwise the server derives it from source and title.");
          }
        } catch (error) {
          if (error instanceof WebhookIngestionError && error.code === "webhook_payload_invalid") issues.push("supported_title_missing");
          else throw error;
        }
      }
    } catch (error) {
      if (error instanceof SyntaxError) issues.push("invalid_json");
      else throw error;
    }
  }
  const now = new Date();
  const receipt: CopilotQueryReceipt = { operation: "inspect_webhook_payload", queried_at: now.toISOString(), at: now.toISOString(),
    timezone: "UTC", local_time: new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC", dateStyle: "short", timeStyle: "long" }).format(now),
    scope: `project:${request.workspace_id}; sample:${sample ? "present" : "absent"}; format:${format}`,
    returned_count: sample ? 1 : 0, has_more: false, delivery_verified: false };
  const sources: CopilotSource[] = [{ path: "/services", title: "Service webhooks", snippet: "Find the endpoint URL and secret in the selected service's settings. Keep the secret out of chat." }];
  return { data: { sample_status: sample ? issues.length ? "invalid" : "valid" : "not_provided", format, issues, recommendations,
    normalized, corrected_example: examples[format],
    setup: { method: "POST", content_type: "application/json", endpoint: "Use the enabled service webhook URL shown in PagerWho.",
      authentication: "Send the service webhook secret in x-webhook-token or Bearer authorization; do not paste the real secret in chat.",
      result: "201 for created incident, 200 for duplicate, merged or resolved event." },
    limits: "This is a normalization preview only. The endpoint, secret, network, service configuration and actual incident creation were not tested." },
    receipt, sources };
}
