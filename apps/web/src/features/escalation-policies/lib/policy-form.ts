import type {
  EscalationPolicy,
  EscalationTargetType,
  OnCallSchedule,
  Service,
  Team,
  UpsertEscalationPolicyStepRequest,
  User,
} from "@im/contracts";

export const customDelayValue = "custom";
export const defaultStepDelaySeconds = 300;
export const minimumStepDelaySeconds = 60;

export const stepDelayPresets = [
  { label: "After 5 minutes", seconds: 300 },
  { label: "After 10 minutes", seconds: 600 },
  { label: "After 15 minutes", seconds: 900 },
  { label: "After 30 minutes", seconds: 1800 },
  { label: "After 1 hour", seconds: 3600 },
] as const;

export const repeatDelayPresets = [
  { label: "Every 5 minutes", seconds: 300 },
  { label: "Every 10 minutes", seconds: 600 },
  { label: "Every 15 minutes", seconds: 900 },
  { label: "Every 30 minutes", seconds: 1800 },
  { label: "Every 1 hour", seconds: 3600 },
] as const;

export type StepFormState = {
  delaySeconds: number;
  id?: string;
  stepOrder: number;
  targetId: string;
  targetType: EscalationTargetType;
};

export type PolicyFormState = {
  name: string;
  repeatEnabled: boolean;
  repeatIntervalSeconds: number;
  repeatLimit: string;
  steps: StepFormState[];
};

export type StepValidation = {
  delayError: string | undefined;
  targetError: string | undefined;
};

export type PolicyFormValidation = {
  isValid: boolean;
  repeatError: string | undefined;
  stepErrors: StepValidation[];
};

export type RecipientKind = "on_call" | "team" | "user" | "webhook";

export const emptyStepValidation: StepValidation = {
  delayError: undefined,
  targetError: undefined,
};

export function createBlankPolicyForm(scheduleId = ""): PolicyFormState {
  return {
    name: "",
    repeatEnabled: true,
    repeatIntervalSeconds: 600,
    repeatLimit: "3",
    steps: [
      { delaySeconds: 0, stepOrder: 1, targetId: scheduleId, targetType: "primary_on_call" },
      { delaySeconds: 300, stepOrder: 2, targetId: scheduleId, targetType: "secondary_on_call" },
    ],
  };
}

export function validatePolicyForm(form: PolicyFormState, workspaceMemberUserIds: Set<string>): PolicyFormValidation {
  const repeatError = validateRepeatRule(form);
  const stepErrors = form.steps.map((step, index) => validateStep(step, index, workspaceMemberUserIds));

  return {
    isValid: Boolean(form.name.trim())
      && form.steps.length > 0
      && !repeatError
      && stepErrors.every((stepError) => !stepError.delayError && !stepError.targetError),
    repeatError,
    stepErrors,
  };
}

export function toStepRequest(step: StepFormState): UpsertEscalationPolicyStepRequest {
  return {
    ...(step.id ? { id: step.id } : {}),
    delay_seconds: step.delaySeconds,
    step_order: step.stepOrder,
    target_id: step.targetId.trim(),
    target_type: step.targetType,
  };
}

export function formFromPolicy(policy: EscalationPolicy): PolicyFormState {
  return {
    name: policy.name,
    repeatEnabled: policy.repeat_enabled,
    repeatIntervalSeconds: policy.repeat_interval_seconds ?? 600,
    repeatLimit: policy.repeat_limit === null ? "" : String(policy.repeat_limit),
    steps: stepsFromPolicy(policy),
  };
}

export function stepsFromPolicy(policy: EscalationPolicy): StepFormState[] {
  return normalizePolicySteps(policy.steps
    .slice()
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => ({
      delaySeconds: step.delay_seconds,
      id: step.id,
      stepOrder: step.step_order,
      targetId: step.target_id ?? "",
      targetType: step.target_type === "team_channel" ? "webhook" : step.target_type,
    })));
}

export function formatStepTarget(
  step: StepFormState,
  maps: {
    scheduleNameById: Map<string, string>;
    teamNameById: Map<string, string>;
    userNameById: Map<string, string>;
  },
) {
  if (step.targetType === "primary_on_call" || step.targetType === "secondary_on_call") {
    const scheduleName = maps.scheduleNameById.get(step.targetId);
    return `${scheduleName ?? "On-call schedule"} · ${formatTargetLayer(step.targetType)}`;
  }

  if (step.targetType === "user") return maps.userNameById.get(step.targetId) ?? "Specific user";
  if (step.targetType === "team") return maps.teamNameById.get(step.targetId) ?? "Team";
  if (step.targetType === "team_channel") return "Webhook";

  return "Webhook";
}

