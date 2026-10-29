import type { EscalationPolicy } from "@im/contracts";

import { Badge, EmptyState } from "../../../shared/components";
import { cn, shortId } from "../../../shared/utils";

type PolicyListProps = {
  onSelect: (policy: EscalationPolicy) => void;
  policies: EscalationPolicy[];
  selectedPolicyId: string;
  serviceCountByPolicyId: Map<string, number>;
};

export function PolicyList({
  onSelect,
  policies,
  selectedPolicyId,
  serviceCountByPolicyId,
}: PolicyListProps) {
  if (policies.length === 0) {
    return (
      <EmptyState
        message="Create a policy so services can route incidents to responders."
        title="No policies"
      />
    );
  }

  return (
    <div className="grid gap-2 min-w-0">
      {policies.map((policy) => {
        const isSelected = policy.id === selectedPolicyId;
        const serviceCount = serviceCountByPolicyId.get(policy.id) ?? 0;

        return (
          <button
            className={cn(
              "text-left grid gap-2 min-w-0 rounded-md border p-3 bg-surface-2/55 cursor-pointer transition-colors",
              isSelected ? "border-[rgba(0,153,255,0.45)] bg-surface-2" : "border-hairline-soft hover:border-hairline",
            )}
            key={policy.id}
            onClick={() => onSelect(policy)}
            type="button"
          >
            <div className="grid gap-1 min-w-0">
              <strong className="text-ink text-sm font-[650] leading-[1.25] overflow-hidden text-ellipsis whitespace-nowrap">
                {policy.name}
              </strong>
              <span className="text-ink-subtle font-mono text-[11px] leading-none">{shortId(policy.id)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="neutral">{serviceCount} svc</Badge>
              <Badge tone={policy.repeat_enabled ? "yellow" : "neutral"}>
                {policy.repeat_enabled ? "repeat" : "once"}
              </Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}
