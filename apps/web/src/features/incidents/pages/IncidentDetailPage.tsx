import type { ReactNode } from "react";
import type {
  IncidentPriority,
  IncidentTimelineEntry,
  ManualEscalationAction,
  NotificationLog,
  Service,
  WorkspaceRoleKey,
} from "@im/contracts";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  Button,
  DataTable,
  DescriptionList,
  EmptyState,
  ErrorState,
  Field,
  IncidentPriorityBadge,
  IncidentSeverityBadge,
  IncidentStatusBadge,
  DetailPageSkeleton,
  LoadingState,
  NotificationCard,
  NotificationCardAction,
  NotificationStatusBadge,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  TabButton,
  TextArea,
  type DataTableColumn,
} from "../../../shared/components";
import { LocalizedText } from "../../../shared/i18n";
import { hasWorkspacePermission, useAuth } from "../../../shared/auth";
import { formatDateTime, formatRelativeTime, shortId } from "../../../shared/utils";
import {
  useAcknowledgeIncidentMutation,
  useIncidentDetail,
  useIncidentNotifications,
  useIncidentServiceOptions,
  useIncidentTimeline,
  useIncidentWorkspaceRoles,
  useResolveIncidentMutation,
  useTriggerManualEscalationMutation,
  useUpdateIncidentPriorityMutation,
} from "../queries";

type IncidentDetailTab = "overview" | "timeline" | "notifications" | "escalation";

const incidentPriorities = ["P1", "P2", "P3", "P4", "P5"] as const satisfies readonly IncidentPriority[];

