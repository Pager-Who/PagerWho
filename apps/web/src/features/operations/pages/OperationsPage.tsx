import type {
  ActivityLog,
  NotificationDeliveryAttempt,
  NotificationLog,
  StuckEscalation,
  WorkerRunLog,
} from "@im/contracts";
import { Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  NotificationCard,
  NotificationStatusBadge,
  PageHeader,
  Panel,
  TabButton,
  TablePageSkeleton,
  type DataTableColumn,
} from "../../../shared/components";
import { LocalizedText } from "../../../shared/i18n";
import { cn, formatDateTime, formatDurationSeconds, formatRelativeTime, shortId } from "../../../shared/utils";
import {
  useActivityLogs,
  useDeadLetterNotifications,
  useNotificationAttempts,
  useNotificationDetail,
  useNotificationList,
  useOperationsWorkspaceRoles,
  useStuckEscalations,
  useWorkerHealth,
  useWorkerReadiness,
  useWorkerRuns,
} from "../queries";
import { hasWorkspacePermission, useAuth } from "../../../shared/auth";

type OperationsTab = "worker" | "notifications" | "dead-letters" | "activity";
type WorkerRunFilter = "actionable" | "failed" | "all";

export function OperationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<OperationsTab>(() => parseOperationsTab(searchParams.get("tab")));
  const [workerRunFilter, setWorkerRunFilter] = useState<WorkerRunFilter>("actionable");
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(() => searchParams.get("notificationId"));
  const [runPages, setRunPages] = useState<string[]>([]);
  const [notificationPages, setNotificationPages] = useState<string[]>([]);
  const [deadLetterPages, setDeadLetterPages] = useState<string[]>([]);
  const [activityPages, setActivityPages] = useState<string[]>([]);
  const { isPlatformAdmin } = useAuth();

  const workspaceRolesQuery = useOperationsWorkspaceRoles();
  const canViewOperations = isPlatformAdmin || hasWorkspacePermission(workspaceRolesQuery.data ?? [], "project.manage");
  const operationsQueryOptions = useMemo(() => ({ enabled: canViewOperations }), [canViewOperations]);

  const healthQuery = useWorkerHealth(operationsQueryOptions);
  const readinessQuery = useWorkerReadiness(operationsQueryOptions);
  const workerRunsQuery = useWorkerRuns({ limit: 25, ...(runPages.length ? { cursor: runPages.at(-1)! } : {}) }, operationsQueryOptions);
  const stuckEscalationsQuery = useStuckEscalations(operationsQueryOptions);
  const notificationsQuery = useNotificationList({ limit: 25, ...(notificationPages.length ? { cursor: notificationPages.at(-1)! } : {}) }, operationsQueryOptions);
  const deadLetterQuery = useDeadLetterNotifications({ limit: 25, ...(deadLetterPages.length ? { cursor: deadLetterPages.at(-1)! } : {}) }, operationsQueryOptions);
  const attemptsQuery = useNotificationAttempts(selectedNotificationId, operationsQueryOptions);
  const activityLogsQuery = useActivityLogs({ limit: 50, ...(activityPages.length ? { cursor: activityPages.at(-1)! } : {}) }, operationsQueryOptions);

  const workerRuns = workerRunsQuery.data?.items ?? [];
  const stuckEscalations = stuckEscalationsQuery.data?.items ?? [];
  const notifications = notificationsQuery.data?.items ?? [];
  const deadLetters = deadLetterQuery.data?.items ?? [];
  const selectedNotificationFromList = notifications.find((notification) => notification.id === selectedNotificationId)
    ?? deadLetters.find((notification) => notification.id === selectedNotificationId)
    ?? null;
  const notificationDetailQuery = useNotificationDetail(
    selectedNotificationFromList ? null : selectedNotificationId,
    operationsQueryOptions,
  );
  const selectedNotification = notificationDetailQuery.data ?? selectedNotificationFromList;
  const attempts = attemptsQuery.data ?? [];
  const activityLogs = activityLogsQuery.data?.items ?? [];
  const quietWorkerRuns = workerRuns.filter(isQuietWorkerRun);
  const actionableWorkerRuns = workerRuns.filter((run) => !isQuietWorkerRun(run));
  const failedWorkerRuns = workerRuns.filter((run) => run.status === "failed");
  const visibleWorkerRuns = filterWorkerRuns(workerRuns, workerRunFilter);
  const quietWorkerRunCount = quietWorkerRuns.length;

  const runColumns = useMemo<Array<DataTableColumn<WorkerRunLog>>>(() => createWorkerRunColumns(), []);
  const stuckColumns = useMemo<Array<DataTableColumn<StuckEscalation>>>(() => createStuckEscalationColumns(), []);
  const notificationColumns = useMemo<Array<DataTableColumn<NotificationLog>>>(
    () => createNotificationColumns(selectNotification),
    [activeTab],
  );
  const attemptColumns = useMemo<Array<DataTableColumn<NotificationDeliveryAttempt>>>(() => createAttemptColumns(), []);
  const activityColumns = useMemo<Array<DataTableColumn<ActivityLog>>>(() => createActivityColumns(), []);

  function selectTab(tab: OperationsTab) {
    setActiveTab(tab);
    setSelectedNotificationId(null);
    setSearchParams({ tab }, { replace: true });
  }

  function selectNotification(notification: NotificationLog) {
    setSelectedNotificationId(notification.id);
    setSearchParams({ tab: activeTab, notificationId: notification.id }, { replace: true });
  }

  if (workspaceRolesQuery.isLoading) {
    return (
      <LocalizedText>
      <section className="grid min-w-0 gap-4">
          <LoadingState message="Checking operations access..." />
        </section>
      </LocalizedText>
    );
  }

  if (workspaceRolesQuery.error) {
    return (
      <LocalizedText>
      <section className="grid min-w-0 gap-4">
          <ErrorState error={workspaceRolesQuery.error} onRetry={() => void workspaceRolesQuery.refetch()} title="Could not check operations access" />
        </section>
      </LocalizedText>
    );
  }

  if (!canViewOperations) {
    return (
      <LocalizedText>
        <section className="grid gap-4">
          <ErrorState
            action={
              <Link className="flex text-ink-muted text-[13px] font-[650] leading-none no-underline hover:text-ink" to="/incidents">
                Back to incidents
              </Link>
            }
            error="Project management permission is required to view worker health, notification delivery logs, and activity history."
            title="Project management access required"
          />
        </section>
      </LocalizedText>
    );
  }

  return (
    <LocalizedText>
      <section className="grid min-w-0 gap-4">
      <PageHeader
        description="Internal diagnostics for background escalation, notification delivery, retry, and audit workers."
        help="Use Operations when an incident notification or escalation does not behave as expected. Start with Worker for processing health, Notifications for delivery attempts, Dead letters for failed work, and Activity for an audit trail."
        title="System diagnostics"
      />

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          caption="Background processors"
          label="Health"
          tone={healthQuery.data?.status === "ok" ? "green" : "yellow"}
          value={healthQuery.data?.status ?? "-"}
        />
        <MetricCard
          caption="Can process due work"
          label="Readiness"
          tone={readinessQuery.data?.ready ? "green" : "red"}
          value={readinessQuery.isLoading ? "-" : readinessQuery.data?.ready ? "ready" : "not ready"}
        />
        <MetricCard
          caption="Needs operator review"
          label="Dead letters"
          tone={deadLetters.length > 0 ? "red" : "green"}
          value={deadLetterQuery.data?.next_cursor ? `${deadLetters.length}+` : deadLetters.length}
        />
        <MetricCard
          caption="Overdue escalation states"
          label="Stuck"
          tone={stuckEscalations.length > 0 ? "yellow" : "green"}
          value={stuckEscalationsQuery.data?.next_cursor ? `${stuckEscalations.length}+` : stuckEscalations.length}
        />
      </div>

      {healthQuery.error ? <ErrorState error={healthQuery.error} onRetry={() => void healthQuery.refetch()} title="Could not load worker health" /> : null}

      <Panel className="grid min-w-0 gap-4.5">
        <div aria-label="Operations sections" className="flex items-center gap-1 border-b border-hairline-soft pb-2.5 overflow-x-auto" role="tablist">
          <TabButton active={activeTab === "worker"} id="operations-tab-worker" label="Worker" onClick={() => selectTab("worker")} panelId="operations-panel-worker" />
          <TabButton active={activeTab === "notifications"} count={notifications.length} id="operations-tab-notifications" label="Notifications" onClick={() => selectTab("notifications")} panelId="operations-panel-notifications" />
          <TabButton active={activeTab === "dead-letters"} count={deadLetters.length} id="operations-tab-dead-letters" label="Dead letters" onClick={() => selectTab("dead-letters")} panelId="operations-panel-dead-letters" />
          <TabButton active={activeTab === "activity"} count={activityLogs.length} id="operations-tab-activity" label="Activity" onClick={() => selectTab("activity")} panelId="operations-panel-activity" />
        </div>

        <div className="rounded-lg border border-hairline-soft bg-surface-2/45 px-3.5 py-3 text-ink-muted text-xs leading-[1.45]">
          {activeTab === "worker"
            ? "Check whether background processors are healthy and review failed or actionable runs."
            : activeTab === "notifications"
              ? "Inspect notification delivery records and select one to see each provider attempt."
              : activeTab === "dead-letters"
                ? "Review notifications that exhausted their retries or need operator attention."
                : "Review the recent changes and actions recorded for this project."}
        </div>

        {activeTab === "worker" ? (
          <div aria-labelledby="operations-tab-worker" className="grid gap-4 min-w-0" id="operations-panel-worker" role="tabpanel">
            <div className="grid items-start gap-4.5 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
              <section className="grid gap-3 min-w-0">
                <div className="grid gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-ink text-[17px] font-semibold leading-tight m-0 mb-1.25">Worker runs</h3>
                      <p className="text-ink-muted text-[13px] leading-[1.45] m-0 max-w-140">
                        Workers check for due escalation and notification retry work continuously. Successful checks with 0 processed are normal and hidden by default.
                      </p>
                    </div>
                    {quietWorkerRunCount > 0 ? <Badge tone="neutral">{quietWorkerRunCount} quiet checks on this page</Badge> : null}
                  </div>
                  <div aria-label="Worker run filters" className="flex items-center flex-wrap gap-1.5">
                    <WorkerRunFilterButton
                      active={workerRunFilter === "actionable"}
                      count={actionableWorkerRuns.length}
                      label="Action needed"
                      onClick={() => setWorkerRunFilter("actionable")}
                    />
                    <WorkerRunFilterButton
                      active={workerRunFilter === "failed"}
                      count={failedWorkerRuns.length}
                      label="Failed"
                      onClick={() => setWorkerRunFilter("failed")}
                    />
                    <WorkerRunFilterButton
                      active={workerRunFilter === "all"}
                      count={workerRuns.length}
                      label="All checks"
                      onClick={() => setWorkerRunFilter("all")}
                    />
                  </div>
                </div>
                {workerRunsQuery.isLoading ? (
                  <TablePageSkeleton label="Loading worker runs" />
                ) : workerRunsQuery.error ? (
                  <ErrorState error={workerRunsQuery.error} onRetry={() => void workerRunsQuery.refetch()} title="Could not load worker runs" />
                ) : (
                  <DataTable
                    columns={runColumns}
                    emptyState={<EmptyWorkerRunState filter={workerRunFilter} quietCount={quietWorkerRunCount} />}
                    getRowKey={(run) => run.id}
                    rows={visibleWorkerRuns}
                  />
                )}
                {!workerRunsQuery.error ? <OperationsPager busy={workerRunsQuery.isFetching} nextCursor={workerRunsQuery.data?.next_cursor} pages={runPages} setPages={setRunPages} /> : null}
              </section>
              <section className="grid gap-3 min-w-0">
                <div>
                  <h3 className="text-ink text-[17px] font-semibold leading-tight m-0 mb-1.25">Stuck escalations</h3>
                  <p className="text-ink-muted text-[13px] leading-[1.45] m-0 max-w-140">
                    Escalation states that are overdue for their next step and may need operator review.
                  </p>
                </div>
                {stuckEscalationsQuery.isLoading ? (
                  <TablePageSkeleton label="Loading stuck escalations" />
                ) : stuckEscalationsQuery.error ? (
                  <ErrorState error={stuckEscalationsQuery.error} onRetry={() => void stuckEscalationsQuery.refetch()} title="Could not load stuck escalations" />
                ) : (
                  <DataTable
                    columns={stuckColumns}
                    emptyState={<EmptyState message="No stuck escalation states found." title="No stuck escalations" />}
                    getRowKey={(escalation) => escalation.incident_id}
                    rows={stuckEscalations}
                  />
                )}
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "notifications" ? (
          <div aria-labelledby="operations-tab-notifications" className="grid gap-4 min-w-0" id="operations-panel-notifications" role="tabpanel">
            <div className="grid min-w-0 items-start gap-4.5 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
              <section className="min-w-0">
                <h3 className="text-ink text-[17px] font-semibold leading-tight m-0 mb-1.25">Delivery logs</h3>
                <p className="text-ink-muted text-[13px] leading-[1.45] m-0 mb-3">Select a record to inspect its provider attempts.</p>
                {notificationsQuery.isLoading ? (
                  <TablePageSkeleton label="Loading notifications" />
                ) : notificationsQuery.error ? (
                  <ErrorState error={notificationsQuery.error} onRetry={() => void notificationsQuery.refetch()} title="Could not load notifications" />
                ) : (
                  <>
                    <div className="hidden md:block">
                      <DataTable
                        columns={notificationColumns}
                        emptyState={<EmptyState message="No notification logs found." title="No notifications" />}
                        getRowKey={(notification) => notification.id}
                        onRowClick={selectNotification}
                        rows={notifications}
                      />
                    </div>
                    <div className="grid gap-2 md:hidden">
                      {notifications.length > 0 ? notifications.map((notification) => (
                        <NotificationCard key={notification.id} notification={notification} onSelect={() => selectNotification(notification)} />
                      )) : <div className="bg-surface-1 border border-hairline rounded-md p-4.5"><EmptyState message="No notification logs found." title="No notifications" /></div>}
                    </div>
                  </>
                )}
                {!notificationsQuery.error ? <OperationsPager busy={notificationsQuery.isFetching} nextCursor={notificationsQuery.data?.next_cursor} pages={notificationPages} setPages={(pages) => { setSelectedNotificationId(null); setNotificationPages(pages); }} /> : null}
              </section>
              <section className="min-w-0">
                <h3 className="text-ink text-[17px] font-semibold leading-tight m-0 mb-1.25">Attempt detail</h3>
                <p className="text-ink-muted text-[13px] leading-[1.45] m-0 mb-3">See whether delivery was sent, retried, or failed.</p>
                <NotificationDetailSummary isLoading={notificationDetailQuery.isLoading} notification={selectedNotification} />
                {!selectedNotificationId ? (
                  <EmptyState message="Select a notification from delivery logs or dead letters." title="No notification selected" />
                ) : attemptsQuery.isLoading ? (
                  <TablePageSkeleton label="Loading delivery attempts" />
                ) : attemptsQuery.error ? (
                  <ErrorState error={attemptsQuery.error} onRetry={() => void attemptsQuery.refetch()} title="Could not load delivery attempts" />
                ) : (
                  <DataTable
                    columns={attemptColumns}
                    emptyState={<EmptyState message="No delivery attempts recorded." title="No attempts" />}
                    getRowKey={(attempt) => attempt.id}
                    rows={attempts}
                  />
                )}
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "dead-letters" ? (
          <div aria-labelledby="operations-tab-dead-letters" className="grid gap-4 min-w-0" id="operations-panel-dead-letters" role="tabpanel">
            <div className="grid min-w-0 items-start gap-4.5 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
              <section className="min-w-0">
                <h3 className="text-ink text-[17px] font-semibold leading-tight m-0 mb-1.25">Failed notifications</h3>
                <p className="text-ink-muted text-[13px] leading-[1.45] m-0 mb-3">These records need review because automatic delivery did not complete.</p>
                {deadLetterQuery.isLoading ? (
                  <TablePageSkeleton label="Loading dead letters" />
                ) : deadLetterQuery.error ? (
                  <ErrorState error={deadLetterQuery.error} onRetry={() => void deadLetterQuery.refetch()} title="Could not load dead letters" />
                ) : (
                  <>
                    <div className="hidden md:block">
                      <DataTable
                        columns={notificationColumns}
                        emptyState={<EmptyState message="No failed notifications are waiting for review." title="No dead letters" />}
                        getRowKey={(notification) => notification.id}
                        onRowClick={selectNotification}
                        rows={deadLetters}
                      />
                    </div>
                    <div className="grid gap-2 md:hidden">
                      {deadLetters.length > 0 ? deadLetters.map((notification) => (
                        <NotificationCard key={notification.id} notification={notification} onSelect={() => selectNotification(notification)} />
                      )) : <div className="bg-surface-1 border border-hairline rounded-md p-4.5"><EmptyState message="No failed notifications are waiting for review." title="No dead letters" /></div>}
                    </div>
                  </>
                )}
                {!deadLetterQuery.error ? <OperationsPager busy={deadLetterQuery.isFetching} nextCursor={deadLetterQuery.data?.next_cursor} pages={deadLetterPages} setPages={(pages) => { setSelectedNotificationId(null); setDeadLetterPages(pages); }} /> : null}
              </section>
              <section className="min-w-0">
                <h3 className="text-ink text-[17px] font-semibold leading-tight m-0 mb-1.25">Attempt detail</h3>
                <p className="text-ink-muted text-[13px] leading-[1.45] m-0 mb-3">Inspect the provider errors and retry history for the selected record.</p>
                <NotificationDetailSummary isLoading={notificationDetailQuery.isLoading} notification={selectedNotification} />
                {!selectedNotificationId ? (
                  <EmptyState message="Select a failed notification to inspect its delivery attempts." title="No notification selected" />
                ) : attemptsQuery.isLoading ? (
                  <TablePageSkeleton label="Loading delivery attempts" />
                ) : attemptsQuery.error ? (
                  <ErrorState error={attemptsQuery.error} onRetry={() => void attemptsQuery.refetch()} title="Could not load delivery attempts" />
                ) : (
                  <DataTable
                    columns={attemptColumns}
                    emptyState={<EmptyState message="No delivery attempts recorded." title="No attempts" />}
                    getRowKey={(attempt) => attempt.id}
                    rows={attempts}
                  />
                )}
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "activity" ? (
          <div aria-labelledby="operations-tab-activity" className="grid gap-4 min-w-0" id="operations-panel-activity" role="tabpanel">
            {activityLogsQuery.isLoading ? (
              <TablePageSkeleton label="Loading activity logs" />
            ) : activityLogsQuery.error ? (
              <ErrorState error={activityLogsQuery.error} onRetry={() => void activityLogsQuery.refetch()} title="Could not load activity logs" />
            ) : (
              <DataTable
                columns={activityColumns}
                emptyState={<EmptyState message="No activity logs found." title="No activity" />}
                getRowKey={(log) => log.id}
                rows={activityLogs}
              />
            )}
            {!activityLogsQuery.error ? <OperationsPager busy={activityLogsQuery.isFetching} nextCursor={activityLogsQuery.data?.next_cursor} pages={activityPages} setPages={setActivityPages} /> : null}
          </div>
        ) : null}
      </Panel>
      </section>
    </LocalizedText>
  );
}

function OperationsPager({ busy, nextCursor, pages, setPages }: { busy: boolean; nextCursor: string | null | undefined; pages: string[]; setPages: (pages: string[]) => void }) {
  return <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
    <span>Page {pages.length + 1}</span>
    <div className="flex gap-2">
      <Button disabled={busy || pages.length === 0} onClick={() => setPages(pages.slice(0, -1))} size="sm" variant="ghost">Previous</Button>
      <Button disabled={busy || !nextCursor} onClick={() => nextCursor && setPages([...pages, nextCursor])} size="sm" variant="ghost">Next</Button>
    </div>
  </div>;
}

function NotificationDetailSummary({
  isLoading,
  notification,
}: {
  isLoading: boolean;
  notification: NotificationLog | null;
}) {
  if (isLoading) {
    return <div className="mb-3 rounded-md border border-hairline-soft bg-surface-2/45 px-3 py-2.5 text-xs text-ink-muted" role="status">Loading notification details...</div>;
  }

  if (!notification) return null;

  return (
    <div className="mb-3 grid gap-3 rounded-lg border border-hairline-soft bg-canvas/45 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1 min-w-0">
          <strong className="text-ink text-sm font-[650] leading-[1.3]">{formatNotificationLabel(notification.channel)} · {formatNotificationLabel(notification.target_type)}</strong>
          <span className="break-all font-mono text-xs text-ink-muted">{notification.target_address}</span>
        </div>
        <NotificationStatusBadge status={notification.status} />
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <NotificationSummaryItem label="Attempts" value={String(notification.attempt)} />
        <NotificationSummaryItem icon={<Clock3 aria-hidden="true" size={12} />} label="Next retry" value={formatDateTime(notification.next_retry_at)} />
        <NotificationSummaryItem label="Updated" value={formatRelativeTime(notification.updated_at)} />
      </div>
      {notification.error_message ? (
        <p className="m-0 break-words rounded-md border border-danger/25 bg-danger/10 px-2.5 py-2 text-xs leading-[1.45] text-[#ff98ad]">
          {notification.error_message}
        </p>
      ) : null}
      <div>
        <Link className="text-xs font-semibold text-ink-muted no-underline hover:text-ink" to={`/incidents/${notification.incident_id}`}>
          Open incident
        </Link>
      </div>
    </div>
  );
}

function NotificationSummaryItem({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="flex items-center gap-1 text-ink-subtle text-[10px] font-[750] uppercase">{icon}{label}</span>
      <span className="truncate text-ink-muted" title={value}>{value}</span>
    </div>
  );
}

function formatNotificationLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseOperationsTab(value: string | null): OperationsTab {
  if (value === "notifications" || value === "dead-letters" || value === "activity") {
    return value;
  }

  return "worker";
}

function WorkerRunFilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex items-center justify-center gap-2 min-h-8 rounded-md border border-hairline px-2.75 text-[12px] font-[650] leading-none cursor-pointer transition-colors duration-120 ease",
        active
          ? "bg-surface-2 text-ink"
          : "bg-transparent text-ink-muted hover:bg-surface-1 hover:text-ink",
      )}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <span className="text-ink-subtle font-bold">{count}</span>
    </button>
  );
}

