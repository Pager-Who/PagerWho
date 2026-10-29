import type {
  DeadLetterNotificationQuery,
  Incident,
  IncidentFilter,
  NotificationLog,
  StuckEscalation,
  StuckEscalationQuery,
  WorkspaceInvite,
} from "@im/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Bell,
  BellRing,
  ChevronRight,
  GitBranch,
  Inbox,
  Loader2,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { incidentApi, notificationApi, workerApi, workspaceApi } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import { Badge, Skeleton } from "../components";
import { cn, formatRelativeTime, shortId } from "../utils";

type ActionCenterProps = {
  canViewOperations: boolean;
  projectId: string | undefined;
};

type ActionTone = "red" | "orange" | "yellow" | "blue";
type AttentionBadgeTone = "red" | "orange" | "yellow";

const deadLetterFilters = { limit: 5 } satisfies Partial<DeadLetterNotificationQuery>;

const toneClasses: Record<ActionTone, string> = {
  blue: "bg-accent/14 text-[#72c7ff]",
  orange: "bg-orange/16 text-[#ffad7d]",
  red: "bg-danger/16 text-[#ff98ad]",
  yellow: "bg-warning/14 text-[#ffd37a]",
};

const attentionBadgeClasses: Record<AttentionBadgeTone, string> = {
  orange: "bg-orange text-canvas",
  red: "bg-danger text-white",
  yellow: "bg-warning text-canvas",
};

