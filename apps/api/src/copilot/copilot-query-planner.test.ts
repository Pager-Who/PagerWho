import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ member: vi.fn(), request: vi.fn(), execute: vi.fn(), findUnique: vi.fn() }));
vi.mock("@im/db", () => ({ prisma: { workspace: { findUnique: mocks.findUnique } } }));
vi.mock("./copilot-usage", () => ({ reserveCopilotRequest: vi.fn(), assertCopilotTokenBudget: vi.fn(), recordCopilotTokens: vi.fn(), recordOutOfScope: vi.fn() }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.member })),
}));
vi.mock("./model-client", () => ({ requestCopilotModel: mocks.request, getCopilotModel: () => "example-model", isCopilotConfigured: () => true }));
vi.mock("./copilot-query", () => ({ isQueryTool: (name: string) => name === "list_project_incidents",
  queryTools: [{ type: "function", name: "list_project_incidents", parameters: { type: "object", properties: {} } }],
  executeProjectQuery: mocks.execute,
}));

import { planCopilotSettings } from "./copilot-settings";
import { HttpError } from "../http/errors/http-error";

const workspace = "22222222-2222-4222-8222-222222222222";
const incidentId = "44444444-4444-4444-8444-444444444444";
const call = (name: string, args: unknown) => ({ type: "function_call", call_id: randomUUID(), name, arguments: JSON.stringify(args) });
const answer = (text: string) => [{ type: "message", content: [{ type: "output_text", text }] }];

describe("read-only Qwen query transport", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each(["en", "ko", "zh-CN"] as const)("%s: uses the read tool for a viewer and returns server evidence without loading settings", async (locale) => {
    mocks.request.mockResolvedValueOnce([call("list_project_incidents", { status: "open" })]).mockResolvedValueOnce(answer("Two open incidents"));
    mocks.execute.mockResolvedValue({ data: { items: [{ id: incidentId, status: "triggered" }] },
      receipt: { operation: "list_project_incidents", queried_at: "2030-01-07T00:00:00Z", at: "2030-01-07T00:00:00Z",
        timezone: "UTC", local_time: "2030-01-07 00:00:00", scope: `project:${workspace}; status:open; limit:10`,
        returned_count: 1, has_more: false, delivery_verified: false },
      sources: [{ path: `/incidents/${incidentId}`, title: "Incident", snippet: "triggered" }] });
    const response = await planCopilotSettings({ question: "open incidents", locale, workspace_id: workspace }, randomUUID());
    expect(response).toMatchObject({ kind: "message", mode: "ai", sources: [{ path: `/incidents/${incidentId}` }],
      query_receipts: [{ operation: "list_project_incidents", delivery_verified: false }] });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith("list_project_incidents", { status: "open" }, expect.objectContaining({ locale }), expect.any(String));
    const messages = mocks.request.mock.calls[1]![0] as Array<{ type?: string; output?: string }>;
    expect(messages.some((entry) => entry.type === "function_call_output" && entry.output?.includes(incidentId))).toBe(true);
  });

  it("returns server selection directly without a model guess or a settings write", async () => {
    mocks.request.mockResolvedValueOnce([call("list_project_incidents", { service_name: "checkout" })]);
    mocks.execute.mockResolvedValue({ clarification: { kind: "clarification", mode: "direct", answer: "Select service",
      sources: [], clarification: { reason: "ambiguous_query_resource", fields: [{ id: "lookup_service", label: "Service",
        input_type: "select", required: true, options: [{ label: "checkout", value: incidentId }] }] } } });
    const response = await planCopilotSettings({ question: "checkout incidents", workspace_id: workspace }, randomUUID());
    expect(response.kind).toBe("clarification");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("propagates authorization errors instead of letting the model retry with a misleading answer", async () => {
    mocks.request.mockResolvedValueOnce([call("list_project_incidents", {})]);
    mocks.execute.mockRejectedValue(new HttpError(403, "copilot_query_forbidden", "Forbidden"));
    await expect(planCopilotSettings({ question: "open incidents", workspace_id: workspace }, randomUUID()))
      .rejects.toMatchObject({ code: "copilot_query_forbidden" });
  });
});