function EmptyWorkerRunState({
  filter,
  quietCount,
}: {
  filter: WorkerRunFilter;
  quietCount: number;
}) {
  if (filter === "actionable" && quietCount > 0) {
    return (
      <EmptyState
        message={`${quietCount} successful no-op checks were hidden. Switch to All checks to inspect the raw heartbeat history.`}
        title="No worker action needed"
      />
    );
  }

  if (filter === "failed") {
    return <EmptyState message="No failed worker runs in the latest history." title="No failed runs" />;
  }

  return <EmptyState message="No worker runs have been recorded." title="No runs" />;
}

function filterWorkerRuns(workerRuns: WorkerRunLog[], filter: WorkerRunFilter) {
  if (filter === "failed") {
    return workerRuns.filter((run) => run.status === "failed");
  }

  if (filter === "actionable") {
    return workerRuns.filter((run) => !isQuietWorkerRun(run));
  }

  return workerRuns;
}

function isQuietWorkerRun(run: WorkerRunLog) {
  return run.status === "succeeded" && run.processed_count === 0;
}

function createWorkerRunColumns(): Array<DataTableColumn<WorkerRunLog>> {
  return [
    {
      header: "Worker",
      key: "worker",
      render: (run) => (
        <div className="grid gap-1 min-w-45">
          <strong className="text-ink text-sm font-[650] leading-[1.3]">{run.worker_name}</strong>
          <span className="text-ink-subtle font-mono text-xs leading-[1.35] block max-w-140 overflow-hidden text-ellipsis whitespace-nowrap">{shortId(run.id)}</span>
        </div>
      ),
    },
    {
      header: "Status",
      key: "status",
      render: (run) => (
        <Badge tone={run.status === "failed" ? "red" : run.status === "running" ? "blue" : "green"}>
          {run.status}
        </Badge>
      ),
      width: 110,
    },
    {
      align: "right",
      header: "Processed",
      key: "processed",
      render: (run) => run.processed_count,
      width: 92,
    },
    {
      header: "Duration",
      key: "duration",
      render: (run) => (run.duration_ms === null ? "-" : `${run.duration_ms}ms`),
      width: 105,
    },
    {
      header: "Started",
      key: "started",
      render: (run) => formatRelativeTime(run.started_at),
      width: 130,
    },
  ];
}

