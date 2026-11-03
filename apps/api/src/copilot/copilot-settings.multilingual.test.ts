import { randomUUID } from "node:crypto";

import type { CopilotLocale } from "@im/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./copilot-review", () => ({ reviewSettingsDraft: async (draft: unknown) => draft }));

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), roles: vi.fn(), request: vi.fn(), assertMember: vi.fn() }));
vi.mock("@im/db", async () => ({ prisma: { workspace: { findUnique: mocks.findUnique },
  copilotProposal: (await import("./copilot-proposals.fixtures")).fakeCopilotProposalStore() } }));
vi.mock("./copilot-usage", () => ({ reserveCopilotRequest: vi.fn(), assertCopilotTokenBudget: vi.fn(), recordCopilotTokens: vi.fn(), recordOutOfScope: vi.fn() }));
vi.mock("./model-client", () => ({ requestCopilotModel: mocks.request, getCopilotModel: () => "example-model", isCopilotConfigured: () => true }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.assertMember, listMemberRoleKeys: mocks.roles })),
}));

import { clarifyAmbiguousMembers, planCopilotSettings, readSettingsContext } from "./copilot-settings";
import { assertSettingsEvaluation } from "./copilot-settings.assertions";
import { evaluationIds, evaluationProject, settingsEvaluationCases } from "./copilot-settings.cases";
import { CopilotSettingsDraftSchema } from "@im/contracts";

const locales: CopilotLocale[] = ["en", "ko", "zh-CN"];
const clarification = { en: "Which name, cadence, start time and timezone? Which Alex do you mean?",
  ko: "이름, 교대 주기, 시작 시각과 시간대를 알려주세요. 어느 Alex인가요?",
  "zh-CN": "请指定名称、周期、开始时间和时区。请选择哪个 Alex。" };
const summary = { en: "Review the proposed settings before approving.", ko: "승인 전에 설정 변경안을 확인해 주세요.", "zh-CN": "批准前请检查设置变更方案。" };
const call = (name: string, args: unknown = {}) => ({ type: "function_call", name, call_id: randomUUID(), arguments: JSON.stringify(args) });

describe("multilingual settings transport and validation (mock model; not a language-quality benchmark)", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.roles.mockResolvedValue(["project_owner"]); });
  for (const locale of locales) for (const scenario of settingsEvaluationCases) {
    it(`${locale}: ${scenario.id}`, async () => {
      const actor = randomUUID();
      mocks.findUnique.mockResolvedValue(evaluationProject(actor));
      const wanted = scenario.expected(actor);
      if (wanted) mocks.request.mockResolvedValueOnce([call("get_project_settings")]).mockResolvedValueOnce([
        call("prepare_settings_proposal", { goal: scenario.id, summary: summary[locale],
          actions: wanted.map((action, index) => ({ ...action, id: `action-${index}`, label: summary[locale] })) }),
      ]);
      else mocks.request.mockResolvedValueOnce([{ type: "message", content: [{ type: "output_text", text: clarification[locale] }] }]);
      const response = await planCopilotSettings({ locale, workspace_id: evaluationIds.workspace, question: scenario.question[locale], history: scenario.history?.[locale] }, actor);
      assertSettingsEvaluation(response, scenario, locale, actor);
      const messages = (mocks.request.mock.calls[0]![0] as Array<{ role?: string; content: string }>).filter((item) => item.role);
      expect(messages[0]?.content).toContain(`Reply in ${locale}`);
      expect(messages.at(-1)?.content).toBe(scenario.question[locale]);
      if (scenario.history) expect(messages.slice(1, -1)).toEqual(scenario.history[locale]);
    });
  }

  it.each(locales)("%s: server requires explicit duplicate-member selection even if the model picked an ID", async (locale) => {
    const actor = randomUUID();
    mocks.findUnique.mockResolvedValue(evaluationProject(actor));
    const context = await readSettingsContext(evaluationIds.workspace, actor);
    const scenario = settingsEvaluationCases.find((entry) => entry.id === "create-on-call")!;
    const actions = CopilotSettingsDraftSchema.parse({ summary: summary[locale], goal: "schedule", actions: scenario.expected(actor)!.map((action) => ({
      ...action, id: "action", label: summary[locale], input: { ...action.input, rotations: [{ layer: "primary", rotation_type: "weekly", rotation_interval: 1,
        starts_at: "2030-01-07T00:00:00Z", timezone: "Asia/Seoul", participants: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] }] },
    })) }).actions;
    const request = { question: "Alex", locale, workspace_id: evaluationIds.workspace };
    const clarification = clarifyAmbiguousMembers(actions, context, request);
    expect(clarification?.kind).toBe("clarification");
    expect(clarification?.clarification?.fields[0]?.options).toHaveLength(2);
    expect(clarifyAmbiguousMembers(actions, context, { ...request, history: [{ role: "assistant", content: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] })?.kind).toBe("clarification");
    expect(clarifyAmbiguousMembers(actions, context, { ...request, structured_input: { values: { member_0: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } })).toBeNull();
  });
});
