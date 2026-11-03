import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ member: vi.fn(), request: vi.fn(), delivery: vi.fn(), findUnique: vi.fn() }));
vi.mock("@im/db", () => ({ prisma: { workspace: { findUnique: mocks.findUnique } } }));
vi.mock("./copilot-usage", () => ({ reserveCopilotRequest: vi.fn(), assertCopilotTokenBudget: vi.fn(), recordCopilotTokens: vi.fn(), recordOutOfScope: vi.fn() }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.member })),
}));
vi.mock("./model-client", () => ({ requestCopilotModel: mocks.request, getCopilotModel: () => "example-model", isCopilotConfigured: () => true }));
vi.mock("./copilot-delivery", () => ({ deliveryTool: { type: "function", name: "explain_incident_delivery" }, explainIncidentDelivery: mocks.delivery }));

import { planCopilotSettings } from "./copilot-settings";

const workspace = "22222222-2222-4222-8222-222222222222";
const incidentId = "44444444-4444-4444-8444-444444444444";
const call = (args: unknown) => ({ type: "function_call", name: "explain_incident_delivery", call_id: randomUUID(), arguments: JSON.stringify(args) });
const answer = (text: string) => [{ type: "message", content: [{ type: "output_text", text }] }];

describe("delivery explanation model transport", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  for (const [locale, question, reply] of [
    ["en", "Why did this incident notification fail?", "A recorded attempt failed; check provider settings."],
    ["ko", "이 인시던트 알림이 왜 실패했어?", "기록된 전송 시도가 실패했습니다. provider 설정을 확인하세요."],
    ["zh-CN", "这个事件的通知为什么失败？", "记录中的发送尝试失败了，请检查服务商设置。"],
  ] as const) {
    it(`${locale}: returns a server-classified result with evidence and no settings proposal`, async () => {
      mocks.request.mockResolvedValueOnce([call({ id: incidentId })]).mockResolvedValueOnce(answer(reply));
      mocks.delivery.mockResolvedValue({ data: { outcome: "failed_or_mixed", notifications: [{ status: "failed",
        error_category: "provider_not_configured" }] },
        receipt: { operation: "explain_incident_delivery", queried_at: "2030-01-07T00:00:00Z", at: "2030-01-07T00:00:00Z",
          timezone: "UTC", local_time: "2030-01-07 00:00:00", scope: `project:${workspace}; incident:${incidentId}`,
          returned_count: 1, has_more: false, delivery_verified: false },
        sources: [{ path: `/incidents/${incidentId}`, title: "Checkout alert", snippet: "notification failed" }] });
      const result = await planCopilotSettings({ workspace_id: workspace, locale, question }, randomUUID());
      expect(result).toMatchObject({ kind: "message", answer: reply, sources: [{ path: `/incidents/${incidentId}` }],
        query_receipts: [{ operation: "explain_incident_delivery", delivery_verified: false }] });
      expect(mocks.findUnique).not.toHaveBeenCalled();
      expect(mocks.delivery).toHaveBeenCalledWith({ id: incidentId }, expect.objectContaining({ locale }), expect.any(String));
    });
  }

  it("returns incident disambiguation directly without letting the model guess", async () => {
    mocks.request.mockResolvedValueOnce([call({ title: "Checkout alert" })]);
    mocks.delivery.mockResolvedValue({ clarification: { answer: "Select incident", kind: "clarification", mode: "direct", sources: [],
      clarification: { reason: "ambiguous_query_resource", fields: [{ id: "lookup_incident", label: "Select incident",
        input_type: "select", required: true, options: [{ label: "Checkout alert", value: incidentId }] }] } } });
    const result = await planCopilotSettings({ workspace_id: workspace, question: "Why no alert for Checkout alert?" }, randomUUID());
    expect(result.kind).toBe("clarification");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});