function createStuckEscalationColumns(): Array<DataTableColumn<StuckEscalation>> {
  return [
    {
      header: "Incident",
      key: "incident",
      render: (escalation) => (
        <Link className="inline-flex text-ink-muted text-[13px] font-[650] leading-none no-underline hover:text-ink" to={`/incidents/${escalation.incident_id}`}>
          {shortId(escalation.incident_id)}
        </Link>
      ),
    },
    {
      header: "State",
      key: "state",
      render: (escalation) => <Badge tone="yellow">{escalation.status}</Badge>,
      width: 110,
    },
    {
      header: "Step",
      key: "step",
      render: (escalation) => `Step ${escalation.current_step} / repeat ${escalation.repeat_iteration}`,
      width: 160,
    },
    {
      header: "Overdue",
      key: "overdue",
      render: (escalation) => formatDurationSeconds(escalation.overdue_seconds),
      width: 110,
    },
  ];
}

function createNotificationColumns(
  onSelect: (notification: NotificationLog) => void,
): Array<DataTableColumn<NotificationLog>> {
  return [
    {
      header: "Notification",
      key: "notification",
      render: (notification) => (
        <button
          className="bg-transparent border-0 text-ink cursor-pointer font-[inherit] font-[650] p-0 text-left hover:text-accent-blue"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(notification);
          }}
          type="button"
        >
          {shortId(notification.id)}
        </button>
      ),
      width: 110,
    },
    {
      header: "Channel",
      key: "channel",
      render: (notification) => notification.channel,
      width: 95,
    },
    {
      header: "Status",
      key: "status",
      render: (notification) => <NotificationStatusBadge status={notification.status} />,
      width: 105,
    },
    {
      header: "Target",
      key: "target",
      render: (notification) => (
        <div className="grid gap-1 min-w-45">
          <strong className="text-ink text-sm font-[650] leading-[1.3]">{notification.target_type}</strong>
          <span className="text-ink-subtle font-mono text-xs leading-[1.35] block max-w-140 overflow-hidden text-ellipsis whitespace-nowrap">{notification.target_address}</span>
        </div>
      ),
    },
    {
      header: "Updated",
      key: "updated",
      render: (notification) => formatRelativeTime(notification.updated_at),
      width: 120,
    },
  ];
}