export function ActionCenter({ canViewOperations, projectId }: ActionCenterProps) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const actionCenterRef = useRef<HTMLDivElement>(null);
  const actionCenterButtonRef = useRef<HTMLButtonElement>(null);

  const incidentFilters = useMemo<Partial<IncidentFilter>>(() => ({
    limit: 5,
    status: "triggered",
    ...(projectId ? { workspace_id: projectId } : {}),
  }), [projectId]);

  const stuckEscalationFilters = useMemo<Partial<StuckEscalationQuery>>(() => ({
    limit: 5,
    older_than_seconds: 300,
    ...(projectId ? { workspace_id: projectId } : {}),
  }), [projectId]);

  const incidentsQuery = useQuery({
    enabled: Boolean(projectId),
    queryFn: () => incidentApi.listIncidents(incidentFilters),
    queryKey: queryKeys.incidents.list(incidentFilters),
    refetchInterval: 30_000,
  });

  const deadLettersQuery = useQuery({
    enabled: Boolean(projectId && canViewOperations),
    queryFn: () => notificationApi.listDeadLetterNotifications(deadLetterFilters),
    queryKey: queryKeys.notifications.deadLetter(deadLetterFilters),
    refetchInterval: 30_000,
  });

  const stuckEscalationsQuery = useQuery({
    enabled: Boolean(projectId && canViewOperations),
    queryFn: () => workerApi.listStuckEscalations(stuckEscalationFilters),
    queryKey: queryKeys.workers.stuckEscalations(stuckEscalationFilters),
    refetchInterval: 30_000,
  });

  const invitesQuery = useQuery({
    enabled: Boolean(projectId),
    queryFn: () => workspaceApi.listMyInvites(),
    queryKey: queryKeys.workspaces.invites(),
    refetchInterval: 60_000,
  });

  const triggeredIncidents = incidentsQuery.data?.items ?? [];
  const deadLetters = deadLettersQuery.data?.items ?? [];
  const stuckEscalations = stuckEscalationsQuery.data?.items ?? [];
  const pendingInvites = (invitesQuery.data ?? []).filter((invite) => invite.status === "pending");
  const operationalActionCount = triggeredIncidents.length
    + deadLetters.length
    + stuckEscalations.length;
  const hasPanelItems = operationalActionCount > 0 || pendingInvites.length > 0;
  const attentionBadgeTone = getAttentionBadgeTone({
    deadLetterCount: deadLetters.length,
    incidents: triggeredIncidents,
    stuckEscalationCount: stuckEscalations.length,
  });
  const isChecking = incidentsQuery.isLoading
    || (canViewOperations && deadLettersQuery.isLoading)
    || (canViewOperations && stuckEscalationsQuery.isLoading)
    || invitesQuery.isLoading;
  const hasRefreshError = incidentsQuery.isError
    || (canViewOperations && deadLettersQuery.isError)
    || (canViewOperations && stuckEscalationsQuery.isError)
    || invitesQuery.isError;
  const refreshActionItems = () => {
    void Promise.all([
      incidentsQuery.refetch(),
      canViewOperations ? deadLettersQuery.refetch() : Promise.resolve(),
      canViewOperations ? stuckEscalationsQuery.refetch() : Promise.resolve(),
      invitesQuery.refetch(),
    ]);
  };

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;

    function handleDismiss(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        actionCenterButtonRef.current?.focus();
        return;
      }

      if (event instanceof MouseEvent && actionCenterRef.current && !actionCenterRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDismiss);
    document.addEventListener("keydown", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleDismiss);
      document.removeEventListener("keydown", handleDismiss);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={actionCenterRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={getActionCenterLabel(operationalActionCount, pendingInvites.length)}
        className={cn(
          "relative inline-flex items-center justify-center bg-transparent border border-hairline rounded-md text-ink-muted cursor-pointer h-8.5 w-8.5 transition-colors duration-120 ease hover:bg-surface-2 hover:text-ink",
          isOpen ? "bg-surface-2 text-ink" : "",
        )}
        onClick={() => setIsOpen((current) => !current)}
        ref={actionCenterButtonRef}
        title={getActionCenterLabel(operationalActionCount, pendingInvites.length)}
        type="button"
      >
        {operationalActionCount > 0 ? <BellRing size={16} strokeWidth={2} /> : <Bell size={16} strokeWidth={2} />}
        {operationalActionCount > 0 ? (
          <span className={cn(
            "absolute -right-1.5 -top-1.5 inline-flex items-center justify-center border border-canvas rounded-full text-[11px] font-extrabold leading-none min-h-5 min-w-5 px-1",
            attentionBadgeClasses[attentionBadgeTone],
          )}>
            {formatBadgeCount(operationalActionCount)}
          </span>
        ) : pendingInvites.length > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.75 -top-0.75 bg-accent border border-canvas rounded-full h-2.5 w-2.5"
          />
        ) : null}
      </button>

      {isOpen ? (
        <section
          aria-labelledby="action-center-title"
          className="absolute right-0 top-11 z-50 grid w-105 max-w-[calc(100vw-32px)] gap-3 rounded-lg border border-hairline bg-canvas-raised p-3.5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          role="dialog"
        >
          <header className="flex items-start justify-between gap-3 border-b border-hairline-soft pb-3">
            <div className="grid gap-1 min-w-0">
              <h2 className="m-0 text-ink text-[15px] font-[650] leading-[1.25]" id="action-center-title">Action Center</h2>
              <span className="text-ink-muted text-xs leading-[1.35]">
                {getActionCenterSummary(operationalActionCount, pendingInvites.length)}
              </span>
            </div>
            {isChecking ? <Loader2 className="animate-spin text-ink-subtle shrink-0" size={15} strokeWidth={2} /> : null}
          </header>

          <div className="grid gap-3 max-h-115 overflow-y-auto pr-1">
            {isChecking && !hasPanelItems ? <ActionCenterSkeleton /> : null}

            {triggeredIncidents.length > 0 ? (
              <ActionSection
                count={formatSectionCount(triggeredIncidents.length, incidentsQuery.data?.next_cursor)}
                title="Open incidents"
                to="/incidents"
              >
                {triggeredIncidents.map((incident) => (
                  <IncidentActionRow incident={incident} key={incident.id} />
                ))}
              </ActionSection>
            ) : null}

            {deadLetters.length > 0 ? (
              <ActionSection
                count={formatSectionCount(deadLetters.length, deadLettersQuery.data?.next_cursor)}
                title="Delivery failures"
                to="/operations?tab=dead-letters"
              >
                {deadLetters.map((notification) => (
                  <DeadLetterActionRow key={notification.id} notification={notification} />
                ))}
              </ActionSection>
            ) : null}

            {stuckEscalations.length > 0 ? (
              <ActionSection
                count={formatSectionCount(stuckEscalations.length, stuckEscalationsQuery.data?.next_cursor)}
                title="Delayed escalations"
                to="/incidents"
              >
                {stuckEscalations.slice(0, 3).map((escalation) => (
                  <StuckEscalationActionRow escalation={escalation} key={escalation.incident_id} />
                ))}
              </ActionSection>
            ) : null}

            {pendingInvites.length > 0 ? (
              <ActionSection count={pendingInvites.length} title="Invitations" to="/user-settings">
                {pendingInvites.slice(0, 3).map((invite) => (
                  <InviteActionRow invite={invite} key={invite.id} />
                ))}
              </ActionSection>
            ) : null}

            {!hasPanelItems && !isChecking && !hasRefreshError ? (
              <div className="grid gap-2 justify-items-center py-7 px-4 text-center">
                <span className="inline-flex items-center justify-center bg-success/14 rounded-full text-[#72e09c] h-9 w-9">
                  <Inbox size={17} strokeWidth={2} />
                </span>
                <strong className="text-ink text-sm font-[650] leading-[1.3]">Nothing needs attention</strong>
                <span className="text-ink-muted text-xs leading-[1.45] max-w-70">
                  {canViewOperations
                    ? "Triggered incidents, failed notifications, stuck escalations, and pending invitations will appear here."
                    : "Triggered incidents and pending invitations will appear here."}
                </span>
              </div>
            ) : null}

            {hasRefreshError ? (
              <div aria-live="polite" className="flex items-center justify-between gap-3 bg-danger/10 border border-danger/20 rounded-md text-[#ff98ad] text-xs leading-[1.4] p-2.5" role="alert">
                <span>Some action items could not be refreshed.</span>
                <button
                  className="shrink-0 text-[#ffb2c0] font-semibold underline underline-offset-2 hover:text-white"
                  onClick={refreshActionItems}
                  type="button"
                >
                  Retry
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ActionSection({
  children,
  count,
  title,
  to,
}: {
  children: ReactNode;
  count?: ReactNode;
  title: string;
  to: string;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-ink-subtle text-[11px] font-[750] leading-none uppercase">
          {title}
          {count ? (
            <span className="inline-flex items-center justify-center bg-white/8 rounded-full text-ink-muted text-[11px] leading-none min-h-4.5 min-w-4.5 px-1">
              {count}
            </span>
          ) : null}
        </span>
        <Link className="text-ink-muted text-[11px] font-[650] leading-none no-underline hover:text-ink" to={to}>
          View
        </Link>
      </div>
      <div className="grid gap-1.5">{children}</div>
    </section>
  );
}

function ActionCenterSkeleton() {
  return (
    <div aria-label="Loading action items" className="grid gap-2" role="status">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="grid gap-2 rounded-md border border-hairline-soft bg-surface-1 p-2.5" key={index}>
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
          </div>
          <Skeleton className="ml-9.5 h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

function ActionRow({
  detail,
  icon: Icon,
  meta,
  title,
  to,
  tone,
}: {
  detail: ReactNode;
  icon: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  meta: ReactNode;
  title: ReactNode;
  to: string;
  tone: ActionTone;
}) {
  return (
    <Link
      className="grid gap-1 bg-surface-1 border border-hairline-soft rounded-md p-2.5 min-w-0 no-underline transition-colors duration-120 ease hover:bg-surface-2 hover:border-hairline"
      to={to}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <span className={cn("inline-flex items-center justify-center rounded-md h-7 w-7 shrink-0", toneClasses[tone])}>
          <Icon size={15} strokeWidth={2} />
        </span>
        <div className="grid gap-1 min-w-0 flex-1">
          <strong className="text-ink text-[13px] font-[650] leading-[1.3] overflow-hidden text-ellipsis whitespace-nowrap">
            {title}
          </strong>
          <span className="text-ink-muted text-xs leading-[1.35] overflow-hidden text-ellipsis whitespace-nowrap">
            {detail}
          </span>
        </div>
        <ChevronRight className="text-ink-subtle shrink-0 mt-1" size={14} strokeWidth={2} />
      </div>
      <span className="min-w-0 max-w-full overflow-hidden break-words text-ink-subtle text-[11px] leading-[1.3] pl-9.5">{meta}</span>
    </Link>
  );
}

function IncidentActionRow({ incident }: { incident: Incident }) {
  const tone = getIncidentTone(incident);

  return (
    <ActionRow
      detail={`${incident.severity} severity`}
      icon={AlertCircle}
      meta={
        <span className="flex w-full min-w-0 items-center justify-between gap-2">
          <span>{formatRelativeTime(incident.created_at)}</span>
          <Badge tone={tone}>{incident.priority}</Badge>
        </span>
      }
      title={incident.title}
      to={`/incidents/${incident.id}`}
      tone={tone}
    />
  );
}

function DeadLetterActionRow({ notification }: { notification: NotificationLog }) {
  return (
    <ActionRow
      detail={`${notification.channel} delivery failed for ${shortId(notification.incident_id)}`}
      icon={Inbox}
      meta={notification.error_message ?? "Review delivery attempts"}
      title="Notification delivery needs review"
      to={`/operations?tab=dead-letters&notificationId=${notification.id}`}
      tone="red"
    />
  );
}

function StuckEscalationActionRow({ escalation }: { escalation: StuckEscalation }) {
  return (
    <ActionRow
      detail={`Step ${escalation.current_step} · repeat ${escalation.repeat_iteration}`}
      icon={GitBranch}
      meta={`${escalation.overdue_seconds}s overdue`}
      title={`Escalation delayed for ${shortId(escalation.incident_id)}`}
      to={`/incidents/${escalation.incident_id}`}
      tone="yellow"
    />
  );
}

function InviteActionRow({ invite }: { invite: WorkspaceInvite }) {
  return (
    <ActionRow
      detail={`Role: ${invite.role}`}
      icon={Inbox}
      meta={formatRelativeTime(invite.created_at)}
      title={`${invite.workspace_name} invitation pending`}
      to="/user-settings"
      tone="blue"
    />
  );
}

function getIncidentTone(incident: Incident): ActionTone {
  if (incident.priority === "P1" || incident.severity === "critical") return "red";
  if (incident.priority === "P2" || incident.severity === "high") return "orange";
  return "yellow";
}

function getAttentionBadgeTone({
  deadLetterCount,
  incidents,
  stuckEscalationCount,
}: {
  deadLetterCount: number;
  incidents: Incident[];
  stuckEscalationCount: number;
}): AttentionBadgeTone {
  if (deadLetterCount > 0 || incidents.some((incident) => getIncidentTone(incident) === "red")) {
    return "red";
  }

  if (stuckEscalationCount > 0 || incidents.some((incident) => getIncidentTone(incident) === "orange")) {
    return "orange";
  }

  return "yellow";
}

function getActionCenterLabel(operationalActionCount: number, inviteCount: number) {
  if (operationalActionCount > 0) {
    return `Action Center, ${operationalActionCount} operational item${operationalActionCount === 1 ? "" : "s"} need attention`;
  }

  if (inviteCount > 0) {
    return `Action Center, ${inviteCount} pending invitation${inviteCount === 1 ? "" : "s"}`;
  }

  return "Action Center";
}

function getActionCenterSummary(operationalActionCount: number, inviteCount: number) {
  if (operationalActionCount > 0) {
    return `${operationalActionCount} operational item${operationalActionCount === 1 ? "" : "s"} need attention`;
  }

  if (inviteCount > 0) {
    return `No operational issues · ${inviteCount} pending invitation${inviteCount === 1 ? "" : "s"}`;
  }

  return "No action needed";
}

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function formatSectionCount(count: number, nextCursor: string | null | undefined) {
  return `${count}${nextCursor ? "+" : ""}`;
}
