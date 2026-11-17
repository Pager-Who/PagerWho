import { KeyRound, Loader2 } from "lucide-react";

import { LocalizedText } from "../i18n";
import { cn } from "../utils";
import type { CopilotAvailability } from "./useCopilotAvailability";

type CopilotSetupNoticeProps = {
  availability: Exclude<CopilotAvailability, "available">;
  className?: string;
};

/** Shown in place of Copilot actions until the server has a model provider configured. */
export function CopilotSetupNotice({ availability, className }: CopilotSetupNoticeProps) {
  if (availability === "checking") {
    return (
      <LocalizedText>
        <p className={cn("m-0 flex items-center gap-2 text-sm text-ink-muted", className)} role="status">
          <Loader2 aria-hidden="true" className="animate-spin text-accent" size={14} />
          Checking Copilot setup...
        </p>
      </LocalizedText>
    );
  }

  return (
    <LocalizedText>
      <section aria-label="Copilot setup required" className={cn("grid gap-2 rounded-2xl border border-warning/30 bg-warning/5 p-3.5", className)} role="status">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <KeyRound aria-hidden="true" size={13} strokeWidth={2.3} />
          </span>
          <h3 className="m-0 text-sm font-semibold text-ink">Copilot setup required</h3>
        </div>
        <p className="m-0 text-sm leading-[1.45] text-ink-muted">
          Copilot is not configured on this server yet. A server administrator can enable it by connecting an OpenAI-compatible model provider.
        </p>
        <p className="m-0 text-xs leading-[1.45] text-ink-subtle">
          <span>Set these API environment variables, then restart the API:</span>{" "}
          <code translate="no">COPILOT_API_KEY</code>, <code translate="no">COPILOT_BASE_URL</code>, <code translate="no">COPILOT_MODEL</code>.{" "}
          <span>See</span> <code translate="no">docs/copilot.md</code>.
        </p>
      </section>
    </LocalizedText>
  );
}