function createAttemptColumns(): Array<DataTableColumn<NotificationDeliveryAttempt>> {
  return [
    {
      align: "right",
      header: "#",
      key: "attempt",
      render: (attempt) => attempt.attempt,
      width: 58,
    },
    {
      header: "Status",
      key: "status",
      render: (attempt) => (
        <Badge
          tone={
            attempt.status === "sent"
              ? "green"
              : attempt.status === "failed" || attempt.status === "timed_out"
                ? "red"
                : "blue"
          }
        >
          {attempt.status}
        </Badge>
      ),
      width: 120,
    },
    {
      header: "Provider",
      key: "provider",
      render: (attempt) => attempt.provider,
      width: 120,
    },
    {
      header: "Completed",
      key: "completed",
      render: (attempt) => formatDateTime(attempt.completed_at),
      width: 150,
    },
    {
      header: "Retry after",
      key: "retry_after",
      render: (attempt) => attempt.retry_after_seconds === null ? "-" : `${attempt.retry_after_seconds}s`,
      width: 110,
    },
    {
      header: "Error",
      key: "error",
      render: (attempt) => attempt.error_message ?? "-",
    },
  ];
}

function createActivityColumns(): Array<DataTableColumn<ActivityLog>> {
  return [
    {
      header: "Action",
      key: "action",
      render: (log) => (
        <div className="grid gap-1 min-w-45">
          <strong className="text-ink text-sm font-[650] leading-[1.3]">{log.action}</strong>
          <span className="text-ink-subtle font-mono text-xs leading-[1.35] block max-w-140 overflow-hidden text-ellipsis whitespace-nowrap">{log.message}</span>
        </div>
      ),
    },
    {
      header: "Resource",
      key: "resource",
      render: (log) => `${log.resource_type} ${log.resource_id ? shortId(log.resource_id) : ""}`,
      width: 190,
    },
    {
      header: "Created",
      key: "created",
      render: (log) => formatRelativeTime(log.created_at),
      width: 130,
    },
  ];
}