export function createScheduleNameMap(schedules: OnCallSchedule[]) {
  return new Map(schedules.map((schedule) => [schedule.id, schedule.name]));
}

export function createTeamNameMap(teams: Team[]) {
  return new Map(teams.map((team) => [team.id, team.name]));
}

export function createUserNameMap(users: User[]) {
  return new Map(users.map((user) => [user.id, user.name]));
}

export function createServiceCountMap(services: Service[]) {
  const counts = new Map<string, number>();

  for (const service of services) {
    if (!service.escalation_policy_id) continue;
    counts.set(service.escalation_policy_id, (counts.get(service.escalation_policy_id) ?? 0) + 1);
  }

  return counts;
}

export function getRecipientKind(targetType: EscalationTargetType): RecipientKind {
  if (targetType === "primary_on_call" || targetType === "secondary_on_call") return "on_call";
  if (targetType === "team_channel") return "webhook";
  return targetType;
}

export function getDefaultTargetType(recipientKind: RecipientKind): EscalationTargetType {
  if (recipientKind === "on_call") return "primary_on_call";
  return recipientKind;
}

export function formatTargetLayer(targetType: EscalationTargetType): string {
  if (targetType === "primary_on_call") return "Primary responder";
  if (targetType === "secondary_on_call") return "Secondary responder";

  return targetType;
}

export function createNextStep(steps: StepFormState[]): StepFormState {
  const scheduleStep = steps
    .slice()
    .reverse()
    .find((step) => step.targetType === "primary_on_call" || step.targetType === "secondary_on_call");
  const hasPrimary = steps.some((step) => step.targetType === "primary_on_call");

  return {
    delaySeconds: steps.length === 0 ? 0 : defaultStepDelaySeconds,
    stepOrder: steps.length + 1,
    targetId: scheduleStep?.targetId ?? "",
    targetType: hasPrimary ? "secondary_on_call" : "primary_on_call",
  };
}

export function normalizePolicySteps(steps: StepFormState[]): StepFormState[] {
  return steps.map((step, index) => ({
    ...step,
    delaySeconds: index === 0 ? 0 : normalizeStepDelaySeconds(step.delaySeconds),
    stepOrder: index + 1,
  }));
}

export function getDelayPresetValue(value: number, presets: readonly { seconds: number }[]) {
  return presets.some((preset) => preset.seconds === value) ? String(value) : customDelayValue;
}

export function getTargetPlaceholder(targetType: EscalationTargetType) {
  if (targetType === "webhook") return "https://example.com/escalation-webhook";
  if (targetType === "team") return "Select team";

  return "Optional";
}

function validateRepeatRule(form: PolicyFormState) {
  if (!form.repeatEnabled) return undefined;

  if (!Number.isFinite(form.repeatIntervalSeconds) || form.repeatIntervalSeconds < minimumStepDelaySeconds) {
    return "Repeat interval must be at least 1 minute.";
  }

  const repeatLimit = form.repeatLimit.trim();

  if (!repeatLimit) return undefined;

  const repeatLimitValue = Number(repeatLimit);

  if (!Number.isInteger(repeatLimitValue) || repeatLimitValue < 1) {
    return "Repeat limit must be an integer greater than 0, or blank for unlimited.";
  }

  return undefined;
}

function validateStep(step: StepFormState, index: number, workspaceMemberUserIds: Set<string>): StepValidation {
  return {
    delayError: validateStepDelay(step, index),
    targetError: validateStepTarget(step, workspaceMemberUserIds),
  };
}

function validateStepDelay(step: StepFormState, index: number) {
  if (!Number.isFinite(step.delaySeconds) || step.delaySeconds < 0) {
    return "Delay must be 0 or greater.";
  }

  if (index > 0 && step.delaySeconds < minimumStepDelaySeconds) {
    return "Delay must be at least 1 minute after the previous step.";
  }

  return undefined;
}

function validateStepTarget(step: StepFormState, workspaceMemberUserIds: Set<string>) {
  const targetId = step.targetId.trim();

  if (step.targetType === "primary_on_call" || step.targetType === "secondary_on_call") return targetId ? undefined : "Select an on-call schedule.";
  if (step.targetType === "team") return targetId ? undefined : "Select a team target.";
  if (step.targetType === "user") {
    if (!targetId) return "Select a project member target.";

    return workspaceMemberUserIds.has(targetId) ? undefined : "Select a user who accepted this project invite.";
  }

  return isHttpUrl(targetId) ? undefined : "Enter an HTTP or HTTPS webhook URL.";
}

function isHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function normalizeStepDelaySeconds(delaySeconds: number) {
  if (!Number.isFinite(delaySeconds) || delaySeconds < minimumStepDelaySeconds) {
    return defaultStepDelaySeconds;
  }

  return delaySeconds;
}
