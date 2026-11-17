import { randomUUID } from "node:crypto";

import { CopilotProposalSchema, CopilotSettingsDraftSchema, type CopilotAskResponse } from "@im/contracts";
import { describe, expect, it } from "vitest";

import { assertSettingsEvaluation } from "./copilot-settings.assertions";
import { evaluationIds, settingsEvaluationCases } from "./copilot-settings.cases";

const actor = randomUUID();
function responseFor(id: string) {
  const scenario = settingsEvaluationCases.find((entry) => entry.id === id)!;
  const response: CopilotAskResponse = {
    answer: "Review the settings before approval.", kind: "proposal", mode: "ai", sources: [],
    proposal: CopilotProposalSchema.parse({ id: randomUUID(), goal: id, summary: "Review settings",
      actions: scenario.expected(actor)!.map((action, index) => ({ ...action, id: `action-${index}`, label: "Review" })),
      workspace_id: evaluationIds.workspace }),
  };
  return { scenario, response };
}

describe("semantic evaluation assertions", () => {
  it.each(["create-service", "create-on-call", "create-escalation-policy"])("normalizes an explicit action-level project ID for %s", (id) => {
    const { response } = responseFor(id);
    const action = response.proposal!.actions[0]!;
    const { workspace_id, ...input } = action.input as Record<string, unknown>;
    expect(workspace_id).toBe(evaluationIds.workspace);
    const parsed = CopilotSettingsDraftSchema.parse({ goal: "create", summary: "Review", actions: [{ ...action, input, workspace_id }] });
    const expectedInput = action.type === "create_on_call_schedule"
      ? { ...action.input, rotations: action.input.rotations.map((rotation) => ({ ...rotation, starts_at: "2030-01-07T00:00:00.000Z" })) }
      : action.input;
    expect(parsed.actions[0]!.input).toEqual(expectedInput);
  });

  it("rejects conflicting project IDs and does not invent a missing schedule project ID", () => {
    const { response } = responseFor("create-on-call");
    const action = response.proposal!.actions[0]!;
    if (action.type !== "create_on_call_schedule") throw new Error("Invalid fixture");
    const draft = (entry: unknown) => ({ goal: "create", summary: "Review", actions: [entry] });
    expect(CopilotSettingsDraftSchema.safeParse(draft({ ...action, workspace_id: randomUUID() })).success).toBe(false);
    const { workspace_id: _workspaceId, ...input } = action.input as Record<string, unknown>;
    expect(CopilotSettingsDraftSchema.safeParse(draft({ ...action, input })).success).toBe(false);
    expect(CopilotSettingsDraftSchema.safeParse(draft({ ...action, input, workspace_id: "invalid" })).success).toBe(false);
    expect(CopilotSettingsDraftSchema.parse(draft({ ...action, workspace_id: evaluationIds.workspace })).actions[0]!.input).toEqual({
      ...action.input,
      rotations: action.input.rotations.map((rotation) => ({ ...rotation, starts_at: "2030-01-07T00:00:00.000Z" })),
    });
  });

  it("normalizes explicit model timezone offsets before REST validation and rejects missing offsets", () => {
    const { response } = responseFor("create-on-call");
    const action = response.proposal!.actions[0]!;
    if (action.type !== "create_on_call_schedule") throw new Error("Invalid fixture");
    action.input.rotations[0]!.starts_at = "2030-01-07T09:00:00+09:00";
    const parsed = CopilotSettingsDraftSchema.parse({ goal: "create", summary: "Review", actions: [action] });
    const normalized = parsed.actions[0]!;
    if (normalized.type !== "create_on_call_schedule") throw new Error("Invalid fixture");
    expect(normalized.input.rotations[0]!.starts_at).toBe("2030-01-07T00:00:00.000Z");
    action.input.rotations[0]!.starts_at = "2030-01-07T09:00:00";
    expect(CopilotSettingsDraftSchema.safeParse({ goal: "create", summary: "Review", actions: [action] }).success).toBe(false);
  });
  it("accepts equivalent timezone representations but rejects the wrong instant", () => {
    const { scenario, response } = responseFor("create-on-call");
    const action = response.proposal!.actions[0]!;
    if (action.type !== "create_on_call_schedule") throw new Error("Invalid fixture");
    action.input.rotations[0]!.starts_at = "2030-01-07T09:00:00+09:00";
    expect(() => assertSettingsEvaluation(response, scenario, "en", actor)).not.toThrow();
    action.input.rotations[0]!.starts_at = "2030-01-07T09:00:00Z";
    expect(() => assertSettingsEvaluation(response, scenario, "en", actor)).toThrow();
  });

  it("rejects reversed participant order", () => {
    const { scenario, response } = responseFor("create-on-call");
    const action = response.proposal!.actions[0]!;
    if (action.type !== "create_on_call_schedule") throw new Error("Invalid fixture");
    action.input.rotations[0]!.participants.reverse();
    expect(() => assertSettingsEvaluation(response, scenario, "en", actor)).toThrow();
  });

  it("rejects unintended changes during a rename", () => {
    const { scenario, response } = responseFor("rename-service-preserve-fields");
    const action = response.proposal!.actions[0]!;
    if (action.type !== "update_service") throw new Error("Invalid fixture");
    action.input.description = null;
    expect(() => assertSettingsEvaluation(response, scenario, "en", actor)).toThrow();
  });

  it("rejects an answer in the wrong language", () => {
    const { scenario, response } = responseFor("create-service");
    expect(() => assertSettingsEvaluation(response, scenario, "ko", actor)).toThrow();
    expect(() => assertSettingsEvaluation(response, scenario, "zh-CN", actor)).toThrow();
  });
});