export function IncidentDetailPage() {
  const { incidentId } = useParams();
  const { isPlatformAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<IncidentDetailTab>("overview");
  const [manualEscalationReason, setManualEscalationReason] = useState("");
  const [isPriorityEditorOpen, setIsPriorityEditorOpen] = useState(false);
  const [priorityDraft, setPriorityDraft] = useState<IncidentPriority>("P3");
  const incidentDetailQuery = useIncidentDetail(incidentId);
  const timelineQuery = useIncidentTimeline(incidentId);
  const notificationsQuery = useIncidentNotifications(incidentId);
  const servicesQuery = useIncidentServiceOptions();

  const acknowledgeIncidentMutation = useAcknowledgeIncidentMutation(incidentId ?? "");
  const resolveIncidentMutation = useResolveIncidentMutation(incidentId ?? "");
  const updatePriorityMutation = useUpdateIncidentPriorityMutation(incidentId ?? "");
  const triggerManualEscalationMutation = useTriggerManualEscalationMutation(incidentId ?? "");

  const detail = incidentDetailQuery.data;
  const incident = detail?.incident;
  const workspaceRolesQuery = useIncidentWorkspaceRoles(incident?.workspace_id);
  const workspaceRoles = workspaceRolesQuery.data ?? [];
  const timelineEntries = timelineQuery.data?.items ?? [];
  const notifications = notificationsQuery.data?.items ?? [];
  const services = servicesQuery.data?.items ?? [];
  const serviceNameById = useMemo(() => createServiceNameMap(services), [services]);
  const notificationColumns = useMemo<Array<DataTableColumn<NotificationLog>>>(() => createNotificationColumns(), []);

  const canUseResponseActions = isPlatformAdmin || canUseIncidentResponseActions(workspaceRoles);
  const isAckActionVisible = incident?.status === "triggered";
  const isResolveActionVisible = incident?.status === "triggered" || incident?.status === "acknowledged";
  const isManualEscalationAvailable = Boolean(detail?.escalation) && incident?.status !== "resolved";
  const isActionPending = acknowledgeIncidentMutation.isPending
    || resolveIncidentMutation.isPending
    || updatePriorityMutation.isPending
    || triggerManualEscalationMutation.isPending;
  const actionError = acknowledgeIncidentMutation.error
    ?? resolveIncidentMutation.error
    ?? updatePriorityMutation.error
    ?? triggerManualEscalationMutation.error;

  async function handleAcknowledge() {
    await acknowledgeIncidentMutation.mutateAsync();
  }

  async function handleResolve() {
    await resolveIncidentMutation.mutateAsync();
  }

  useEffect(() => {
    if (!incident) return;

    setPriorityDraft(incident.priority);
    setIsPriorityEditorOpen(false);
  }, [incident?.id, incident?.priority]);

  async function handleSavePriority() {
    if (!canUseResponseActions || !incident || priorityDraft === incident.priority) return;

    await updatePriorityMutation.mutateAsync(priorityDraft);
    setIsPriorityEditorOpen(false);
  }

  async function handleManualEscalation(action: ManualEscalationAction) {
    if (!canUseResponseActions || !incident || !detail.escalation || incident.status === "resolved") return;

    await triggerManualEscalationMutation.mutateAsync({
      action,
      force: incident.status === "acknowledged",
      reason: manualEscalationReason.trim() || undefined,
      update_current_step: action === "advance_to_next_step",
    });
    setManualEscalationReason("");
  }

  if (!incidentId) {
    return (
      <LocalizedText>
        <section className="grid gap-4">
          <ErrorState
            action={
              <Link className="flex text-ink-muted text-[13px] font-[650] leading-none no-underline hover:text-ink" to="/incidents">
                Back to incidents
              </Link>
            }
            title="Incident id is missing"
          />
        </section>
      </LocalizedText>
    );
  }

  return (
    <LocalizedText>
      <section className="grid gap-4 min-w-0">
      <PageHeader
        description={incident ? (
          <span className="flex items-center flex-wrap gap-2.25 text-ink-muted text-[13px]">
            <IncidentStatusBadge status={incident.status} />
            <IncidentSeverityBadge severity={incident.severity} />
            <span>{serviceNameById.get(incident.service_id) ?? shortId(incident.service_id)}</span>
            <span className="text-ink-subtle">·</span>
            <span>Opened {formatRelativeTime(incident.created_at)}</span>
            <span className="text-ink-subtle">·</span>
            <span>{incident.acknowledged_by ? "Responder assigned" : "Unassigned"}</span>
          </span>
        ) : <Skeleton className="h-4 w-80 max-w-full" />}
        eyebrow={<Link className="text-ink-muted text-[13px] font-[650] leading-none no-underline hover:text-ink" to="/incidents">← Incidents</Link>}
        help="This is the response workspace for one incident. Use the primary action at the top, then review the timeline and notifications as you investigate."
        title={incident?.title ?? "Incident"}
      />

      {incidentDetailQuery.isLoading ? <DetailPageSkeleton label="Loading incident detail" variant="incident" /> : null}
      {incidentDetailQuery.error ? <ErrorState error={incidentDetailQuery.error} onRetry={() => void incidentDetailQuery.refetch()} title="Could not load incident" /> : null}
      {timelineQuery.error ? <ErrorState error={timelineQuery.error} onRetry={() => void timelineQuery.refetch()} title="Could not load timeline" /> : null}
      {notificationsQuery.error ? <ErrorState error={notificationsQuery.error} onRetry={() => void notificationsQuery.refetch()} title="Could not load notifications" /> : null}
      {actionError ? <ErrorState error={actionError} title="Could not update incident" /> : null}

      {detail && incident ? (
        <>
          <Panel className="grid items-start gap-5 p-5">
            <div className="grid items-start gap-4 rounded-xl border border-accent/20 bg-accent/5 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="grid gap-1.5 min-w-0">
                <span className="text-accent text-[11px] font-[800] leading-none uppercase">Next response</span>
                <strong className="text-ink text-[17px] font-[700] leading-tight">
                  {getNextResponseTitle(incident.status)}
                </strong>
                <p className="text-ink-muted text-xs leading-[1.45] m-0">
                  {getNextResponseDescription(incident.status)}
                </p>
              </div>
              <div className="flex items-center flex-wrap gap-2 justify-start md:justify-end">
                {canUseResponseActions && isAckActionVisible ? (
                  <Button
                    disabled={isActionPending}
                    isLoading={acknowledgeIncidentMutation.isPending}
                    onClick={() => void handleAcknowledge()}
                    size="md"
                    variant="primary"
                  >
                    Acknowledge
                  </Button>
                ) : null}
                {canUseResponseActions && isResolveActionVisible ? (
                  <Button
                    disabled={isActionPending}
                    isLoading={resolveIncidentMutation.isPending}
                    onClick={() => void handleResolve()}
                    size="md"
                    variant={isAckActionVisible ? "secondary" : "primary"}
                  >
                    Resolve
                  </Button>
                ) : null}
                {!canUseResponseActions ? (
                  <span className="bg-white/6 border border-hairline-soft rounded-lg text-ink-subtle text-xs font-[650] leading-none px-3 py-2.5">
                    Read-only
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4 min-w-0">
              <ResponseSignal label="Service" value={serviceNameById.get(incident.service_id) ?? shortId(incident.service_id)} />
              <ResponseSignal label="Opened" value={formatRelativeTime(incident.created_at)} />
              <ResponseSignal label="Responder" value={incident.acknowledged_by ? "Assigned" : "Unassigned"} />
              <ResponseSignal label="Notifications" value={detail.notification_summary.total} />
            </div>

            <div className="border-t border-hairline-soft pt-3.5 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="grid gap-2.5 min-w-0">
                <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Response controls</span>
                <div className="flex items-center flex-wrap gap-2.5 min-w-0">
                  <span className="text-ink-muted text-[13px] font-semibold leading-none">Priority</span>
                  <IncidentPriorityBadge priority={incident.priority} />
                  {canUseResponseActions && !isPriorityEditorOpen ? (
                    <Button
                      disabled={updatePriorityMutation.isPending || incident.status === "resolved"}
                      onClick={() => {
                        setPriorityDraft(incident.priority);
                        setIsPriorityEditorOpen(true);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Change priority
                    </Button>
                  ) : null}
                </div>
                {canUseResponseActions && isPriorityEditorOpen ? (
                  <div className="grid items-end gap-2.5 sm:grid-cols-[minmax(150px,190px)_auto_auto] max-w-115">
                    <Field label="New priority">
                      <Select
                        disabled={updatePriorityMutation.isPending}
                        onChange={(event) => setPriorityDraft(event.target.value as IncidentPriority)}
                        value={priorityDraft}
                      >
                        {incidentPriorities.map((priority) => (
                          <option key={priority} value={priority}>{priority}</option>
                        ))}
                      </Select>
                    </Field>
                    <Button
                      disabled={priorityDraft === incident.priority}
                      isLoading={updatePriorityMutation.isPending}
                      onClick={() => void handleSavePriority()}
                      size="sm"
                      variant="primary"
                    >
                      Save priority
                    </Button>
                    <Button
                      disabled={updatePriorityMutation.isPending}
                      onClick={() => {
                        setPriorityDraft(incident.priority);
                        setIsPriorityEditorOpen(false);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </div>

            </div>
          </Panel>

          <Panel className="grid gap-4.5">
            <div
              aria-label="Incident detail sections"
              className="flex items-center gap-1 border-b border-hairline-soft pb-2.5 overflow-x-auto"
              role="tablist"
            >
              <TabButton active={activeTab === "overview"} id="incident-tab-overview" label="Overview" onClick={() => setActiveTab("overview")} panelId="incident-panel-overview" />
              <TabButton active={activeTab === "timeline"} count={detail.timeline_summary.total} id="incident-tab-timeline" label="Timeline" onClick={() => setActiveTab("timeline")} panelId="incident-panel-timeline" />
              <TabButton active={activeTab === "notifications"} count={detail.notification_summary.total} id="incident-tab-notifications" label="Notifications" onClick={() => setActiveTab("notifications")} panelId="incident-panel-notifications" />
              <TabButton active={activeTab === "escalation"} id="incident-tab-escalation" label="Escalation" onClick={() => setActiveTab("escalation")} panelId="incident-panel-escalation" />
            </div>

            <div className="rounded-lg border border-hairline-soft bg-surface-2/45 px-3.5 py-3 text-ink-muted text-xs leading-[1.45]">
              {activeTab === "overview"
                ? "Confirm the service, severity, priority, and ownership before taking the next response action."
                : activeTab === "timeline"
                  ? "Review the chronological record of state changes, responder actions, and automation."
                  : activeTab === "notifications"
                    ? "Check which channels were attempted and whether responders received the notification."
                    : "Inspect the current escalation step or manually run the current or next step."}
            </div>

            {activeTab === "overview" ? (
              <div aria-labelledby="incident-tab-overview" className="grid gap-4 min-w-0" id="incident-panel-overview" role="tabpanel">
                <DescriptionList
                  items={[
                    ["Service", serviceNameById.get(incident.service_id) ?? incident.service_id],
                    ["Priority", incident.priority],
                    ["Severity", incident.severity],
                    ["Status", incident.status],
                    ["Source", incident.source],
                    ["Created", formatDateTime(incident.created_at)],
                    ["Updated", formatDateTime(incident.updated_at)],
                    ["Acknowledged", formatNullableAction(incident.acknowledged_by, incident.acknowledged_at)],
                    ["Resolved", formatNullableAction(incident.resolved_by, incident.resolved_at)],
                  ]}
                />
                <div className="grid gap-2.5 min-w-0 max-w-full overflow-hidden border-t border-hairline pt-3.5">
                  <span className="text-ink-subtle text-xs font-bold leading-none uppercase">Description</span>
                  <p className="text-ink-muted text-[13px] leading-[1.55] m-0 min-w-0 max-w-full whitespace-pre-wrap break-all overflow-wrap-anywhere">
                    {incident.description ?? "No description has been recorded for this incident."}
                  </p>
                </div>
              </div>
            ) : null}

            {activeTab === "timeline" ? (
              <div aria-labelledby="incident-tab-timeline" className="grid gap-4 min-w-0" id="incident-panel-timeline" role="tabpanel">
                {timelineQuery.isLoading ? (
                  <LoadingState message="Loading timeline..." />
                ) : (
                  <Timeline entries={timelineEntries} />
                )}
              </div>
            ) : null}

            {activeTab === "notifications" ? (
              <div aria-labelledby="incident-tab-notifications" className="grid gap-4 min-w-0" id="incident-panel-notifications" role="tabpanel">
                {notificationsQuery.isLoading ? (
                  <LoadingState message="Loading notifications..." />
                ) : (
                  notifications.length > 0 ? (
                    <>
                      <div className="hidden md:block">
                        <DataTable columns={notificationColumns} getRowKey={(notification) => notification.id} rows={notifications} />
                      </div>
                      <div className="grid gap-2 md:hidden">
                        {notifications.map((notification) => (
                          <NotificationCard
                            action={<NotificationCardAction to={`/operations?tab=notifications&notificationId=${notification.id}`} />}
                            key={notification.id}
                            notification={notification}
                          />
                        ))}
                      </div>
                    </>
                  ) : <EmptyState message="No notifications have been recorded." title="No notifications" />
                )}
              </div>
            ) : null}

            {activeTab === "escalation" ? (
              <div aria-labelledby="incident-tab-escalation" className="grid gap-4 min-w-0" id="incident-panel-escalation" role="tabpanel">
                {detail.escalation ? (
                  <>
                    <DescriptionList
                      items={[
                        ["Status", detail.escalation.status],
                        ["Current step", detail.escalation.current_step],
                        ["Repeat iteration", detail.escalation.repeat_iteration],
                        ["Next run", formatDateTime(detail.escalation.next_run_at)],
                        ["Updated", formatDateTime(detail.escalation.updated_at)],
                      ]}
                    />
                    <section className="bg-surface-2 border border-hairline rounded-xl grid gap-3.5 p-3.5">
                      <h3 className="text-ink text-[15px] font-[650] leading-tight m-0">Manual escalation</h3>
                      <div className="grid gap-2.5 min-w-0 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <Field label="Reason">
                          <TextArea
                            disabled={!canUseResponseActions || !isManualEscalationAvailable || triggerManualEscalationMutation.isPending}
                            onChange={(event) => setManualEscalationReason(event.target.value)}
                            placeholder="Optional context for timeline and activity logs."
                            value={manualEscalationReason}
                          />
                        </Field>
                        <div className="flex items-end flex-wrap gap-2.5 justify-end min-w-0">
                          <Button
                            disabled={!canUseResponseActions || !isManualEscalationAvailable || isActionPending}
                            isLoading={triggerManualEscalationMutation.isPending}
                            onClick={() => void handleManualEscalation("trigger_current_step")}
                            variant="secondary"
                          >
                            Run current step
                          </Button>
                          <Button
                            disabled={!canUseResponseActions || !isManualEscalationAvailable || isActionPending}
                            isLoading={triggerManualEscalationMutation.isPending}
                            onClick={() => void handleManualEscalation("advance_to_next_step")}
                            variant="primary"
                          >
                            Escalate next step
                          </Button>
                        </div>
                      </div>
                    </section>
                  </>
                ) : (
                  <EmptyState message="No escalation state exists for this incident." title="No escalation" />
                )}
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}
      </section>
    </LocalizedText>
  );
}

function ResponseSignal({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-hairline bg-canvas/35 p-3">
      <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">{label}</span>
      <strong className="flex min-h-6 min-w-0 items-center overflow-wrap-anywhere text-ink text-[13px] font-[650] leading-[1.3]">
        {value}
      </strong>
    </div>
  );
}

function getNextResponseTitle(status: string) {
  if (status === "triggered") return "Take ownership of this incident";
  if (status === "acknowledged") return "Continue the response";
  return "This incident is resolved";
}

function getNextResponseDescription(status: string) {
  if (status === "triggered") return "Acknowledge the incident when you start investigating. Resolve it once the service is healthy again.";
  if (status === "acknowledged") return "Review the timeline and notifications, then resolve the incident when the underlying issue is addressed.";
  return "Review the timeline and notification history for follow-up and post-incident learning.";
}

function Timeline({ entries }: { entries: IncidentTimelineEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState message="No timeline entries have been recorded." title="No timeline" />;
  }

  return (
    <ol className="grid gap-0 list-none m-0 p-0">
      {entries.map((entry) => (
        <li key={entry.id} className="grid gap-3 grid-cols-[12px_minmax(0,1fr)] pb-5 relative last:pb-0 before:content-[''] before:absolute before:left-1.25 before:top-3.5 before:bottom-0 before:w-px before:bg-hairline last:before:hidden">
          <div className="bg-ink rounded-full h-2 w-2 mt-1.25" />
          <div className="grid gap-2 min-w-0">
            <div className="flex items-center flex-wrap gap-2 justify-between">
              <strong className="text-ink text-sm font-[650] leading-[1.3]">{entry.type}</strong>
              <time className="text-ink-subtle text-xs" dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>
                {formatRelativeTime(entry.created_at)}
              </time>
            </div>
            <p className="text-ink-muted text-[13px] leading-normal m-0">{entry.message}</p>
            {entry.metadata ? (
              <details className="bg-surface-2 border border-hairline rounded-xl text-ink-muted text-xs leading-[1.45] overflow-hidden">
                <summary className="cursor-pointer px-3 py-2 text-ink-muted font-[650]">Metadata</summary>
                <pre className="border-t border-hairline-soft m-0 overflow-x-auto p-3">
                  {formatMetadata(entry.metadata)}
                </pre>
              </details>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function createNotificationColumns(): Array<DataTableColumn<NotificationLog>> {
  return [
    {
      header: "Channel",
      key: "channel",
      render: (notification) => notification.channel,
      width: 105,
    },
    {
      header: "Target",
      key: "target",
      render: (notification) => (
        <div className="grid gap-1 min-w-45">
          <strong className="text-ink text-sm font-[650] leading-[1.3]">{formatNotificationTargetType(notification.target_type)}</strong>
          <span className="block text-ink-subtle font-mono text-xs leading-[1.35] max-w-140 overflow-hidden text-ellipsis whitespace-nowrap">
            {notification.target_address}
          </span>
        </div>
      ),
    },
    {
      header: "Status",
      key: "status",
      render: (notification) => <NotificationStatusBadge status={notification.status} />,
      width: 120,
    },
    {
      header: "Attempt",
      key: "attempt",
      render: (notification) => notification.attempt,
      width: 80,
    },
    {
      header: "Sent",
      key: "sent_at",
      render: (notification) => formatDateTime(notification.sent_at),
      width: 140,
    },
    {
      header: "Details",
      key: "details",
      render: (notification) => (
        <Link
          className="text-ink-muted text-xs font-semibold no-underline hover:text-ink"
          onClick={(event) => event.stopPropagation()}
          to={`/operations?tab=notifications&notificationId=${notification.id}`}
        >
          View attempts
        </Link>
      ),
      width: 125,
    },
  ];
}

function createServiceNameMap(services: Service[]) {
  return new Map(services.map((service) => [service.id, service.name]));
}

function formatNullableAction(actorId: string | null, actedAt: string | null) {
  if (!actedAt) return "-";
  return actorId ? `${formatDateTime(actedAt)} by ${shortId(actorId)}` : formatDateTime(actedAt);
}

function formatNotificationTargetType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function canUseIncidentResponseActions(roles: readonly WorkspaceRoleKey[]) {
  return hasWorkspacePermission(roles, "incident.respond");
}

function formatMetadata(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
