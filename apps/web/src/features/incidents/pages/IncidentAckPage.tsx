import { CheckCircle2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import {
  BrandMark,
  Button,
  ErrorState,
  IncidentPriorityBadge,
  IncidentSeverityBadge,
  IncidentStatusBadge,
  LoadingState,
  Panel,
} from "../../../shared/components";
import { LocalizedText, useStaticText } from "../../../shared/i18n";
import { formatRelativeTime } from "../../../shared/utils";
import { useAcknowledgeIncidentActionLinkMutation, useIncidentActionLink } from "../queries";

// Landing page for the signed acknowledge link in notifications. Works without a session so a
// paged responder can take ownership from their phone; the GET never acknowledges (link scanners).
export function IncidentAckPage() {
  const t = useStaticText();
  const { token = "" } = useParams();
  const linkQuery = useIncidentActionLink(token);
  const acknowledgeMutation = useAcknowledgeIncidentActionLinkMutation(token);
  const link = linkQuery.data;

  return (
    <LocalizedText><main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="grid w-full max-w-md gap-4">
        <div className="flex items-center gap-2 text-ink text-sm font-[650]">
          <BrandMark className="size-6" />
          Pager Who
        </div>

        {linkQuery.isLoading ? <LoadingState message="Loading incident..." /> : null}
        {linkQuery.error ? <ErrorState error={linkQuery.error} title="Could not open this link" /> : null}

        {link ? (
          <Panel className="grid gap-4" padding="lg">
            <div className="grid gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <IncidentPriorityBadge priority={link.incident.priority} />
                <IncidentSeverityBadge severity={link.incident.severity} />
                <IncidentStatusBadge status={link.incident.status} />
              </div>
              <h1 className="m-0 text-ink text-lg font-[650] leading-tight break-words">{link.incident.title}</h1>
              <p className="m-0 text-ink-muted text-[13px]">
                {link.incident.service_name} · <time dateTime={link.incident.created_at}>{formatRelativeTime(link.incident.created_at)}</time>
              </p>
            </div>

            {link.incident.status === "triggered" ? (
              <div className="grid gap-2.5">
                <Button
                  isLoading={acknowledgeMutation.isPending}
                  onClick={() => acknowledgeMutation.mutate()}
                  size="md"
                  variant="primary"
                >
                  {t("Acknowledge as {{0}}").replace("{{0}}", link.responder_name)}
                </Button>
                <p className="m-0 text-ink-subtle text-xs leading-[1.45]">
                  Acknowledging stops further escalation and tells the team you own this incident.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/8 p-3 text-ink text-sm" role="status">
                <CheckCircle2 aria-hidden="true" className="text-success shrink-0" size={17} />
                {link.incident.status === "acknowledged" ? "This incident is acknowledged." : "This incident is already resolved."}
              </div>
            )}

            {acknowledgeMutation.error ? <ErrorState error={acknowledgeMutation.error} title="Could not acknowledge incident" /> : null}

            <Link className="text-accent text-sm font-semibold no-underline hover:underline" to={`/incidents/${link.incident.id}`}>
              Open incident in Pager Who
            </Link>
          </Panel>
        ) : null}
      </div>
    </main></LocalizedText>
  );
}
