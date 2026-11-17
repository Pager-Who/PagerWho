import "dotenv/config";
import { randomUUID } from "node:crypto";

import type { CopilotLocale } from "@im/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the database/auth boundary is mocked. Model client, prompts, tools and validation are real.
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), roles: vi.fn(), assertMember: vi.fn(), outputs: [] as unknown[] }));
vi.mock("./model-client", async (original) => {
  const client = await original<typeof import("./model-client")>();
  return { ...client, requestCopilotModel: async (...args: Parameters<typeof client.requestCopilotModel>) => {
    const output = await client.requestCopilotModel(...args);
    mocks.outputs.push(output);
    return output;
  } };
});
vi.mock("@im/db", async () => ({ prisma: { workspace: { findUnique: mocks.findUnique },
  copilotProposal: (await import("./copilot-proposals.fixtures")).fakeCopilotProposalStore() } }));
vi.mock("./copilot-usage", () => ({ reserveCopilotRequest: vi.fn(), assertCopilotTokenBudget: vi.fn(), recordCopilotTokens: vi.fn(), recordOutOfScope: vi.fn() }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.assertMember, listMemberRoleKeys: mocks.roles })),
}));

import { planCopilotSettings } from "./copilot-settings";
import * as modelClient from "./model-client";
import { assertSettingsEvaluation } from "./copilot-settings.assertions";
import { evaluationIds, evaluationProject, settingsEvaluationCases } from "./copilot-settings.cases";

describe.skipIf(process.env.COPILOT_LIVE_TESTS !== "true").sequential("live Copilot model multilingual settings evaluation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.outputs = []; expect(modelClient.isCopilotConfigured(), "Configure COPILOT_* in apps/api/.env").toBe(true); mocks.roles.mockResolvedValue(["project_owner"]); });
  for (const locale of ["en", "ko", "zh-CN"] satisfies CopilotLocale[]) for (const scenario of settingsEvaluationCases) {
    it(`${locale}: ${scenario.id}`, async () => {
      const actor = randomUUID();
      mocks.findUnique.mockResolvedValue(evaluationProject(actor));
      try {
        const response = await planCopilotSettings({ locale, question: scenario.question[locale], workspace_id: evaluationIds.workspace, history: scenario.history?.[locale] }, actor);
        assertSettingsEvaluation(response, scenario, locale, actor);
      }
      catch (error) {
        // All data in this file is synthetic. Never use this trace mechanism with real project data.
        throw new Error(`${error instanceof Error ? error.message : "Assertion failed"}\nSynthetic model trace: ${JSON.stringify(mocks.outputs)}`, { cause: error });
      }
      const settingsReads = mocks.outputs.flatMap((output) => Array.isArray(output) ? output as Array<{ type?: string; name?: string }> : [])
        .filter((item) => item?.type === "function_call" && item.name === "get_project_settings");
      expect(mocks.findUnique).toHaveBeenCalledTimes(settingsReads.length ? 1 : 0);
    }, 60_000);
  }
});
