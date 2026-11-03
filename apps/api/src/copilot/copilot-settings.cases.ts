import type { CopilotConversationMessage, CopilotLocale } from "@im/contracts";

export const evaluationIds = {
  workspace: "22222222-2222-4222-8222-222222222222",
  mina: "33333333-3333-4333-8333-333333333333",
  service: "44444444-4444-4444-8444-444444444444",
  policy: "55555555-5555-4555-8555-555555555555",
  schedule: "66666666-6666-4666-8666-666666666666",
  rotation: "77777777-7777-4777-8777-777777777777",
  step: "88888888-8888-4888-8888-888888888888",
};

export function evaluationProject(actorUserId: string) {
  return {
    id: evaluationIds.workspace, name: "Synthetic evaluation project",
    members: [
      { user: { id: actorUserId, name: "Jordan" } },
      { user: { id: evaluationIds.mina, name: "Mina" } },
      { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Alex" } },
      { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Alex" } },
    ],
    teams: [],
    services: [{ id: evaluationIds.service, name: "checkout", description: "Keep this description", teamId: null,
      escalationPolicyId: null, updatedAt: new Date("2026-01-01T00:00:00Z") }],
    schedules: [{ id: evaluationIds.schedule, name: "existing-primary", timezone: "Asia/Seoul", teamId: null, serviceId: null,
      updatedAt: new Date("2026-01-01T00:00:00Z"), rotations: [{ id: evaluationIds.rotation, layer: "primary" as const,
        rotationType: "weekly" as const, rotationInterval: 1, startsAt: new Date("2030-01-07T00:00:00Z"), timezone: "Asia/Seoul",
        participants: [{ userId: actorUserId, position: 0 }, { userId: evaluationIds.mina, position: 1 }] }] }],
    escalationPolicies: [{ id: evaluationIds.policy, name: "checkout-policy", updatedAt: new Date("2026-01-01T00:00:00Z"),
      repeatEnabled: false, repeatIntervalSeconds: null, repeatLimit: null,
      steps: [{ id: evaluationIds.step, stepOrder: 1, delaySeconds: 0, targetType: "user" as const, targetId: actorUserId }] }],
  };
}

type Localized = Record<CopilotLocale, string>;
type ExpectedAction = { type: string; input: Record<string, unknown>; [key: string]: unknown };
export type SettingsEvaluationCase = {
  id: string;
  question: Localized;
  history?: Record<CopilotLocale, CopilotConversationMessage[]>;
  expected: (actorUserId: string) => ExpectedAction[] | null;
  clarificationTopic?: Record<CopilotLocale, RegExp>;
};

const scheduleInput = (actor: string, startsAt = "2030-01-07T00:00:00Z") => ({
  workspace_id: evaluationIds.workspace, name: "primary-weekly", timezone: "Asia/Seoul",
  rotations: [{ layer: "primary", rotation_type: "weekly", rotation_interval: 1, starts_at: startsAt,
    timezone: "Asia/Seoul", participants: [actor, evaluationIds.mina] }],
});

export const settingsEvaluationCases: SettingsEvaluationCase[] = [
  {
    id: "create-service",
    question: { en: "Create a service named checkout-test. No description, owner team or escalation policy.",
      ko: "checkout-test 서비스를 만들어줘. 설명, 소유 팀, 에스컬레이션 정책은 지정하지 않을게.",
      "zh-CN": "创建一个名为 checkout-test 的服务，不设置描述、所属团队或升级策略。" },
    expected: () => [{ type: "create_service", input: { workspace_id: evaluationIds.workspace, name: "checkout-test" } }],
  },
  {
    id: "rename-service-preserve-fields",
    question: { en: "Rename the existing checkout service to checkout-v2. Change only its name.",
      ko: "기존 checkout 서비스 이름만 checkout-v2로 바꿔줘. 다른 설정은 유지해줘.",
      "zh-CN": "仅将现有 checkout 服务重命名为 checkout-v2，保留其他设置。" },
    expected: () => [{ type: "update_service", service_id: evaluationIds.service, input: { name: "checkout-v2" } }],
  },
  {
    id: "create-on-call",
    question: { en: "Create primary on-call schedule primary-weekly: me then Mina, weekly rotation every 1 week, starting 2030-01-07 at 09:00 Asia/Seoul. No secondary, team or service connection.",
      ko: "primary-weekly 온콜 스케줄을 만들어줘. Primary에 나, Mina 순서로 1주마다 교대하고, Asia/Seoul 기준 2030-01-07 오전 9시에 시작해줘. Secondary, 팀, 서비스 연결은 없어.",
      "zh-CN": "创建值班排班 primary-weekly：仅 primary 层，按我、Mina 的顺序每 1 周轮换，2030-01-07 09:00 Asia/Seoul 开始。不设置 secondary、团队或服务关联。" },
    expected: (actor) => [{ type: "create_on_call_schedule", input: scheduleInput(actor) }],
  },
  {
    id: "attach-existing-policy",
    question: { en: "Connect checkout to the existing checkout-policy escalation policy. Do not create a new policy or schedule.",
      ko: "checkout 서비스에 기존 checkout-policy 에스컬레이션 정책을 연결해줘. 새 정책이나 스케줄을 만들지는 마.",
      "zh-CN": "将 checkout 服务连接到现有升级策略 checkout-policy。不要创建新策略或排班。" },
    expected: () => [{ type: "update_service", service_id: evaluationIds.service, input: { escalation_policy_id: evaluationIds.policy } }],
  },
  {
    id: "missing-on-call-details",
    question: { en: "Create a new on-call schedule for me and Mina. I have not decided its name, cadence, start time or timezone yet.",
      ko: "나랑 Mina가 참여하는 새 온콜 스케줄 만들어줘. 이름, 교대 주기, 시작 시각, 시간대는 아직 정하지 않았어.",
      "zh-CN": "为我和 Mina 创建新值班排班。名称、轮换周期、开始时间和时区还未确定。" },
    expected: () => null,
    clarificationTopic: { en: /name|cadence|start|timezone|time zone/i, ko: /이름|주기|시작|시간대/, "zh-CN": /名称|周期|开始|时区/ },
  },
  {
    id: "ambiguous-member",
    question: { en: "Create primary on-call schedule alex-weekly for Alex only, every 1 week, starting 2030-01-07 09:00 Asia/Seoul.",
      ko: "Alex 한 명으로 alex-weekly Primary 온콜을 만들어줘. 1주 교대, Asia/Seoul 2030-01-07 오전 9시 시작이야.",
      "zh-CN": "仅为 Alex 创建 primary 排班 alex-weekly，每 1 周轮换，2030-01-07 09:00 Asia/Seoul 开始。" },
    expected: () => null,
    clarificationTopic: { en: /Alex/i, ko: /Alex|알렉스/i, "zh-CN": /Alex|亚历克斯/i },
  },
  {
    id: "correct-start-time",
    history: {
      en: [{ role: "user", content: "Create a schedule named primary-weekly, primary only, me then Mina, every 1 week, starting 2030-01-07 09:00 Asia/Seoul; no team or service connection." }, { role: "assistant", content: "I will prepare the schedule for review." }],
      ko: [{ role: "user", content: "primary-weekly 스케줄, Primary만 나와 Mina 순서, 1주 교대, 2030-01-07 오전 9시 Asia/Seoul 시작으로 만들어줘. 팀과 서비스 연결은 없어." }, { role: "assistant", content: "검토할 스케줄 변경안을 준비하겠습니다." }],
      "zh-CN": [{ role: "user", content: "创建 primary-weekly，仅 primary，按我、Mina 顺序每 1 周轮换，2030-01-07 09:00 Asia/Seoul 开始；无团队和服务关联。" }, { role: "assistant", content: "我会准备排班方案供你审核。" }],
    },
    question: { en: "Correction: start at 10:00, not 09:00, on that date. Keep everything else.",
      ko: "정정할게. 그날 오전 9시 말고 오전 10시에 시작해줘. 나머지는 그대로야.",
      "zh-CN": "更正：当天不是 09:00，而是 10:00 开始。其他设置保持不变。" },
    expected: (actor) => [{ type: "create_on_call_schedule", input: scheduleInput(actor, "2030-01-07T01:00:00Z") }],
  },
  {
    id: "create-escalation-policy",
    question: { en: "Create escalation policy response-policy: step 1 notify me immediately, step 2 notify Mina after 300 seconds. Disable repeat. Do not connect it to any service.",
      ko: "response-policy 에스컬레이션 정책을 만들어줘. 1단계는 나에게 즉시, 2단계는 300초 후 Mina에게 알림. 반복은 끄고 서비스에는 연결하지 마.",
      "zh-CN": "创建升级策略 response-policy：第 1 步立即通知我，第 2 步延迟 300 秒通知 Mina。关闭重复，不关联服务。" },
    expected: (actor) => [{ type: "create_escalation_policy", input: { workspace_id: evaluationIds.workspace, name: "response-policy", repeat_enabled: false,
      steps: [{ step_order: 1, delay_seconds: 0, target_type: "user", target_id: actor }, { step_order: 2, delay_seconds: 300, target_type: "user", target_id: evaluationIds.mina }] } }],
  },
  {
    id: "rename-schedule-preserve-rotation",
    question: { en: "Rename existing-primary to ops-primary. Keep its timezone and every rotation setting unchanged.",
      ko: "existing-primary 스케줄 이름만 ops-primary로 변경해줘. 시간대와 모든 로테이션 설정은 그대로 유지해줘.",
      "zh-CN": "仅将排班 existing-primary 重命名为 ops-primary，保留时区及所有轮换设置。" },
    expected: () => [{ type: "update_on_call_schedule", schedule_id: evaluationIds.schedule, input: { name: "ops-primary" } }],
  },
  {
    id: "rename-policy-preserve-steps",
    question: { en: "Rename checkout-policy to ops-policy. Keep repeat and all notification steps unchanged.",
      ko: "checkout-policy 이름만 ops-policy로 바꿔줘. 반복과 알림 단계는 전부 유지해줘.",
      "zh-CN": "仅将 checkout-policy 重命名为 ops-policy，保留重复设置及所有通知步骤。" },
    expected: () => [{ type: "update_escalation_policy", policy_id: evaluationIds.policy, input: { name: "ops-policy" } }],
  },
];
