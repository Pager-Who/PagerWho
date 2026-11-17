import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ member: vi.fn(), permission: vi.fn(), request: vi.fn(), findUnique: vi.fn() }));
vi.mock("@im/db", () => ({ prisma: { workspace: { findUnique: mocks.findUnique } } }));
vi.mock("./copilot-usage", () => ({ reserveCopilotRequest: vi.fn(), assertCopilotTokenBudget: vi.fn(), recordCopilotTokens: vi.fn(), recordOutOfScope: vi.fn() }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.member, assertWorkspacePermission: mocks.permission })),
}));
vi.mock("./model-client", () => ({ requestCopilotModel: mocks.request, getCopilotModel: () => "example-model", isCopilotConfigured: () => true }));

import { planCopilotSettings } from "./copilot-settings";

const workspace = "22222222-2222-4222-8222-222222222222";
const reply = (text: string) => [{ type: "message", content: [{ type: "output_text", text }] }];

describe("webhook help transport (mock model; not a language-quality benchmark)", () => {
  beforeEach(() => vi.clearAllMocks());
  for (const [locale, question, text] of [
    ["en", "Please check this webhook payload", "Use a JSON object with a title."],
    ["ko", "이 웹훅 페이로드 확인해줘", "제목이 있는 JSON 객체를 사용하세요."],
    ["zh-CN", "请检查这个网络钩子请求体", "请使用带有标题的 JSON 对象。"],
  ] as const) {
    it(`${locale}: keeps pasted secrets out of the model prompt and returns safe evidence`, async () => {
      mocks.request.mockResolvedValueOnce(reply(text));
      const secret = `secret-${randomUUID()}`;
      const result = await planCopilotSettings({ workspace_id: workspace, locale,
        question: `${question}: ${JSON.stringify({ title: "Example alert", token: secret, description: secret })}` }, randomUUID());
      expect(result).toMatchObject({ kind: "message", answer: text, query_receipts: [{ operation: "inspect_webhook_payload" }] });
      expect(result.sources).toEqual(expect.arrayContaining([expect.objectContaining({ path: "/services" }),
        expect.objectContaining({ path: "/docs/services-and-webhooks" })]));
      const providerInput = mocks.request.mock.calls[0]![0];
      expect(JSON.stringify(providerInput)).not.toContain(secret);
      expect(mocks.request.mock.calls[0]![1]).toEqual([]);
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });
  }

  it("withholds raw follow-up text and past payloads in the same webhook conversation", async () => {
    mocks.request.mockResolvedValueOnce(reply("Use the saved service webhook settings."));
    const oldSecret = `old-${randomUUID()}`;
    const newSecret = `new-${randomUUID()}`;
    await planCopilotSettings({ workspace_id: workspace, question: `secret is ${newSecret}`,
      history: [{ role: "user", content: `webhook payload ${JSON.stringify({ title: "Example alert", token: oldSecret })}` }] }, randomUUID());
    const sent = JSON.stringify(mocks.request.mock.calls[0]![0]);
    expect(sent).not.toContain(oldSecret);
    expect(sent).not.toContain(newSecret);
  });
});
