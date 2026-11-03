import { WorkspaceError } from "@im/backend-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ member: vi.fn(), permission: vi.fn() }));
vi.mock("@im/db", () => ({ prisma: {} }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.member, assertWorkspacePermission: mocks.permission })),
}));

import { inspectWebhookPayload, isWebhookHelpRequest } from "./copilot-webhook";

const workspace = "22222222-2222-4222-8222-222222222222";
const actor = "11111111-1111-4111-8111-111111111111";
const inspect = (question: string, history?: Array<{ role: "user" | "assistant"; content: string }>) =>
  inspectWebhookPayload({ question, workspace_id: workspace, ...(history ? { history } : {}) }, actor);

describe("server-only webhook payload preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the actual generic ingestion rules and returns only a synthetic example", async () => {
    const secret = "private@example.test bearer-secret";
    const result = await inspect(`Please check this webhook payload: \`\`\`json\n${JSON.stringify({ title: secret, description: secret, severity: "high",
      event_key: secret, fingerprint: secret, token: secret })}\n\`\`\``);
    expect(result.data).toMatchObject({ sample_status: "valid", format: "generic", issues: [], normalized: {
      severity: "high", priority: "P2", status: "triggered", has_description: true,
    } });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.receipt).toMatchObject({ operation: "inspect_webhook_payload", delivery_verified: false });
    expect(result.sources[0]?.path).toBe("/services");
  });

  it("reports missing title and malformed JSON with a safe correction example", async () => {
    const missing = await inspect('webhook payload {"severity":"critical"}');
    expect(missing.data).toMatchObject({ sample_status: "invalid", issues: ["supported_title_missing"],
      corrected_example: { title: "Example alert" } });
    const malformed = await inspect("webhook payload {oops}");
    expect(malformed.data).toMatchObject({ sample_status: "invalid", issues: ["invalid_json"] });
    const array = await inspect("webhook payload [1,2]");
    expect(array.data).toMatchObject({ sample_status: "invalid", issues: ["top_level_object_required"] });
    const grafanaMissing = await inspect('webhook payload {"alerts":[{"labels":{"severity":"high"}}]}');
    expect(grafanaMissing.data).toMatchObject({ sample_status: "invalid", format: "grafana", issues: ["supported_title_missing"] });
  });

  it("explains actual normalization of unrecognized severity and priority without echoing values", async () => {
    const secret = "secret-private-value";
    const result = await inspect(`webhook payload ${JSON.stringify({ title: "Example alert", severity: secret, priority: secret })}`);
    expect(result.data).toMatchObject({ sample_status: "valid", normalized: { severity: "low", priority: "P4" } });
    expect(result.data.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining("severity is not a recognized alias"), expect.stringContaining("priority is not a recognized alias"),
    ]));
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("uses the real receiver's resolved-status rule", async () => {
    const result = await inspect('webhook payload {"title":"Example alert","status":"resolved"}');
    expect(result.data).toMatchObject({ sample_status: "valid", normalized: { status: "resolved" } });
  });

  it.each([
    ["grafana", { status: "firing", alerts: [{ labels: { alertname: "Example alert", severity: "critical" } }] }],
    ["sentry", { issue: { title: "Example alert", id: "example-issue" }, event: { level: "error" } }],
    ["datadog", { alert_title: "Example alert", alert_priority: "P2", alert_id: "example-alert" }],
  ] as const)("matches %s ingestion format", async (format, sample) => {
    const result = await inspect(`webhook payload ${JSON.stringify(sample)}`);
    expect(result.data).toMatchObject({ sample_status: "valid", format });
    expect(JSON.stringify(result.data.corrected_example)).toContain("Example alert");
  });

  it("does not claim actual webhook delivery when only setup help is requested", async () => {
    const result = await inspect("How do I integrate a webhook?");
    expect(result.data).toMatchObject({ sample_status: "not_provided", setup: { method: "POST", content_type: "application/json" } });
    expect(JSON.stringify(result)).toContain("not tested");
  });

  it("uses the latest supplied sample and enforces project membership", async () => {
    const request = { question: "이 페이로드는 어때?", workspace_id: workspace,
      history: [{ role: "user" as const, content: '웹훅 payload {"title":"Example alert"}' }] };
    expect(isWebhookHelpRequest(request)).toBe(true);
    expect((await inspectWebhookPayload(request, actor)).data).toMatchObject({ sample_status: "valid" });
    mocks.member.mockRejectedValueOnce(new WorkspaceError("workspace_member_not_found", "private"));
    await expect(inspectWebhookPayload(request, actor)).rejects.toMatchObject({ statusCode: 403, code: "copilot_webhook_forbidden" });
    mocks.permission.mockRejectedValueOnce(new WorkspaceError("workspace_permission_required", "private"));
    await expect(inspectWebhookPayload(request, actor)).rejects.toMatchObject({ statusCode: 403, code: "copilot_webhook_forbidden" });
  });
});
