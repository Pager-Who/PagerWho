import type { CopilotLocale, Incident } from "@im/contracts";
import { useTranslation } from "react-i18next";

import { Button, DescriptionList, ErrorState, Panel } from "../../../shared/components";
import { LocalizedText, normalizeLocale } from "../../../shared/i18n";
import { formatDateTime } from "../../../shared/utils";
import { useIncidentSummaryMutation } from "../queries";

export function IncidentSummaryPanel({ incident }: { incident: Incident }) {
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  return <SummaryContent key={`${incident.id}:${locale}`} incident={incident} locale={locale} />;
}

function SummaryContent({ incident, locale }: { incident: Incident; locale: CopilotLocale }) {
  const mutation = useIncidentSummaryMutation(incident.id, locale);
  const summary = mutation.data;
  const stale = summary && Date.parse(summary.source_updated_at) !== Date.parse(incident.updated_at);
  return (
    <LocalizedText>
      <Panel aria-label="AI incident summary" className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <h2 className="m-0 text-base font-semibold text-ink">AI incident summary</h2>
            <p className="m-0 max-w-prose text-xs leading-relaxed text-ink-muted">Summarize this incident and suggest three checks for your response.</p>
          </div>
          <Button isLoading={mutation.isPending} onClick={() => mutation.mutate()} size="sm" variant="ghost">
            {mutation.isPending ? "Generating summary..." : summary ? "Regenerate summary" : "Generate AI summary"}
          </Button>
        </div>
        <p className="m-0 max-w-prose text-xs leading-relaxed text-ink-muted">Uses incident details and recorded response history. Root cause, impact, metrics and logs are not verified. No changes are applied.</p>
        {mutation.error ? <ErrorState error={mutation.error} onRetry={() => mutation.mutate()} title="Could not generate incident summary" /> : null}
        {mutation.isPending ? <p className="m-0 text-sm text-ink-muted" role="status">Generating summary...</p> : null}
        {summary ? (
          <div aria-busy={mutation.isPending} className="grid min-w-0 gap-5" role="status">
            {stale ? <p className="m-0 text-sm text-warning">This incident has changed. Regenerate the summary before using it.</p> : null}
            {summary.context_truncated ? <p className="m-0 text-xs text-ink-muted">Some long fields or older history were omitted from this summary.</p> : null}
            <div className="grid gap-2">
              <h3 className="m-0 text-sm font-semibold text-ink">AI summary</h3>
              <p className="m-0 max-w-prose whitespace-pre-wrap break-words text-sm leading-relaxed text-ink" translate="no">{summary.summary}</p>
            </div>
            <div className="grid gap-2 border-t border-hairline-soft pt-4">
              <h3 className="m-0 text-sm font-semibold text-ink">Recorded facts</h3>
              <DescriptionList items={[
                ["Service", <span translate="no">{summary.evidence.service}</span>],
                ["Severity", summary.evidence.severity], ["Status", summary.evidence.status],
                ["Owner team", summary.evidence.owner_team ? <span translate="no">{summary.evidence.owner_team}</span> : "Unassigned"],
                ["Responder", summary.evidence.responder ? <span translate="no">{summary.evidence.responder}</span> : "Unassigned"],
              ]} />
            </div>
            <div className="grid gap-2 border-t border-hairline-soft pt-4">
              <h3 className="m-0 text-sm font-semibold text-ink">Checks to perform</h3>
              <ol className="m-0 grid list-decimal gap-2 pl-5 text-sm leading-relaxed text-ink-muted">
                {summary.checklist.map((check, index) => <li className="break-words pl-1" key={index} translate="no">{check}</li>)}
              </ol>
            </div>
            <p className="m-0 text-xs text-ink-subtle"><span>Generated</span> <span translate="no">{formatDateTime(summary.generated_at)}</span></p>
          </div>
        ) : null}
      </Panel>
    </LocalizedText>
  );
}
