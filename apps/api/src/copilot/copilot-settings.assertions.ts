import type { CopilotAskResponse, CopilotLocale } from "@im/contracts";
import { expect } from "vitest";

import { evaluationProject, type SettingsEvaluationCase } from "./copilot-settings.cases";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "id")
    .map(([key, entry]) => [key, key === "starts_at" && typeof entry === "string" ? new Date(entry).toISOString() : normalize(entry)]));
  return value;
}

export function assertSettingsEvaluation(response: CopilotAskResponse, scenario: SettingsEvaluationCase, locale: CopilotLocale, actor: string) {
  const expected = scenario.expected(actor);
  expect(response.answer.trim().length).toBeGreaterThan(0);
  if (locale === "ko") expect(response.answer).toMatch(/[가-힣]/);
  else if (locale === "zh-CN") expect(response.answer).toMatch(/[\u4e00-\u9fff]/);
  else { expect(response.answer).toMatch(/[a-z]/i); expect(response.answer).not.toMatch(/[가-힣\u4e00-\u9fff]/); }

  if (expected === null) {
    expect(["message", "clarification"]).toContain(response.kind);
    expect(response.proposal).toBeUndefined();
    expect(response.answer).toMatch(scenario.clarificationTopic![locale]);
    return;
  }
  expect(response.kind).toBe("proposal");
  expect(response.proposal?.actions).toHaveLength(expected.length);
  for (const [index, wanted] of expected.entries()) {
    const actual = response.proposal!.actions[index]!;
    expect(actual.type).toBe(wanted.type);
    for (const [key, value] of Object.entries(wanted)) {
      if (key !== "input") expect(actual).toHaveProperty(key, value);
    }
    expect(normalize(actual.input)).toMatchObject(normalize(wanted.input) as object);
    const project = evaluationProject(actor);
    let baseline: Record<string, unknown> | undefined;
    if (actual.type === "update_service") baseline = { name: "checkout", description: "Keep this description", team_id: null, escalation_policy_id: null };
    if (actual.type === "update_on_call_schedule") baseline = {
      name: "existing-primary", timezone: "Asia/Seoul", team_id: null, service_id: null,
      rotations: project.schedules[0]!.rotations.map((rotation) => ({ layer: rotation.layer, rotation_type: rotation.rotationType,
        rotation_interval: rotation.rotationInterval, starts_at: rotation.startsAt.toISOString(), timezone: rotation.timezone,
        participants: rotation.participants.map((participant) => participant.userId) })),
    };
    if (actual.type === "update_escalation_policy") baseline = { name: "checkout-policy", repeat_enabled: false, repeat_interval_seconds: null, repeat_limit: null,
      steps: [{ step_order: 1, delay_seconds: 0, target_type: "user", target_id: actor }] };
    if (baseline) expect(normalize({ ...baseline, ...actual.input })).toEqual(normalize({ ...baseline, ...wanted.input }));
    if (actual.type === "create_service") {
      expect(actual.input.description ?? null).toBeNull();
      expect(actual.input.team_id ?? null).toBeNull();
      expect(actual.input.escalation_policy_id ?? null).toBeNull();
    }
  }
}
