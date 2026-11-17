import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ member: vi.fn(), request: vi.fn(), audit: vi.fn(), findUnique: vi.fn() }));
vi.mock("@im/db", () => ({ prisma: { workspace: { findUnique: mocks.findUnique } } }));
vi.mock("./copilot-usage", () => ({ reserveCopilotRequest: vi.fn(), assertCopilotTokenBudget: vi.fn(), recordCopilotTokens: vi.fn(), recordOutOfScope: vi.fn() }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.member })),
}));
vi.mock("./model-client", () => ({ requestCopilotModel: mocks.request, getCopilotModel: () => "example-model", isCopilotConfigured: () => true }));
vi.mock("./copilot-audit", () => ({ auditTool: { type: "function", name: "inspect_project_settings" }, inspectProjectSettings: mocks.audit }));

import { planCopilotSettings } from "./copilot-settings";

const workspace = "22222222-2222-4222-8222-222222222222";
const call = (args: unknown) => ({ type: "function_call", name: "inspect_project_settings", call_id: randomUUID(), arguments: JSON.stringify(args) });
const answer = (text: string) => [{ type: "message", content: [{ type: "output_text", text }] }];

describe("settings audit model transport", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  for (const [locale, question, reply] of [
    ["en", "What alert settings are missing?", "The checkout service has no policy."],
    ["ko", "알림 설정에서 빠진 게 있어?", "checkout 서비스에 정책 연결이 없습니다."],
    ["zh-CN", "告警设置缺少什么？", "checkout 服务没有关联策略。"],
  ] as const) {
    it(`${locale}: returns server findings with evidence and no settings proposal`, async () => {
      mocks.request.mockResolvedValueOnce([call({})]).mockResolvedValueOnce(answer(reply));
      mocks.audit.mockResolvedValue({ data: { status: "findings", findings: [{ code: "service_without_policy", name: "checkout" }] },
        receipt: { operation: "inspect_project_settings", queried_at: "2030-01-07T00:00:00Z", at: "2030-01-07T00:00:00Z",
          timezone: "UTC", local_time: "2030-01-07 00:00:00", scope: `project:${workspace}; services:1`,
          returned_count: 1, has_more: false, delivery_verified: false },
        sources: [{ path: "/services/44444444-4444-4444-8444-444444444444", title: "checkout", snippet: "No policy" }] });
      const result = await planCopilotSettings({ workspace_id: workspace, locale, question }, randomUUID());
      expect(result).toMatchObject({ kind: "message", answer: reply,
        query_receipts: [{ operation: "inspect_project_settings", delivery_verified: false }], sources: [{ title: "checkout" }] });
      expect(mocks.findUnique).not.toHaveBeenCalled();
      expect(mocks.audit).toHaveBeenCalledWith({}, expect.objectContaining({ workspace_id: workspace, locale }), expect.any(String));
      const input = mocks.request.mock.calls[1]![0] as Array<{ type?: string; output?: string }>;
      expect(input.some((item) => item.type === "function_call_output" && item.output?.includes("service_without_policy"))).toBe(true);
    });
  }
});
