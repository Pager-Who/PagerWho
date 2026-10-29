import type { EscalationPolicy, Service } from "@im/contracts";

import { Badge, EmptyState, Panel, SectionHeader } from "../../../shared/components";
import { formatDurationSeconds } from "../../../shared/utils";
import { formatStepTarget, type StepFormState } from "../lib/policy-form";

type StepNameMaps = {
  scheduleNameById: Map<string, string>;
  teamNameById: Map<string, string>;
  userNameById: Map<string, string>;
};

type PolicyDetailProps = StepNameMaps & {
  policy: EscalationPolicy;
  steps: StepFormState[];
};

type EscalationStepPreviewProps = StepNameMaps & {
  steps: StepFormState[];
};

export function PolicyUsageSummary({ services }: { services: Service[] }) {
  if (services.length === 0) {
    return (
      <Panel className="rounded-md" padding="sm" tone="secondary">
        <p className="text-ink-muted text-[13px] leading-normal m-0">Not connected to any service yet.</p>
      </Panel>
    );
  }

  return (
    <Panel className="rounded-md grid gap-2.5" padding="sm" tone="secondary">
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Used by services</span>
        <Badge tone="yellow">{services.length}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {services.slice(0, 6).map((service) => (
          <Badge key={service.id} tone="neutral">{service.name}</Badge>
        ))}
        {services.length > 6 ? <Badge tone="neutral">+ {services.length - 6} more</Badge> : null}
      </div>
    </Panel>
  );
}

export function PolicyDetail({
  policy,
  scheduleNameById,
  steps,
  teamNameById,
  userNameById,
}: PolicyDetailProps) {
  return (
    <div className="grid gap-4 min-w-0">
      <Panel className="rounded-md grid gap-3" padding="sm" tone="secondary">
        <div className="flex items-start gap-3 justify-between">
          <div className="grid gap-1.25 min-w-0">
            <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Escalation path</span>
            <strong className="text-ink text-sm font-[650] leading-[1.3]">
              {policy.repeat_enabled ? "Repeats until ack or resolve" : "Stops after final step"}
            </strong>
          </div>
          <Badge tone={policy.repeat_enabled ? "yellow" : "neutral"}>
            {policy.repeat_enabled ? `repeat ${policy.repeat_limit ?? "unlimited"}` : "no repeat"}
          </Badge>
        </div>
        <EscalationStepPreview
          scheduleNameById={scheduleNameById}
          steps={steps}
          teamNameById={teamNameById}
          userNameById={userNameById}
        />
      </Panel>

      <Panel className="rounded-md grid gap-3" padding="sm" tone="secondary">
        <SectionHeader title="Repeat" />
        <dl className="grid gap-2 m-0">
          <div className="grid gap-1">
            <dt className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Rule</dt>
            <dd className="text-ink text-sm m-0">
              {policy.repeat_enabled ? `Every ${formatDurationSeconds(policy.repeat_interval_seconds ?? 0)}` : "Disabled"}
            </dd>
          </div>
          {policy.repeat_enabled ? (
            <div className="grid gap-1">
              <dt className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Limit</dt>
              <dd className="text-ink text-sm m-0">{policy.repeat_limit ?? "Unlimited"}</dd>
            </div>
          ) : null}
        </dl>
      </Panel>
    </div>
  );
}

export function EscalationStepPreview({
  scheduleNameById,
  steps,
  teamNameById,
  userNameById,
}: EscalationStepPreviewProps) {
  if (steps.length === 0) {
    return <EmptyState message="Add at least one escalation step." title="No steps" />;
  }

  return (
    <ol className="grid gap-2 list-none m-0 p-0">
      {steps
        .slice()
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((step) => (
          <li
            className="bg-surface-1/65 border border-hairline-soft rounded-md items-center grid gap-2.5 grid-cols-[64px_minmax(0,1fr)_auto] min-w-0 p-2.5"
            key={step.id ?? step.stepOrder}
          >
            <span className="text-ink-subtle text-xs font-bold uppercase">Step {step.stepOrder}</span>
            <strong className="text-ink text-[13px] leading-[1.35]">
              {formatStepTarget(step, { scheduleNameById, teamNameById, userNameById })}
            </strong>
            <em className="text-ink-muted text-xs not-italic leading-[1.35] text-right">
              {step.delaySeconds === 0 ? "Immediately" : `After ${formatDurationSeconds(step.delaySeconds)}`}
            </em>
          </li>
        ))}
    </ol>
  );
}
