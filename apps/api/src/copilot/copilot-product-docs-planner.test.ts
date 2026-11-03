import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ member: vi.fn(), request: vi.fn(), findUnique: vi.fn() }));
vi.mock("@im/db", () => ({ prisma: { workspace: { findUnique: mocks.findUnique } } }));
vi.mock("./copilot-usage", () => ({ reserveCopilotRequest: vi.fn(), assertCopilotTokenBudget: vi.fn(), recordCopilotTokens: vi.fn(), recordOutOfScope: vi.fn() }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.member })),
}));
vi.mock("./model-client", () => ({ requestCopilotModel: mocks.request, getCopilotModel: () => "example-model", isCopilotConfigured: () => true }));

import { planCopilotSettings } from "./copilot-settings";
import { getProductDocsVersion } from "@im/contracts";

const workspaceId = "22222222-2222-4222-8222-222222222222";

describe("product guide model transport", () => {
  it.each(["en", "ko", "zh-CN"] as const)("%s: passes public docs and returns a clickable source without loading settings", async (locale) => {
    vi.clearAllMocks();
    mocks.request.mockResolvedValueOnce([{ type: "function_call", name: "search_product_docs", call_id: randomUUID(), arguments: JSON.stringify({ query: "on-call" }) }])
      .mockResolvedValueOnce([{ type: "message", content: [{ type: "output_text", text: "See the on-call guide." }] }]);

    const result = await planCopilotSettings({ workspace_id: workspaceId, locale, question: "How do I configure on-call?" }, randomUUID());
    expect(result).toMatchObject({ kind: "message", sources: expect.arrayContaining([expect.objectContaining({ path: "/docs/on-call" })]) });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    const toolOutput = mocks.request.mock.calls[1]![0] as Array<{ type?: string; output?: string }>;
    expect(toolOutput.some((entry) => entry.type === "function_call_output" && entry.output?.includes("/docs/on-call"))).toBe(true);
  });

  it("rejects a stale browser guide version before providing documentation", async () => {
    vi.clearAllMocks();
    mocks.request.mockResolvedValueOnce([{ type: "function_call", name: "search_product_docs", call_id: randomUUID(), arguments: '{"query":"on-call"}' }]);
    const staleVersion = getProductDocsVersion() === "00000000" ? "ffffffff" : "00000000";
    await expect(planCopilotSettings({ workspace_id: workspaceId, docs_version: staleVersion, question: "How does on-call work?" }, randomUUID()))
      .rejects.toMatchObject({ statusCode: 409, code: "copilot_docs_version_mismatch" });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});
