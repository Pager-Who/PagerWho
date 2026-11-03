import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopilotSettingsDraftSchema } from "@im/contracts";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./model-client", () => ({ requestCopilotModel: mocks.request }));
import { reviewSettingsDraft } from "./copilot-review";
import { settingsEvaluationCases } from "./copilot-settings.cases";
describe("settings review boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  const candidate = { summary: "Review", goal: "create", actions: [{ id: "create", label: "Create", type: "create_service", input: { name: "test", workspace_id: "22222222-2222-4222-8222-222222222222" } }] };
  const reviewedCall = (args: string) => [{ type: "function_call", name: "review_settings_proposal", arguments: args }];
  function reviewValues(draft: unknown) {
    const values: Record<string, unknown> = {};
    let index = 0;
    const collect = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (typeof value === "object" && value !== null) Object.values(value).forEach(collect);
      else if (value !== undefined) values[`field_${index++}`] = value;
    };
    const parsed = CopilotSettingsDraftSchema.parse(draft);
    collect(parsed);
    parsed.actions.forEach((_, actionIndex) => { values[`keep_action_${actionIndex}`] = true; });
    return values;
  }

  it.each([1, "1"])("corrects a schedule start time with rotation interval %j while preserving its structure", async (interval) => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const action = CopilotSettingsDraftSchema.parse({ summary: "검토", goal: "생성", actions: [
      { ...settingsEvaluationCases.find((entry) => entry.id === "create-on-call")!.expected(actor)![0]!, id: "schedule", label: "생성" },
    ] }).actions[0]!;
    const draft = { summary: "검토", goal: "온콜 생성", actions: [{ ...action, id: "schedule", label: "생성" }] };
    mocks.request.mockImplementation(async (input, tools, _signal, requiredTool) => {
      const payload = JSON.parse(input[1].content);
      const fields = payload.fields as Record<string, { path: string; value: unknown }>;
      const values = reviewValues(draft);
      const startKey = Object.keys(fields).find((key) => fields[key]!.path === "actions.0.input.rotations.0.starts_at")!;
      const intervalKey = Object.keys(fields).find((key) => fields[key]!.path === "actions.0.input.rotations.0.rotation_interval")!;
      values[startKey] = "2030-01-07T10:00:00+09:00";
      values[intervalKey] = interval;
      expect(requiredTool).toBe("review_settings_proposal");
      expect(Object.keys(tools[0].parameters.properties)).not.toContain("actions");
      expect(Object.values(values).every((value) => value === null || typeof value !== "object")).toBe(true);
      return reviewedCall(JSON.stringify(values));
    });
    const result = await reviewSettingsDraft(draft, { question: "시작 시간을 오전 10시로 수정", locale: "ko" }, actor, {}, {}, AbortSignal.timeout(1000));
    const corrected = result.actions[0]!;
    if (corrected.type !== "create_on_call_schedule" || action.type !== "create_on_call_schedule") throw new Error("Invalid fixture");
    expect(result.actions).toHaveLength(1);
    expect(corrected.input.rotations[0]!.starts_at).toBe("2030-01-07T01:00:00.000Z");
    expect(corrected.input.rotations[0]!.rotation_interval).toBe(1);
    expect(corrected.input.rotations[0]!.participants).toEqual(action.input.rotations[0]!.participants);
  });

  it.each(["", " ", "1 week", "0x1", "Infinity", "1e999", true, "-1", "1.5"])("rejects invalid or out-of-contract numeric review value %j", async (interval) => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const draft = { summary: "Review", goal: "create", actions: [
      { ...settingsEvaluationCases.find((entry) => entry.id === "create-on-call")!.expected(actor)![0]!, id: "schedule", label: "Create" },
    ] };
    mocks.request.mockImplementation(async (input) => {
      const fields = JSON.parse(input[1].content).fields as Record<string, { path: string }>;
      const key = Object.keys(fields).find((entry) => fields[entry]!.path.endsWith(".rotation_interval"))!;
      return reviewedCall(JSON.stringify({ ...reviewValues(draft), [key]: interval }));
    });
    await expect(reviewSettingsDraft(draft, { question: "create schedule" }, actor, {}, {}, AbortSignal.timeout(1000)))
      .rejects.toThrow("Review returned invalid tool arguments");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    const retryInput = mocks.request.mock.calls[1]![0];
    expect(retryInput.at(-1).content).toContain("rotation_interval");
  });

  it("preserves numeric-looking text fields as strings", async () => {
    const draft = { ...candidate, actions: [{ ...candidate.actions[0]!, input: { ...candidate.actions[0]!.input, name: "123" } }] };
    mocks.request.mockResolvedValue(reviewedCall(JSON.stringify(reviewValues(draft))));
    const result = await reviewSettingsDraft(draft, { question: "create service named 123" }, "actor", {}, {}, AbortSignal.timeout(1000));
    expect(result.actions[0]!.input).toMatchObject({ name: "123" });
  });

  it("accepts quoted policy booleans and numbers without treating false as truthy", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const draft = { summary: "Review", goal: "create", actions: [
      { ...settingsEvaluationCases.find((entry) => entry.id === "create-escalation-policy")!.expected(actor)![0]!, id: "policy", label: "Create" },
    ] };
    const values = reviewValues(draft);
    for (const key of Object.keys(values)) if (typeof values[key] === "number" || typeof values[key] === "boolean") values[key] = String(values[key]);
    mocks.request.mockResolvedValue(reviewedCall(JSON.stringify(values)));
    const result = await reviewSettingsDraft(draft, { question: "Create response-policy, disable repeat" }, actor, {}, {}, AbortSignal.timeout(1000));
    const action = result.actions[0]!;
    if (action.type !== "create_escalation_policy") throw new Error("Invalid fixture");
    expect(action.input.repeat_enabled).toBe(false);
    expect(action.input.steps.map((step) => [step.step_order, step.delay_seconds])).toEqual([[1, 0], [2, 300]]);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  function policyDraft() {
    const actor = "11111111-1111-4111-8111-111111111111";
    const expected = settingsEvaluationCases.find((entry) => entry.id === "create-escalation-policy")!.expected(actor)![0]!;
    const draft = { summary: "Review", goal: "create", actions: [{ ...expected, id: "policy", label: "Create",
      input: { ...expected.input, repeat_interval_seconds: null, repeat_limit: null } }] };
    return { actor, draft };
  }

  it("preserves null repeat options when review returns empty strings", async () => {
    const { actor, draft } = policyDraft();
    mocks.request.mockImplementation(async (input) => {
      const fields = JSON.parse(input[1].content).fields as Record<string, { path: string }>;
      const values = reviewValues(draft);
      for (const [key, field] of Object.entries(fields)) if (/\.(repeat_interval_seconds|repeat_limit)$/.test(field.path)) values[key] = "";
      return reviewedCall(JSON.stringify(values));
    });
    const result = await reviewSettingsDraft(draft, { question: "Create policy, disable repeat" }, actor, {}, {}, AbortSignal.timeout(1000));
    expect(result.actions[0]!.input).toMatchObject({ repeat_enabled: false, repeat_interval_seconds: null, repeat_limit: null });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("retries an invented user target ID and accepts only an exact project member ID", async () => {
    const { actor, draft } = policyDraft();
    const settings = { members: [{ id: actor }, { id: "33333333-3333-4333-8333-333333333333" }] };
    mocks.request.mockImplementationOnce(async (input) => {
      const fields = JSON.parse(input[1].content).fields as Record<string, { path: string }>;
      const key = Object.keys(fields).find((entry) => fields[entry]!.path === "actions.0.input.steps.0.target_id")!;
      return reviewedCall(JSON.stringify({ ...reviewValues(draft), [key]: "11111111-1111-4111-8111-111111111112" }));
    }).mockResolvedValueOnce(reviewedCall(JSON.stringify(reviewValues(draft))));
    const result = await reviewSettingsDraft(draft, { question: "Notify me then Mina" }, actor, settings, {}, AbortSignal.timeout(1000));
    const action = result.actions[0]!;
    if (action.type !== "create_escalation_policy") throw new Error("Invalid fixture");
    expect(action.input.steps[0]!.target_id).toBe(actor);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[1]![0].at(-1).content).toContain("must exactly match a member ID");
  });

  it("rejects repeated invalid target IDs instead of guessing a replacement", async () => {
    const { actor, draft } = policyDraft();
    const settings = { members: [{ id: "99999999-9999-4999-8999-999999999999" }] };
    mocks.request.mockResolvedValue(reviewedCall(JSON.stringify(reviewValues(draft))));
    await expect(reviewSettingsDraft(draft, { question: "Notify me" }, actor, settings, {}, AbortSignal.timeout(1000)))
      .rejects.toThrow("Review returned invalid tool arguments");
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it("normalizes empty originally-null connection IDs but preserves literal text", async () => {
    const draft = { ...candidate, actions: [{ ...candidate.actions[0]!, input: {
      ...candidate.actions[0]!.input, description: "false", team_id: null, escalation_policy_id: null,
    } }] };
    mocks.request.mockImplementation(async (input) => {
      const fields = JSON.parse(input[1].content).fields as Record<string, { path: string }>;
      const values = reviewValues(draft);
      for (const [key, field] of Object.entries(fields)) if (/\.(team_id|escalation_policy_id)$/.test(field.path)) values[key] = "";
      return reviewedCall(JSON.stringify(values));
    });
    const result = await reviewSettingsDraft(draft, { question: "Create test, no team or escalation policy" }, "actor", {}, {}, AbortSignal.timeout(1000));
    expect(result.actions[0]!.input).toMatchObject({ description: "false", team_id: null, escalation_policy_id: null });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("rejects empty connection IDs when they would clear an existing selection", async () => {
    const draft = { ...candidate, actions: [{ ...candidate.actions[0]!, input: {
      ...candidate.actions[0]!.input, team_id: "99999999-9999-4999-8999-999999999999",
    } }] };
    mocks.request.mockImplementation(async (input) => {
      const fields = JSON.parse(input[1].content).fields as Record<string, { path: string }>;
      const key = Object.keys(fields).find((entry) => fields[entry]!.path.endsWith(".team_id"))!;
      return reviewedCall(JSON.stringify({ ...reviewValues(draft), [key]: "" }));
    });
    await expect(reviewSettingsDraft(draft, { question: "Create test with the specified team" }, "actor", {}, {}, AbortSignal.timeout(1000)))
      .rejects.toThrow("Review returned invalid tool arguments");
  });

  it.each(["", "0", "1", "False", "yes", 0, 1])("rejects ambiguous boolean value %j", async (value) => {
    mocks.request.mockResolvedValue(reviewedCall(JSON.stringify({ ...reviewValues(candidate), keep_action_0: value })));
    await expect(reviewSettingsDraft(candidate, { question: "create test" }, "actor", {}, {}, AbortSignal.timeout(1000)))
      .rejects.toThrow("Review returned invalid tool arguments");
  });

  it("rejects unknown nested fields and incomplete scalar reviews", async () => {
    mocks.request.mockResolvedValueOnce(reviewedCall(JSON.stringify({ ...reviewValues(candidate), actions: [] })))
      .mockResolvedValueOnce(reviewedCall(JSON.stringify({ keep_action_0: true })));
    await expect(reviewSettingsDraft(candidate, { question: "create test" }, "actor", {}, {}, AbortSignal.timeout(1000)))
      .rejects.toThrow("Review returned invalid tool arguments");
  });

  it("removes an unrequested action without allowing the reviewer to append actions", async () => {
    const draft = { ...candidate, actions: [...candidate.actions, { ...candidate.actions[0]!, id: "extra", input: { ...candidate.actions[0]!.input, name: "unrequested" } }] };
    mocks.request.mockResolvedValue(reviewedCall(JSON.stringify({ ...reviewValues(draft), keep_action_1: false })));
    const result = await reviewSettingsDraft(draft, { question: "create test" }, "actor", {}, {}, AbortSignal.timeout(1000));
    expect(result.actions).toEqual(CopilotSettingsDraftSchema.parse(candidate).actions);
  });

  it("retries malformed review JSON without replaying it or asking for missing settings", async () => {
    const malformed = JSON.stringify(candidate).slice(0, -1) + "]}";
    expect(() => JSON.parse(malformed)).toThrow();
    mocks.request.mockResolvedValueOnce(reviewedCall(malformed)).mockResolvedValueOnce(reviewedCall(JSON.stringify(reviewValues(candidate))));
    const result = await reviewSettingsDraft(candidate, { question: "create test" }, "actor", {}, {}, AbortSignal.timeout(1000));
    expect(result.actions).toEqual(CopilotSettingsDraftSchema.parse(candidate).actions);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    const retryInput = mocks.request.mock.calls[1]![0];
    expect(JSON.stringify(retryInput)).not.toContain(malformed);
    expect(retryInput.at(-1).content).toContain("not missing user information");
  });

  it("rejects repeated malformed review output without returning an unreviewed candidate", async () => {
    mocks.request.mockResolvedValue(reviewedCall("{invalid"));
    await expect(reviewSettingsDraft(candidate, { question: "create test" }, "actor", {}, {}, AbortSignal.timeout(1000)))
      .rejects.toThrow("Review returned invalid tool arguments");
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
  it("uses corrected tool arguments and requires localized review", async () => {
    mocks.request.mockResolvedValue(reviewedCall(JSON.stringify(reviewValues({ summary: "请审核", goal: "创建服务", actions: [{ id: "create", label: "创建", type: "create_service", input: { name: "test", workspace_id: "22222222-2222-4222-8222-222222222222" } }] }))));
    const candidate = { summary: "Review", goal: "create", actions: [{ id: "create", label: "Create", type: "create_service", input: { name: "test", workspace_id: "22222222-2222-4222-8222-222222222222" } }] };
    const result = await reviewSettingsDraft(candidate, { question: "创建服务", locale: "zh-CN" }, "actor", {}, {}, AbortSignal.timeout(1000));
    expect(result.actions).toHaveLength(1);
    expect(result.summary).toBe("请审核");
    expect(mocks.request.mock.calls[0]?.[0]?.[0]?.content).toContain("简体中文");
  });
  it("rejects free text instead of an executable proposal", async () => {
    mocks.request.mockResolvedValue([{ type: "message", content: [] }]);
    await expect(reviewSettingsDraft(candidate, { question: "create" }, "actor", {}, {}, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});
