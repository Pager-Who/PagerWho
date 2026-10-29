import type { EscalationTargetType, OnCallSchedule, Team, User } from "@im/contracts";

import { Button, Field, Panel, Select, TextInput } from "../../../shared/components";
import {
  getDefaultTargetType,
  getRecipientKind,
  getTargetPlaceholder,
  minimumStepDelaySeconds,
  stepDelayPresets,
  type RecipientKind,
  type StepFormState,
  type StepValidation,
} from "../lib/policy-form";
import { DelayPresetField } from "./DelayPresetField";

type StepEditorProps = {
  disabled: boolean;
  index: number;
  onChange: (step: StepFormState) => void;
  onRemove: () => void;
  schedules: OnCallSchedule[];
  step: StepFormState;
  teams: Team[];
  users: User[];
  validation: StepValidation;
};

export function StepEditor({
  disabled,
  index,
  onChange,
  onRemove,
  step,
  schedules,
  teams,
  users,
  validation,
}: StepEditorProps) {
  const recipientKind = getRecipientKind(step.targetType);

  return (
    <Panel className="grid gap-3 rounded-xl" padding="sm" tone="subtle">
      <div className="flex items-center gap-3 justify-between">
        <strong className="text-ink text-sm leading-[1.3]">Step {index + 1}</strong>
        <Button disabled={disabled} onClick={onRemove} size="sm" variant="ghost">Remove</Button>
      </div>
      <div className="grid items-start gap-3.5 md:grid-cols-2">
        {index === 0 ? (
          <Field label="When">
            <div className="h-10 rounded-md border border-hairline-soft bg-surface-2 px-3 flex items-center">
              <span className="text-ink text-sm font-[650] leading-none">Immediately</span>
            </div>
          </Field>
        ) : (
          <DelayPresetField
            disabled={disabled}
            error={validation.delayError}
            label="When"
            minimumSeconds={minimumStepDelaySeconds}
            onChange={(seconds) => onChange({ ...step, delaySeconds: seconds, stepOrder: index + 1 })}
            presets={stepDelayPresets}
            value={step.delaySeconds}
          />
        )}
        <Field label="Recipient">
          <Select
            disabled={disabled}
            onChange={(event) => onChange({
              ...step,
              targetId: "",
              targetType: getDefaultTargetType(event.target.value as RecipientKind),
            })}
            value={recipientKind}
          >
            <option value="on_call">On-call schedule</option>
            <option value="user">Specific user</option>
            <option value="team">Team</option>
            <option value="webhook">Webhook</option>
          </Select>
        </Field>
        {recipientKind === "on_call" ? (
          <>
            <Field error={validation.targetError} hint="Uses the selected schedule's current responder when the step runs." label="Schedule" required>
              <Select
                aria-invalid={Boolean(validation.targetError)}
                disabled={disabled}
                onChange={(event) => onChange({ ...step, targetId: event.target.value })}
                required
                value={step.targetId}
              >
                <option value="">Select schedule</option>
                {schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>{schedule.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Responder">
              <Select
                disabled={disabled}
                onChange={(event) => onChange({ ...step, targetType: event.target.value as EscalationTargetType })}
                value={step.targetType}
              >
                <option value="primary_on_call">Primary responder</option>
                <option value="secondary_on_call">Secondary responder</option>
              </Select>
            </Field>
          </>
        ) : step.targetType === "team" ? (
          <Field error={validation.targetError} hint="Notify every responder in the selected team through their enabled personal notification routes." label="Team" required>
            <Select
              aria-invalid={Boolean(validation.targetError)}
              disabled={disabled}
              onChange={(event) => onChange({ ...step, targetId: event.target.value })}
              required
              value={step.targetId}
            >
              <option value="">Select team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </Select>
          </Field>
        ) : step.targetType === "user" ? (
          <Field error={validation.targetError} hint="Only accepted project members can be selected." label="Project member" required>
            <Select
              aria-invalid={Boolean(validation.targetError)}
              disabled={disabled || users.length === 0}
              onChange={(event) => onChange({ ...step, targetId: event.target.value })}
              required
              value={step.targetId}
            >
              <option value="">{users.length === 0 ? "No project members available" : "Select project member"}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field error={validation.targetError} hint="Send an escalation event to an external HTTP endpoint." label="Webhook URL" required>
            <TextInput
              aria-invalid={Boolean(validation.targetError)}
              disabled={disabled}
              onChange={(event) => onChange({ ...step, targetId: event.target.value })}
              placeholder={getTargetPlaceholder(step.targetType)}
              required
              type="url"
              value={step.targetId}
            />
          </Field>
        )}
      </div>
    </Panel>
  );
}
