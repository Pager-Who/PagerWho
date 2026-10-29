import type {
  PlatformInspectorQuery,
  PlatformInspectorResourceType,
  PlatformResourceListQuery,
  PlatformUserSummary,
  PlatformWorkspaceSummary,
  WorkspaceQuotaResource,
  WorkspaceRoleKey,
} from "@im/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Building2, Database, Shield, UserRound, type LucideIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { queryKeys } from "../../../shared/api/queryKeys";
import { useAuth, workspaceRoleGroups, formatWorkspaceRoleKey } from "../../../shared/auth";
import {
  Badge,
  BrandMark,
  Button,
  CheckboxField,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  MetricCard,
  OverviewSkeleton,
  PageHeader,
  Panel,
  RefreshingIndicator,
  Select,
  TablePageSkeleton,
  TextInput,
  type DataTableColumn,
} from "../../../shared/components";
import { LocalizedText, useStaticText, useTranslateNode } from "../../../shared/i18n";
import { cn, formatDateTime, formatRelativeTime } from "../../../shared/utils";
import { AdminActionDialog, type AdminAction } from "../components/AdminActionDialog";
import { displayLabel } from "../components/admin-display";
import {
  usePlatformMe,
  usePlatformDiagnostics,
  usePlatformInspector,
  usePlatformResources,
  usePlatformOverview,
  usePlatformUser,
  usePlatformUsers,
  usePlatformWorkspace,
  usePlatformWorkspaces,
  useRevokePlatformUserSessionsMutation,
  useRetryPlatformNotificationMutation,
  useSendPlatformAuthEmailMutation,
  useRestorePlatformUserMutation,
  useRestorePlatformWorkspaceMutation,
  useSuspendPlatformUserMutation,
  useSuspendPlatformWorkspaceMutation,
  useUpdatePlatformWorkspaceMemberRolesMutation,
  useUpdatePlatformWorkspaceQuotaOverrideMutation,
} from "../queries";

type AdminTab = "workspaces" | "dashboard" | "users" | "diagnostics" | "inspector";
type WorkspaceDetailTab = "summary" | "limits" | "access" | "providers" | "timeline";

const sectionCopy: Record<AdminTab, { title: string; description: string }> = {
  workspaces: { title: "Workspaces", description: "Find a workspace, review usage, and manage its limits and access." },
  dashboard: { title: "Platform overview", description: "Review platform health and find operational issues that need attention." },
  users: { title: "Accounts", description: "Find an account, review sign-in activity, and resolve access issues." },
  diagnostics: { title: "Platform diagnostics", description: "Investigate delivery failures, webhook ingestion, and worker runs." },
  inspector: { title: "Data inspector", description: "Search recent records by name. Inspection is read-only and audited." },
};

export function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectProject, userId } = useAuth();
  const t = useStaticText();
  const [activeTab, setActiveTab] = useState<AdminTab>("workspaces");
  const [userSearch, setUserSearch] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceDetailTab, setWorkspaceDetailTab] = useState<WorkspaceDetailTab>("summary");
  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const [userPages, setUserPages] = useState<string[]>([]);
  const [workspacePages, setWorkspacePages] = useState<string[]>([]);
  const [userStatus, setUserStatus] = useState<"" | "active" | "suspended">("");
  const [workspaceStatus, setWorkspaceStatus] = useState<"" | "active" | "suspended">("");
  const [diagnosticKind, setDiagnosticKind] = useState<"all" | "notification" | "webhook" | "worker">("all");
  const [diagnosticSearch, setDiagnosticSearch] = useState("");
  const [diagnosticRequestId, setDiagnosticRequestId] = useState("");
  const [diagnosticWorkspaceId, setDiagnosticWorkspaceId] = useState("");
  const [inspectorResourceType, setInspectorResourceType] = useState<PlatformInspectorResourceType>("user");
  const [inspectorResourceId, setInspectorResourceId] = useState("");
  const [inspectorSearch, setInspectorSearch] = useState("");
  const [inspectorQuery, setInspectorQuery] = useState<PlatformInspectorQuery | null>(null);
  const [resourceListQuery, setResourceListQuery] = useState<PlatformResourceListQuery>({
    limit: 50,
    resource_type: "user",
  });
  const [quotaResource, setQuotaResource] = useState<Exclude<WorkspaceQuotaResource, "workspaces">>("services");
  const [quotaLimit, setQuotaLimit] = useState("");
  const [quotaExpiresAt, setQuotaExpiresAt] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [rolesDraft, setRolesDraft] = useState<WorkspaceRoleKey[] | null>(null);
  const deferredUserSearch = useDebouncedValue(userSearch);
  const deferredWorkspaceSearch = useDebouncedValue(workspaceSearch);
  const deferredDiagnosticSearch = useDebouncedValue(diagnosticSearch);
  const deferredRequestId = useDebouncedValue(diagnosticRequestId);

  const meQuery = usePlatformMe();
  const isAdmin = Boolean(meQuery.data?.is_platform_admin);
  const overviewQuery = usePlatformOverview(isAdmin && activeTab === "dashboard");
  const diagnosticsFilters = useMemo(() => ({
    kind: diagnosticKind,
    limit: 50,
    ...(deferredDiagnosticSearch.trim() ? { search: deferredDiagnosticSearch.trim() } : {}),
    ...(deferredRequestId.trim() ? { request_id: deferredRequestId.trim() } : {}),
    ...(diagnosticWorkspaceId ? { workspace_id: diagnosticWorkspaceId } : {}),
  }), [diagnosticKind, deferredRequestId, deferredDiagnosticSearch, diagnosticWorkspaceId]);
  const diagnosticsQuery = usePlatformDiagnostics(diagnosticsFilters, isAdmin && activeTab === "diagnostics");
  const inspectorResultQuery = usePlatformInspector(inspectorQuery, isAdmin && activeTab === "inspector");
  const resourceListResultQuery = usePlatformResources(resourceListQuery, isAdmin && activeTab === "inspector");
  const userFilters = useMemo(() => ({
    limit: 25,
    ...(deferredUserSearch.trim() ? { search: deferredUserSearch.trim() } : {}),
    ...(userStatus ? { status: userStatus } : {}),
    ...(userPages.length ? { cursor: userPages.at(-1)! } : {}),
  }), [deferredUserSearch, userStatus, userPages]);
  const workspaceFilters = useMemo(() => ({
    limit: 25,
    ...(deferredWorkspaceSearch.trim() ? { search: deferredWorkspaceSearch.trim() } : {}),
    ...(workspaceStatus ? { status: workspaceStatus } : {}),
    ...(workspacePages.length ? { cursor: workspacePages.at(-1)! } : {}),
  }), [deferredWorkspaceSearch, workspaceStatus, workspacePages]);
  const usersQuery = usePlatformUsers(activeTab === "dashboard" ? { limit: 8 } : userFilters, isAdmin && (activeTab === "users" || activeTab === "dashboard"));
  const workspacesQuery = usePlatformWorkspaces(activeTab === "dashboard" ? { limit: 8 } : activeTab === "diagnostics" ? { limit: 100 } : workspaceFilters, isAdmin && ["workspaces", "dashboard", "diagnostics"].includes(activeTab));
  const selectedUserQuery = usePlatformUser(selectedUserId, isAdmin && activeTab === "users");
  const selectedWorkspaceQuery = usePlatformWorkspace(selectedWorkspaceId, isAdmin && activeTab === "workspaces");
  const selectedUser = selectedUserQuery.data ?? null;
  const selectedWorkspace = selectedWorkspaceQuery.data ?? null;
  const selectedMember = selectedWorkspace?.members.find((member) => member.user_id === selectedMemberId) ?? selectedWorkspace?.members[0];
  const selectedRoles = rolesDraft ?? selectedMember?.roles ?? [];
  const suspendUserMutation = useSuspendPlatformUserMutation(selectedUserId ?? "");
  const restoreUserMutation = useRestorePlatformUserMutation(selectedUserId ?? "");
  const revokeUserSessionsMutation = useRevokePlatformUserSessionsMutation(selectedUserId ?? "");
  const sendAuthEmailMutation = useSendPlatformAuthEmailMutation(selectedUserId ?? "");
  const retryNotificationMutation = useRetryPlatformNotificationMutation();
  const suspendWorkspaceMutation = useSuspendPlatformWorkspaceMutation(selectedWorkspaceId ?? "");
  const restoreWorkspaceMutation = useRestorePlatformWorkspaceMutation(selectedWorkspaceId ?? "");
  const updateQuotaMutation = useUpdatePlatformWorkspaceQuotaOverrideMutation(selectedWorkspaceId ?? "");
  const updateMemberRolesMutation = useUpdatePlatformWorkspaceMemberRolesMutation(selectedWorkspaceId ?? "", selectedMember?.user_id ?? "");
  const quotaOverrideIsValid = Number.isInteger(Number(quotaLimit))
    && Number(quotaLimit) > 0
    && Number.isFinite(new Date(quotaExpiresAt).getTime())
    && new Date(quotaExpiresAt) > new Date();

  useEffect(() => {
    if (!selectedWorkspaceId && workspacesQuery.data?.items[0]) {
      setSelectedWorkspaceId(workspacesQuery.data.items[0].id);
    }
  }, [selectedWorkspaceId, workspacesQuery.data]);

  useEffect(() => {
    setWorkspaceDetailTab("summary");
    setSelectedMemberId("");
    setRolesDraft(null);
    setQuotaLimit("");
    setQuotaExpiresAt("");
  }, [selectedWorkspaceId]);

  const userColumns = useMemo<Array<DataTableColumn<PlatformUserSummary>>>(() => [
    {
      header: "User",
      key: "user",
      render: (user) => (
        <div className="grid gap-1">
          <span className="font-semibold">{user.name}</span>
          <span className="text-ink-muted text-xs">{user.email}</span>
        </div>
      ),
    },
    {
      header: "Status",
      key: "status",
      render: (user) => <StatusBadge suspendedAt={user.suspended_at} />,
      width: 120,
    },
    {
      header: "Roles",
      key: "roles",
      render: (user) => user.platform_roles.length > 0 ? <Badge tone="blue">platform admin</Badge> : <span className="text-ink-muted">-</span>,
      width: 150,
    },
    {
      header: "Workspaces",
      key: "workspaces",
      render: (user) => user.workspace_count,
      width: 120,
    },
    {
      header: "Created",
      key: "created",
      render: (user) => <time dateTime={user.created_at} title={formatDateTime(user.created_at)}>{formatRelativeTime(user.created_at)}</time>,
      width: 130,
    },
  ], []);

  const workspaceColumns = useMemo<Array<DataTableColumn<PlatformWorkspaceSummary>>>(() => [
    {
      header: "Workspace",
      key: "workspace",
      render: (workspace) => (
        <div className="grid gap-1">
          <span className="font-semibold">{workspace.name}</span>
          <span className="text-ink-muted text-xs">{workspace.slug}</span>
        </div>
      ),
    },
    {
      header: "Status",
      key: "status",
      render: (workspace) => <StatusBadge suspendedAt={workspace.suspended_at} />,
      width: 120,
    },
    {
      header: "Members",
      key: "members",
      render: (workspace) => workspace.member_count,
      width: 110,
    },
    {
      header: "Services",
      key: "services",
      render: (workspace) => workspace.service_count,
      width: 110,
    },
    {
      header: "Open incidents",
      key: "open_incidents",
      render: (workspace) => workspace.open_incident_count,
      width: 130,
    },
    {
      header: "Created",
      key: "created",
      render: (workspace) => <time dateTime={workspace.created_at} title={formatDateTime(workspace.created_at)}>{formatRelativeTime(workspace.created_at)}</time>,
      width: 130,
    },
  ], []);

  async function refreshAdminData() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.platform.all,
      predicate: (query) => !["inspector", "resources"].includes(String(query.queryKey[1])),
    });
  }

  function manageWorkspace(workspaceId: string, destination = "/overview") {
    selectProject(workspaceId);
    navigate(destination);
  }

  function toggleRole(role: WorkspaceRoleKey) {
    setRolesDraft(
      selectedRoles.includes(role)
        ? selectedRoles.filter((item) => item !== role)
        : [...selectedRoles, role],
    );
  }

  function runUserStatusAction(action: "suspend" | "restore") {
    if (!selectedUser) return;
    setPendingAction({
      title: action === "suspend" ? "Suspend user" : "Restore user",
      description: action === "suspend" ? "This account will lose access. Existing sessions will be revoked." : "This account will be able to sign in again.",
      target: `${selectedUser.name} · ${selectedUser.email}`,
      danger: action === "suspend",
      submit: (reason) => action === "suspend" ? suspendUserMutation.mutateAsync({ reason }) : restoreUserMutation.mutateAsync({ reason }),
    });
  }

  function revokeUserSessions() {
    if (!selectedUser) return;
    setPendingAction({
      title: "Sign out all sessions", description: "All devices will be signed out. The user can sign in again.",
      target: selectedUser.email, danger: true,
      submit: (reason) => revokeUserSessionsMutation.mutateAsync({ reason }),
    });
  }

  function sendUserAuthEmail(kind: "email_verification" | "password_reset") {
    if (!selectedUser) return;
    setPendingAction({
      title: kind === "email_verification" ? "Resend verification email" : "Send password reset",
      description: "An authentication email will be requested for this account. Delivery is subject to mail configuration and cooldown limits.",
      target: selectedUser.email,
      submit: (reason) => sendAuthEmailMutation.mutateAsync({ kind, reason }),
    });
  }

  function retryNotification(notificationId: string) {
    const item = diagnosticsQuery.data?.items.find((record) => record.id === notificationId);
    setPendingAction({
      title: "Retry notification", description: "This notification will be queued for another delivery attempt. The recipient may receive it again.",
      target: `${item?.incident_title ?? item?.title ?? notificationId} · ${item?.channel ?? ""}`, danger: true,
      submit: (reason) => retryNotificationMutation.mutateAsync({ notificationId, reason }),
    });
  }

  function runWorkspaceStatusAction(action: "suspend" | "restore") {
    if (!selectedWorkspace) return;
    setPendingAction({
      title: action === "suspend" ? "Suspend workspace" : "Restore workspace",
      description: action === "suspend" ? "Members will lose access to this workspace. Review the customer impact before continuing." : "Members will regain access to this workspace.",
      target: `${selectedWorkspace.name} · ${selectedWorkspace.slug}`, danger: action === "suspend",
      submit: (reason) => action === "suspend" ? suspendWorkspaceMutation.mutateAsync({ reason }) : restoreWorkspaceMutation.mutateAsync({ reason }),
    });
  }

  function updateQuotaOverride(remove = false) {
    if (!selectedWorkspace || (!remove && !quotaOverrideIsValid)) return;
    setPendingAction({
      title: remove ? "Remove override" : "Apply temporary override",
      description: remove ? "The workspace will return to its installation limit for this resource." : "This limit replaces the installation limit until the selected expiry time.",
      target: `${selectedWorkspace.name} · ${t(displayLabel(quotaResource))}${remove ? "" : ` · ${quotaLimit} · ${formatDateTime(new Date(quotaExpiresAt).toISOString())}`}`,
      danger: remove,
      submit: async (reason) => {
        await updateQuotaMutation.mutateAsync({ expires_at: remove ? null : new Date(quotaExpiresAt).toISOString(), limit: remove ? null : Number(quotaLimit), reason, resource: quotaResource });
        setQuotaLimit("");
        setQuotaExpiresAt("");
      },
    });
  }

  function updateMemberRoles() {
    if (!selectedWorkspace || !selectedMember || selectedRoles.length === 0) return;
    setPendingAction({
      title: "Update member roles", description: "The selected roles will replace this member's current permissions in the workspace.",
      target: `${selectedWorkspace.name} · ${selectedMember.email} · ${selectedRoles.map((role) => t(formatWorkspaceRoleKey(role))).join(", ")}`, danger: true,
      submit: async (reason) => {
        await updateMemberRolesMutation.mutateAsync({ reason, roles: selectedRoles });
        setRolesDraft(null);
      },
    });
  }

  if (meQuery.isLoading) {
    return (
      <LocalizedText>
        <main className="grid min-h-screen place-items-center bg-canvas p-7.5">
          <LoadingState message="Checking admin access..." />
        </main>
      </LocalizedText>
    );
  }

  if (meQuery.error || !isAdmin) {
    return (
      <LocalizedText>
        <main className="grid min-h-screen place-items-center bg-canvas p-7.5">
          <div className="w-full max-w-150">
            <ErrorState error={meQuery.error ?? "Platform admin access is required."} title="Admin access required" />
          </div>
        </main>
      </LocalizedText>
    );
  }

  const counts = overviewQuery.data?.counts;

  return (
    <LocalizedText>
      <main className="min-h-screen bg-canvas">
        <header className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline-soft bg-canvas/95 px-4 py-3 backdrop-blur-[18px] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:px-7.5">
          <button
            className="inline-flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-[15px] font-bold leading-none text-ink"
            onClick={() => navigate("/overview")}
            type="button"
          >
            <BrandMark />
            <span>Pager Who Admin</span>
          </button>
          <nav aria-label={t("Admin sections")} className="col-span-2 row-start-2 flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-hairline bg-white/4 p-1 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:justify-self-center" onKeyDown={handleTabKeys} role="tablist">
            <AdminTabButton active={activeTab === "workspaces"} icon={Building2} label="Workspaces" onClick={() => setActiveTab("workspaces")} />
            <AdminTabButton active={activeTab === "dashboard"} icon={Shield} label="Overview" onClick={() => setActiveTab("dashboard")} />
            <AdminTabButton active={activeTab === "users"} icon={UserRound} label="Accounts" onClick={() => setActiveTab("users")} />
            <AdminTabButton active={activeTab === "diagnostics"} icon={Activity} label="Diagnostics" onClick={() => setActiveTab("diagnostics")} />
            <AdminTabButton active={activeTab === "inspector"} icon={Database} label="Data inspector" onClick={() => setActiveTab("inspector")} />
          </nav>
          <Button className="col-start-2 row-start-1 justify-self-end lg:col-start-3" onClick={() => navigate("/overview")} size="sm" variant="ghost">Exit admin</Button>
        </header>

        <section className="mx-auto grid w-full min-w-0 max-w-[1480px] gap-5 px-4 py-5 sm:px-6 lg:px-7.5 [&_pre]:min-w-0 [&_pre]:max-w-full">
          <PageHeader
            description={sectionCopy[activeTab].description}
            help="Use this backoffice to inspect projects and accounts, review platform health, and make scoped administrative changes. Every change requires a reason and is recorded for auditability."
            title={sectionCopy[activeTab].title}
          />
          {actionNotice ? (
            <div className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-hairline bg-surface-2 p-3" role="status">
              <span className="text-sm text-ink">{t("Action completed")}: {t(actionNotice)}</span>
              <Button onClick={() => setActionNotice("")} size="sm" variant="ghost">Dismiss</Button>
            </div>
          ) : null}

          {activeTab === "dashboard" ? (
            <section aria-labelledby="admin-tab-Overview" className="grid min-w-0 gap-4" id="admin-panel-Overview" role="tabpanel">
              {overviewQuery.isLoading ? <OverviewSkeleton /> : null}
              {overviewQuery.error ? <ErrorState error={overviewQuery.error} onRetry={() => void overviewQuery.refetch()} title="Could not load platform overview" /> : null}
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 [&>article]:min-w-0 [&_strong]:break-words">
                <MetricCard caption="Customer projects" label="Workspaces" value={counts?.workspaces ?? "-"} />
                <MetricCard caption="Access blocked" label="Suspended workspaces" value={counts?.suspended_workspaces ?? "-"} />
                <MetricCard caption="Triggered or acknowledged" label="Open incidents" value={counts?.open_incidents ?? "-"} />
                <MetricCard caption="Need review" label="Dead letters" value={counts?.notification_dead_letters ?? "-"} />
                <MetricCard caption="Global identities" label="Accounts" value={counts?.users ?? "-"} />
                <MetricCard caption="Created in the last 24h" label="New accounts" value={counts?.new_users_24h ?? "-"} />
                <MetricCard caption="Not revoked or expired" label="Active sessions" value={counts?.active_sessions ?? "-"} />
                <MetricCard caption="Last 24 hours" label="Failed notifications" value={counts?.failed_notifications_24h ?? "-"} />
                <MetricCard caption="Last 24 hours" label="Worker failures" value={counts?.failed_worker_runs_24h ?? "-"} />
                <MetricCard caption="Last 24 hours" label="Notification success" value={counts?.notification_success_rate_24h === null || counts?.notification_success_rate_24h === undefined ? "-" : `${counts.notification_success_rate_24h.toFixed(1)}%`} />
                <MetricCard caption="Last 24 hours" label="Average delivery" value={counts?.average_notification_latency_ms_24h === null || counts?.average_notification_latency_ms_24h === undefined ? "-" : `${Math.round(counts.average_notification_latency_ms_24h)}ms`} />
                <MetricCard caption="Server errors in 24h" label="API 5xx" value={counts?.api_5xx_24h ?? "-"} />
                <MetricCard caption="Running revision" label="Deployment" value={<span className="text-xl" title={overviewQuery.data?.deployment_version}>{overviewQuery.data?.deployment_version.slice(0, 12) ?? "-"}</span>} />
                <MetricCard caption="Security blocks" label="Suspended accounts" value={counts?.suspended_users ?? "-"} />
              </div>
              <Panel className="grid gap-3">
                <SectionTitle title="Notification delivery trend" />
                <p className="m-0 text-xs text-ink-muted">Hourly buckets · last 24 hours · local time</p>
                <div className="max-h-64 min-w-0 overflow-auto">
                  <table className="w-full min-w-100 text-left text-sm">
                    <thead className="sticky top-0 bg-surface-1 text-xs text-ink-subtle"><tr>{["Time", "Sent", "Failed", "Average delivery"].map((label) => <th className="border-b border-hairline p-2" key={label} scope="col">{t(label)}</th>)}</tr></thead>
                    <tbody>{overviewQuery.data?.notification_trend.map((bucket) => (
                      <tr key={bucket.bucket}>
                        <td className="p-2 text-ink-muted"><time dateTime={bucket.bucket} title={formatDateTime(bucket.bucket)}>{new Date(bucket.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></td>
                        <td className="p-2 tabular-nums">{bucket.sent}</td>
                        <td className="p-2 tabular-nums">{bucket.failed > 0 ? <Badge tone="red">{bucket.failed}</Badge> : 0}</td>
                        <td className="p-2 tabular-nums">{bucket.average_latency_ms === null ? "—" : `${Math.round(bucket.average_latency_ms)} ms`}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </Panel>
              <Panel className="grid gap-3">
                <SectionTitle title="Attention queue" />
                {overviewQuery.data?.attention.length ? (
                  <div className="grid gap-2 lg:grid-cols-2">
                    {overviewQuery.data.attention.map((item) => (
                      <button
                        className="grid cursor-pointer gap-2 rounded-md border border-hairline bg-surface-2/45 p-3 text-left transition hover:bg-surface-2"
                        key={`${item.kind}:${item.id}`}
                        onClick={() => {
                          setDiagnosticKind(item.kind);
                          setDiagnosticWorkspaceId(item.workspace_id ?? "");
                          setDiagnosticSearch("");
                          setDiagnosticRequestId("");
                          setActiveTab("diagnostics");
                        }}
                        type="button"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">{item.title}</span>
                          <Badge tone="red">{displayLabel(item.status)}</Badge>
                        </div>
                        <span className="line-clamp-2 text-xs text-ink-muted">{item.detail ?? `${item.kind} requires review`}</span>
                        <time className="text-xs text-ink-subtle" dateTime={item.created_at} title={formatDateTime(item.created_at)}>{formatRelativeTime(item.created_at)}</time>
                      </button>
                    ))}
                  </div>
                ) : overviewQuery.data ? <EmptyState message="No failed notification or worker runs need review." title="All clear" /> : null}
              </Panel>
              <div className="grid min-w-0 gap-4">
                <Panel className="grid gap-3">
                  <SectionTitle title="Recent workspaces" />
                  {workspacesQuery.error ? <ErrorState error={workspacesQuery.error} onRetry={() => void workspacesQuery.refetch()} title="Could not load workspaces" /> : null}
                  {workspacesQuery.isLoading ? <TablePageSkeleton label="Loading workspaces" /> : (
                    <DataTable
                      columns={workspaceColumns}
                      emptyState={<EmptyState message="No workspaces found." title="No workspaces" />}
                      getRowKey={(workspace) => workspace.id}
                      onRowClick={(workspace) => {
                        setSelectedWorkspaceId(workspace.id);
                        setActiveTab("workspaces");
                      }}
                      rows={workspacesQuery.data?.items.slice(0, 8) ?? []}
                    />
                  )}
                </Panel>
                <Panel className="grid gap-3">
                  <SectionTitle title="Account lookup" />
                  {usersQuery.error ? <ErrorState error={usersQuery.error} onRetry={() => void usersQuery.refetch()} title="Could not load accounts" /> : null}
                  {usersQuery.isLoading ? <TablePageSkeleton label="Loading accounts" /> : (
                    <DataTable
                      columns={userColumns}
                      emptyState={<EmptyState message="No accounts found." title="No accounts" />}
                      getRowKey={(user) => user.id}
                      onRowClick={(user) => {
                        setSelectedUserId(user.id);
                        setActiveTab("users");
                      }}
                      rows={usersQuery.data?.items.slice(0, 8) ?? []}
                    />
                  )}
                </Panel>
              </div>
            </section>
          ) : null}

          {activeTab === "users" ? (
            <section aria-labelledby="admin-tab-Accounts" className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(260px,0.38fr)_minmax(0,1fr)]" id="admin-panel-Accounts" role="tabpanel">
              <Panel className="grid content-start gap-3 lg:sticky lg:top-24" aria-busy={usersQuery.isFetching}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="grid gap-1">
                    <SectionTitle title="Account lookup" />
                    <p className="m-0 max-w-150 text-xs leading-[1.45] text-ink-muted">
                      Select an account to review its access and security history.
                    </p>
                  </div>
                  <div className="flex w-full min-w-0 items-center gap-2">
                    <TextInput
                      aria-label="Search accounts"
                      maxLength={200}
                      onChange={(event) => { setUserSearch(event.target.value); setUserPages([]); }}
                      placeholder="Search email or name"
                      value={userSearch}
                    />
                    <Button onClick={refreshAdminData} size="sm" variant="ghost">Refresh</Button>
                  </div>
                </div>
                <Select aria-label="Account status" onChange={(event) => { setUserStatus(event.target.value as typeof userStatus); setUserPages([]); }} value={userStatus}>
                  <option value="">{t("All statuses")}</option><option value="active">{t("Active")}</option><option value="suspended">{t("Suspended")}</option>
                </Select>
                {usersQuery.error ? <ErrorState error={usersQuery.error} onRetry={() => void usersQuery.refetch()} title="Could not load accounts" /> : null}
                {usersQuery.isFetching ? <RefreshingIndicator label="Refreshing accounts..." /> : null}
                {usersQuery.data?.items.length === 0 ? <EmptyState message="No accounts match the current filters." title="No accounts" /> : null}
                <div className="grid max-h-80 gap-2 overflow-y-auto lg:max-h-[55vh]">
                  {usersQuery.data?.items.map((user) => (
                    <EntityChoice active={selectedUserId === user.id} key={user.id} onClick={() => setSelectedUserId(user.id)}>
                      <div className="flex flex-wrap items-start justify-between gap-2"><strong className="min-w-0 [overflow-wrap:anywhere]">{user.name}</strong><StatusBadge suspendedAt={user.suspended_at} /></div>
                      <span className="text-xs text-ink-muted [overflow-wrap:anywhere]">{user.email}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">{t("Workspaces")}: {user.workspace_count}{user.platform_roles.length ? <Badge tone="blue">platform admin</Badge> : null}</span>
                    </EntityChoice>
                  ))}
                </div>
                <ListPager busy={usersQuery.isFetching || userSearch !== deferredUserSearch} count={usersQuery.data?.items.length ?? 0} nextCursor={usersQuery.data?.next_cursor} pages={userPages} setPages={setUserPages} />
              </Panel>

              <Panel className="grid content-start gap-4">
                <SectionTitle title="Account detail" />
                {!selectedUserId ? <EmptyState message="Select an account from the list to view its details." title="No account selected" /> : null}
                {selectedUserQuery.error ? <ErrorState error={selectedUserQuery.error} onRetry={() => void selectedUserQuery.refetch()} title="Could not load account" /> : null}
                {selectedUserQuery.isLoading ? <LoadingState message="Loading account..." /> : null}
                {selectedUser ? (
                  <div className="grid min-w-0 gap-4">
                    <EntityHeader
                      badge={<StatusBadge suspendedAt={selectedUser.suspended_at} />}
                      subtitle={selectedUser.email}
                      title={selectedUser.name}
                    />
                    <KeyValueGrid rows={[
                      ["User ID", selectedUser.id],
                      ["Email verified", selectedUser.email_verified ? "yes" : "no"],
                      ["Authentication", selectedUser.auth_methods.map((method) => t(displayLabel(method))).join(", ") || "-"],
                      ["Last sign-in", selectedUser.last_login_at ? formatDateTime(selectedUser.last_login_at) : "never"],
                      ["Active sessions", selectedUser.active_session_count],
                      ["Platform roles", selectedUser.platform_roles.map((role) => t(displayLabel(role))).join(", ") || "-"],
                      ["Created", formatDateTime(selectedUser.created_at)],
                      ["Suspension reason", selectedUser.suspension_reason ?? "-"],
                    ]} />
                    <p className="m-0 text-xs text-ink-muted">Changes require confirmation and an audit reason.</p>
                    {selectedUser.id === userId ? <p className="m-0 text-xs text-ink-muted">You cannot suspend your own account.</p> : null}
                    <div className="flex flex-wrap gap-2">
                      {selectedUser.suspended_at ? (
                        <Button
                          isLoading={restoreUserMutation.isPending}
                          onClick={() => void runUserStatusAction("restore")}
                          variant="primary"
                        >
                          Restore user
                        </Button>
                      ) : (
                        <Button
                          disabled={selectedUser.id === userId}
                          isLoading={suspendUserMutation.isPending}
                          onClick={() => void runUserStatusAction("suspend")}
                          variant="danger"
                        >
                          Suspend user
                        </Button>
                      )}
                      <Button
                        disabled={selectedUser.active_session_count === 0}
                        isLoading={revokeUserSessionsMutation.isPending}
                        onClick={() => void revokeUserSessions()}
                        variant="danger"
                      >
                        Sign out all sessions
                      </Button>
                      {!selectedUser.email_verified ? (
                        <Button
                          isLoading={sendAuthEmailMutation.isPending && sendAuthEmailMutation.variables?.kind === "email_verification"}
                          onClick={() => void sendUserAuthEmail("email_verification")}
                          variant="secondary"
                        >
                          Resend verification email
                        </Button>
                      ) : null}
                      {selectedUser.auth_methods.includes("password") ? (
                        <Button
                          isLoading={sendAuthEmailMutation.isPending && sendAuthEmailMutation.variables?.kind === "password_reset"}
                          onClick={() => void sendUserAuthEmail("password_reset")}
                          variant="secondary"
                        >
                          Send password reset
                        </Button>
                      ) : null}
                    </div>
                    <DetailSection title="Security timeline">
                      {selectedUser.security_timeline.length === 0 ? <EmptyState message="No login failures or administrative security actions were recorded." title="No security events" /> : (
                        <div className="grid gap-2">
                          {selectedUser.security_timeline.map((activity) => (
                            <MiniRow
                              key={activity.id}
                              label={`${t(displayLabel(activity.action))} · ${formatRelativeTime(activity.created_at)}`}
                              value={activity.message}
                            />
                          ))}
                        </div>
                      )}
                    </DetailSection>
                    <DetailSection title="Recent sessions">
                      {selectedUser.sessions.length === 0 ? <EmptyState message="No session history is available." title="No sessions" /> : (
                        <div className="grid gap-2">
                          {selectedUser.sessions.map((session) => (
                            <MiniRow
                              key={session.id}
                              label={`${session.is_active ? "active" : "inactive"} · ${formatRelativeTime(session.created_at)}`}
                              value={`${session.ip_address ?? "unknown IP"} · ${session.user_agent ?? "unknown device"}`}
                            />
                          ))}
                        </div>
                      )}
                    </DetailSection>
                    <DetailSection title="Contacts">
                      {selectedUser.notification_contacts.length === 0 ? <EmptyState message="No notification contacts." title="No contacts" /> : (
                        <div className="grid gap-2">
                          {selectedUser.notification_contacts.map((contact) => (
                            <MiniRow
                              key={contact.id}
                              label={`${contact.type}${contact.verified_at ? " verified" : ""}`}
                              value={contact.address}
                            />
                          ))}
                        </div>
                      )}
                    </DetailSection>
                    <DetailSection title="Workspace memberships">
                      {selectedUser.workspace_memberships.length === 0 ? <EmptyState message="This account has no workspace memberships." title="No memberships" /> : (
                        <div className="grid gap-2">
                          {selectedUser.workspace_memberships.map((member) => (
                            <button
                              className="grid cursor-pointer gap-1 rounded-md border border-hairline bg-surface-2/45 px-3 py-2 text-left"
                              key={member.workspace_id}
                              onClick={() => {
                                setSelectedWorkspaceId(member.workspace_id);
                                setActiveTab("workspaces");
                              }}
                              type="button"
                            >
                              <span className="text-sm font-semibold text-ink">{member.workspace_name}</span>
                              <span className="text-xs text-ink-muted">{member.roles.map(formatWorkspaceRoleKey).join(", ") || member.role}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </DetailSection>
                    <DetailSection title="Recent activity">
                      {selectedUser.recent_activity.length === 0 ? <EmptyState message="No recent activity was recorded." title="No activity" /> : (
                        <div className="grid gap-2">
                          {selectedUser.recent_activity.map((activity) => (
                            <MiniRow
                              key={activity.id}
                              label={`${t(displayLabel(activity.action))} · ${formatRelativeTime(activity.created_at)}`}
                              value={activity.message}
                            />
                          ))}
                        </div>
                      )}
                    </DetailSection>
                  </div>
                ) : null}
              </Panel>
            </section>
          ) : null}

          {activeTab === "workspaces" ? (
            <section aria-labelledby="admin-tab-Workspaces" className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(260px,0.38fr)_minmax(0,1fr)]" id="admin-panel-Workspaces" role="tabpanel">
              <Panel className="grid content-start gap-3 lg:sticky lg:top-24" aria-busy={workspacesQuery.isFetching}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <SectionTitle title="Workspaces" />
                  <div className="flex w-full min-w-0 items-center gap-2">
                    <TextInput
                      aria-label="Search workspaces"
                      maxLength={200}
                      onChange={(event) => { setWorkspaceSearch(event.target.value); setWorkspacePages([]); }}
                      placeholder="Search name or slug"
                      value={workspaceSearch}
                    />
                    <Button onClick={refreshAdminData} size="sm" variant="ghost">Refresh</Button>
                  </div>
                </div>
                <Select aria-label="Workspace status" onChange={(event) => { setWorkspaceStatus(event.target.value as typeof workspaceStatus); setWorkspacePages([]); }} value={workspaceStatus}>
                  <option value="">{t("All statuses")}</option><option value="active">{t("Active")}</option><option value="suspended">{t("Suspended")}</option>
                </Select>
                {workspacesQuery.error ? <ErrorState error={workspacesQuery.error} onRetry={() => void workspacesQuery.refetch()} title="Could not load workspaces" /> : null}
                {workspacesQuery.isFetching ? <RefreshingIndicator label="Refreshing workspaces..." /> : null}
                {workspacesQuery.data?.items.length === 0 ? <EmptyState message="No workspaces match the current filters." title="No workspaces" /> : null}
                <div className="grid max-h-80 gap-2 overflow-y-auto lg:max-h-[55vh]">
                  {workspacesQuery.data?.items.map((workspace) => (
                    <EntityChoice active={selectedWorkspaceId === workspace.id} key={workspace.id} onClick={() => setSelectedWorkspaceId(workspace.id)}>
                      <div className="flex flex-wrap items-start justify-between gap-2"><strong className="min-w-0 [overflow-wrap:anywhere]">{workspace.name}</strong></div>
                      <span className="text-xs text-ink-muted [overflow-wrap:anywhere]">{workspace.slug}</span>
                      <div className="flex flex-wrap items-center gap-2"><StatusBadge suspendedAt={workspace.suspended_at} /><span className="text-xs text-ink-muted">{t("Members")}: {workspace.member_count} · {t("Services")}: {workspace.service_count}</span></div>
                      <span className={cn("text-xs", workspace.open_incident_count ? "font-semibold text-ink" : "text-ink-muted")}>{t("Open incidents")}: {workspace.open_incident_count}</span>
                    </EntityChoice>
                  ))}
                </div>
                <ListPager busy={workspacesQuery.isFetching || workspaceSearch !== deferredWorkspaceSearch} count={workspacesQuery.data?.items.length ?? 0} nextCursor={workspacesQuery.data?.next_cursor} pages={workspacePages} setPages={setWorkspacePages} />
              </Panel>

              <Panel className="grid content-start gap-4">
                <SectionTitle title="Workspace detail" />
                {!selectedWorkspaceId ? <EmptyState message="Select a workspace from the list to view its details." title="No workspace selected" /> : null}
                {selectedWorkspaceQuery.error ? <ErrorState error={selectedWorkspaceQuery.error} onRetry={() => void selectedWorkspaceQuery.refetch()} title="Could not load workspace" /> : null}
                {selectedWorkspaceQuery.isLoading ? <LoadingState message="Loading workspace..." /> : null}
                {selectedWorkspace ? (
                  <div className="grid min-w-0 gap-4">
                    <div className="grid gap-3 rounded-md border border-hairline bg-surface-2/45 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <EntityHeader
                          badge={<StatusBadge suspendedAt={selectedWorkspace.suspended_at} />}
                          subtitle={selectedWorkspace.slug}
                          title={selectedWorkspace.name}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => manageWorkspace(selectedWorkspace.id)} size="sm" variant="primary">Open overview</Button>
                          <Button onClick={() => manageWorkspace(selectedWorkspace.id, "/operations")} size="sm" variant="ghost">Operations</Button>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <CompactMetric label="Members" value={selectedWorkspace.member_count} />
                        <CompactMetric label="Open incidents" value={selectedWorkspace.open_incident_count} />
                        <CompactMetric label="Services" value={`${selectedWorkspace.usage.usage.services} / ${selectedWorkspace.usage.limits.services ?? "unlimited"}`} />
                      </div>
                    </div>

                    <div aria-label={t("Workspace details")} className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-hairline bg-white/4 p-1" onKeyDown={handleTabKeys} role="tablist">
                      <WorkspaceDetailTabButton active={workspaceDetailTab === "summary"} label="Summary" onClick={() => setWorkspaceDetailTab("summary")} />
                      <WorkspaceDetailTabButton active={workspaceDetailTab === "limits"} label="Resource limits" onClick={() => setWorkspaceDetailTab("limits")} />
                      <WorkspaceDetailTabButton active={workspaceDetailTab === "access"} label="Access" onClick={() => setWorkspaceDetailTab("access")} />
                      <WorkspaceDetailTabButton active={workspaceDetailTab === "providers"} label="Providers" onClick={() => setWorkspaceDetailTab("providers")} />
                      <WorkspaceDetailTabButton active={workspaceDetailTab === "timeline"} label="Timeline" onClick={() => setWorkspaceDetailTab("timeline")} />
                    </div>

                    {workspaceDetailTab === "summary" ? (
                      <div className="grid min-w-0 gap-4">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <WorkspaceScreenButton count={selectedWorkspace.resource_counts.services} label="Services" onClick={() => manageWorkspace(selectedWorkspace.id, "/services")} />
                          <WorkspaceScreenButton count={selectedWorkspace.open_incident_count} label="Open incidents" onClick={() => manageWorkspace(selectedWorkspace.id, "/incidents")} />
                          <WorkspaceScreenButton count={selectedWorkspace.resource_counts.on_call_schedules} label="On-call" onClick={() => manageWorkspace(selectedWorkspace.id, "/on-call")} />
                          <WorkspaceScreenButton count={selectedWorkspace.resource_counts.escalation_policies} label="Policies" onClick={() => manageWorkspace(selectedWorkspace.id, "/escalation-policies")} />
                          <WorkspaceScreenButton count={selectedWorkspace.resource_counts.workflows} label="Workflows" onClick={() => manageWorkspace(selectedWorkspace.id, "/workflows")} />
                          <WorkspaceScreenButton count={selectedWorkspace.notification_provider_settings.length} label="Project settings" onClick={() => manageWorkspace(selectedWorkspace.id, "/project-settings")} />
                        </div>
                        <KeyValueGrid rows={[
                          ["Workspace ID", selectedWorkspace.id],
                          ["Created", formatDateTime(selectedWorkspace.created_at)],
                          ["Incidents total", selectedWorkspace.resource_counts.incidents],
                          ["Suspension reason", selectedWorkspace.suspension_reason ?? "-"],
                        ]} />
                      </div>
                    ) : null}

                    {workspaceDetailTab === "limits" ? (
                      <div className="grid min-w-0 gap-4">
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <CompactMetric label="Active members" value={selectedWorkspace.usage.usage.active_members} />
                          <CompactMetric label="Pending invites" value={selectedWorkspace.usage.usage.pending_invites} />
                          <CompactMetric label="Services" value={`${selectedWorkspace.usage.usage.services} / ${selectedWorkspace.usage.limits.services ?? "unlimited"}`} />
                          <CompactMetric label="Retention" value={`${selectedWorkspace.usage.limits.retention_days}d`} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {selectedWorkspace.quota_health.map((quota) => (
                            <div className="grid gap-1 rounded-md border border-hairline bg-surface-2/45 p-3" key={quota.resource}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-ink-subtle">{t(displayLabel(quota.resource))}</span>
                                <Badge tone={quota.state === "exceeded" ? "red" : quota.state === "near_limit" ? "blue" : "green"}>{displayLabel(quota.state)}</Badge>
                              </div>
                              <strong className="text-sm text-ink">{quota.current} / {quota.limit ?? "unlimited"}</strong>
                              {quota.limit !== null ? <meter aria-label={t(displayLabel(quota.resource))} className="h-2 w-full" max={quota.limit} min={0} value={Math.min(quota.current, quota.limit)} /> : null}
                              {quota.remaining !== null ? <span className="text-xs text-ink-muted">{quota.remaining} remaining</span> : null}
                            </div>
                          ))}
                        </div>
                        <div className="grid gap-3 rounded-md border border-hairline bg-surface-2/45 p-3">
                          <SectionTitle title="Temporary quota override" />
                          {selectedWorkspace.usage.quota_settings.quota_overrides.length > 0 ? (
                            <div className="grid gap-2">
                              {selectedWorkspace.usage.quota_settings.quota_overrides.map((override) => (
                                <MiniRow
                                  key={override.resource}
                                  label={displayLabel(override.resource)}
                                  value={`${override.limit} until ${formatDateTime(override.expires_at)}`}
                                />
                              ))}
                            </div>
                          ) : <span className="text-xs text-ink-muted">No active quota overrides.</span>}
                          <p className="m-0 text-xs leading-relaxed text-ink-muted">Enter a positive whole-number limit and a future expiry in your local time. The installation limit returns after expiry.</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Resource">
                              <Select onChange={(event) => setQuotaResource(event.target.value as Exclude<WorkspaceQuotaResource, "workspaces">)} value={quotaResource}>
                                <option value="members">{t("Members")}</option>
                                <option value="services">{t("Services")}</option>
                                <option value="on_call_schedules">{t("On-call schedules")}</option>
                                <option value="escalation_policies">{t("Escalation policies")}</option>
                              </Select>
                            </Field>
                            <Field label="Temporary limit">
                              <TextInput min="1" onChange={(event) => setQuotaLimit(event.target.value)} type="number" value={quotaLimit} />
                            </Field>
                            <Field label="Expires at">
                              <TextInput onChange={(event) => setQuotaExpiresAt(event.target.value)} type="datetime-local" value={quotaExpiresAt} />
                            </Field>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={!quotaOverrideIsValid}
                              isLoading={updateQuotaMutation.isPending}
                              onClick={() => void updateQuotaOverride()}
                              size="sm"
                            >
                              Apply temporary override
                            </Button>
                            <Button
                              disabled={!selectedWorkspace.usage.quota_settings.quota_overrides.some((override) => override.resource === quotaResource)}
                              isLoading={updateQuotaMutation.isPending}
                              onClick={() => void updateQuotaOverride(true)}
                              size="sm"
                              variant="ghost"
                            >
                              Remove override
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-3 rounded-md border border-hairline bg-surface-2/45 p-3">
                          <SectionTitle title="Workspace access" />
                          <p className="m-0 text-xs text-ink-muted">Suspending a workspace blocks member access. Use this only after reviewing the customer impact.</p>
                          <KeyValueGrid rows={[
                            ["Status", selectedWorkspace.suspended_at ? "suspended" : "active"],
                            ["Suspension reason", selectedWorkspace.suspension_reason ?? "-"],
                          ]} />
                          {selectedWorkspace.suspended_at ? (
                            <Button
                              isLoading={restoreWorkspaceMutation.isPending}
                              onClick={() => void runWorkspaceStatusAction("restore")}
                              variant="primary"
                            >
                              Restore workspace
                            </Button>
                          ) : (
                            <Button
                              isLoading={suspendWorkspaceMutation.isPending}
                              onClick={() => void runWorkspaceStatusAction("suspend")}
                              variant="danger"
                            >
                              Suspend workspace
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {workspaceDetailTab === "access" ? (
                      <div className="grid min-w-0 gap-4">
                        <DetailSection title="Members and invites">
                          {selectedWorkspace.members.length === 0 && selectedWorkspace.invites.length === 0 ? <EmptyState message="No members or pending invites." title="No access records" /> : (
                            <div className="grid gap-2">
                              {selectedWorkspace.members.map((member) => (
                                <MiniRow
                                  key={member.user_id}
                                  label={`${member.name}${member.suspended_at ? " suspended" : ""}`}
                                  value={`${member.email} - ${member.roles.map(formatWorkspaceRoleKey).join(", ") || member.role}`}
                                />
                              ))}
                              {selectedWorkspace.invites.map((invite) => (
                                <MiniRow
                                  key={invite.id}
                                  label={`invite ${invite.status}`}
                                  value={`${invite.invited_user_email} - ${invite.roles.map(formatWorkspaceRoleKey).join(", ") || invite.role}`}
                                />
                              ))}
                            </div>
                          )}
                        </DetailSection>
                        <DetailSection title="Member role override">
                          {selectedWorkspace.members.length === 0 ? <EmptyState message="No workspace members." title="No members" /> : (
                            <div className="grid gap-3">
                              <Field label="Member">
                                <Select onChange={(event) => { setSelectedMemberId(event.target.value); setRolesDraft(null); }} value={selectedMember?.user_id ?? ""}>
                                  {selectedWorkspace.members.map((member) => (
                                    <option key={member.user_id} value={member.user_id}>
                                      {member.name} ({member.email})
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                              <div className="grid gap-3">
                                {workspaceRoleGroups.map((group) => (
                                  <div className="grid gap-2 rounded-md border border-hairline bg-surface-2/45 p-3" key={group.label}>
                                    <span className="text-xs font-bold uppercase text-ink-subtle">{group.label}</span>
                                    <div className="grid gap-2 md:grid-cols-2">
                                      {group.roles.map((role) => (
                                        <CheckboxField
                                          checked={selectedRoles.includes(role)}
                                          key={role}
                                          label={formatWorkspaceRoleKey(role)}
                                          onChange={() => toggleRole(role)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <p className="m-0 text-xs text-ink-muted">Select at least one role. Changes replace the member's current permissions.</p>
                              <Button
                                disabled={selectedRoles.length === 0 || (selectedRoles.length === selectedMember?.roles.length && selectedRoles.every((role) => selectedMember.roles.includes(role)))}
                                isLoading={updateMemberRolesMutation.isPending}
                                onClick={() => void updateMemberRoles()}
                              >
                                Update member roles
                              </Button>
                            </div>
                          )}
                        </DetailSection>
                      </div>
                    ) : null}

                    {workspaceDetailTab === "providers" ? (
                      <DetailSection title="Provider settings">
                        {selectedWorkspace.notification_provider_settings.length === 0 ? <EmptyState message="No provider settings." title="No providers" /> : (
                          <div className="grid gap-2">
                            {selectedWorkspace.notification_provider_settings.map((setting) => (
                              <div className="grid gap-2 rounded-md border border-hairline bg-surface-2/45 p-3" key={setting.provider}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-ink">{setting.provider}</span>
                                  <Badge tone={setting.enabled ? "green" : "neutral"}>{setting.enabled ? "enabled" : "disabled"}</Badge>
                                </div>
                                <details className="min-w-0"><summary className="cursor-pointer text-xs text-ink-muted">{t("View configuration")}</summary><pre className="m-0 mt-2 max-h-44 overflow-auto rounded-md bg-canvas px-3 py-2 text-xs leading-[1.45] text-ink-muted">{formatJson(setting.config)}</pre></details>
                              </div>
                            ))}
                          </div>
                        )}
                      </DetailSection>
                    ) : null}

                    {workspaceDetailTab === "timeline" ? (
                      <DetailSection title="Operational timeline">
                        {selectedWorkspace.operational_timeline.length === 0 ? <EmptyState message="No operational events were recorded." title="No events" /> : (
                          <div className="grid gap-2">
                            {selectedWorkspace.operational_timeline.map((event) => (
                              <div className="grid gap-2 rounded-md border border-hairline bg-surface-2/45 p-3" key={`${event.kind}:${event.id}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge tone="neutral">{displayLabel(event.kind)}</Badge>
                                    <Badge tone={event.status === "failed" ? "red" : event.status === "succeeded" || event.status === "resolved" || event.status === "sent" ? "green" : "blue"}>{displayLabel(event.status)}</Badge>
                                  </div>
                                  <time className="text-xs text-ink-subtle" dateTime={event.occurred_at} title={formatDateTime(event.occurred_at)}>{formatRelativeTime(event.occurred_at)}</time>
                                </div>
                                <strong className="text-sm text-ink">{event.title}</strong>
                                {event.detail ? <span className="text-xs text-ink-muted">{event.detail}</span> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </DetailSection>
                    ) : null}
                  </div>
                ) : null}
              </Panel>
            </section>
          ) : null}

          {activeTab === "diagnostics" ? (
            <section aria-labelledby="admin-tab-Diagnostics" className="grid min-w-0 gap-4" id="admin-panel-Diagnostics" role="tabpanel">
              <Panel className="grid min-w-0 gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <SectionTitle title="Platform diagnostics" />
                    <p className="m-0 max-w-190 text-sm leading-[1.5] text-ink-muted">
                      Review failed notifications and worker runs across the platform. Retry is limited to dead letters for open incidents and always records an admin reason.
                    </p>
                  </div>
                  <Button onClick={refreshAdminData} size="sm" variant="ghost">Refresh</Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Type">
                    <Select aria-label="Type" onChange={(event) => { setDiagnosticKind(event.target.value as typeof diagnosticKind); if (event.target.value === "worker") setDiagnosticWorkspaceId(""); }} value={diagnosticKind}>
                      <option value="all">{t("All types")}</option>
                      <option value="notification">{t("Notifications")}</option>
                      <option value="webhook">{t("Webhook ingestion")}</option>
                      <option value="worker">{t("Worker runs")}</option>
                    </Select>
                  </Field>
                  <Field label="Workspace">
                    <Select aria-label="Workspace" disabled={diagnosticKind === "worker"} onChange={(event) => setDiagnosticWorkspaceId(event.target.value)} value={diagnosticWorkspaceId}>
                      <option value="">{t("All workspaces")}</option>
                      {diagnosticWorkspaceId && !workspacesQuery.data?.items.some((workspace) => workspace.id === diagnosticWorkspaceId) ? <option value={diagnosticWorkspaceId}>{selectedWorkspace?.id === diagnosticWorkspaceId ? selectedWorkspace.name : diagnosticWorkspaceId}</option> : null}
                      {workspacesQuery.data?.items.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Search">
                    <TextInput
                      maxLength={200}
                      onChange={(event) => setDiagnosticSearch(event.target.value)}
                      placeholder="Incident, worker, or error"
                      value={diagnosticSearch}
                    />
                  </Field>
                  <Field label="Request or record ID">
                    <TextInput
                      maxLength={200}
                      onChange={(event) => setDiagnosticRequestId(event.target.value)}
                      placeholder="Exact request or record ID"
                      value={diagnosticRequestId}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                  <span>{diagnosticKind === "worker" ? t("Worker runs are platform-wide. Workspace filtering is unavailable.") : t("Up to 50 recent records. Narrow the filters to find older issues.")}</span>
                  <Button onClick={() => { setDiagnosticKind("all"); setDiagnosticWorkspaceId(""); setDiagnosticSearch(""); setDiagnosticRequestId(""); }} size="sm" variant="ghost">Clear filters</Button>
                </div>
              </Panel>

              {diagnosticsQuery.error ? <ErrorState error={diagnosticsQuery.error} onRetry={() => void diagnosticsQuery.refetch()} title="Could not load diagnostics" /> : null}
              {diagnosticsQuery.isLoading ? <TablePageSkeleton label="Loading platform diagnostics" /> : null}
              {!diagnosticsQuery.isLoading && diagnosticsQuery.data?.items.length === 0 ? (
                <EmptyState message="No diagnostic records match the current filters." title="No results" />
              ) : null}
              <div className="grid gap-3 xl:grid-cols-2">
                {diagnosticsQuery.data?.items.map((item) => (
                  <Panel className="grid gap-3" key={`${item.kind}:${item.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={item.status === "succeeded" || item.status === "sent" ? "green" : item.status === "retrying" ? "blue" : "red"}>{displayLabel(item.status)}</Badge>
                          <Badge tone="neutral">{displayLabel(item.kind)}</Badge>
                        </div>
                        <strong className="text-sm text-ink">{item.incident_title ?? item.title}</strong>
                        <span className="text-xs text-ink-muted">{item.workspace_name ?? "Platform worker"}</span>
                      </div>
                      <time className="text-xs text-ink-subtle" dateTime={item.occurred_at} title={formatDateTime(item.occurred_at)}>{formatRelativeTime(item.occurred_at)}</time>
                    </div>
                    <p className="m-0 [overflow-wrap:anywhere] text-sm leading-[1.5] text-ink-muted">{item.detail ?? "No error detail was recorded."}</p>
                    <details className="min-w-0"><summary className="cursor-pointer text-xs text-ink-muted">{t("Technical details")}</summary><div className="mt-2"><KeyValueGrid rows={[
                      ["Record ID", item.id],
                      ["Channel", item.channel ?? "-"],
                      ["Attempt", item.attempt ?? "-"],
                      ["Request or record ID", item.request_id ?? "-"],
                    ]} /></div></details>
                    <div className="flex flex-wrap gap-2">
                      {item.workspace_id ? (
                        <Button onClick={() => manageWorkspace(item.workspace_id!, "/operations")} size="sm" variant="secondary">
                          Open workspace operations
                        </Button>
                      ) : null}
                      {item.can_retry ? (
                        <Button
                          isLoading={retryNotificationMutation.isPending && retryNotificationMutation.variables?.notificationId === item.id}
                          onClick={() => void retryNotification(item.id)}
                          size="sm"
                          variant="danger"
                        >
                          Retry notification
                        </Button>
                      ) : null}
                    </div>
                  </Panel>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === "inspector" ? (
            <section aria-labelledby="admin-tab-Data-inspector" className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(260px,0.38fr)_minmax(0,1fr)]" id="admin-panel-Data-inspector" role="tabpanel">
              <Panel className="grid content-start gap-4">
                <div className="grid gap-1">
                  <SectionTitle title="Restricted data inspector" />
                  <p className="m-0 text-sm leading-[1.5] text-ink-muted">
                    Browse recent records or search by a familiar name, email, title, or error. Select a result to inspect its safe operational data.
                  </p>
                </div>
                <form className="grid min-w-0 gap-3" onSubmit={(event) => {
                  event.preventDefault();
                  const nextQuery = { limit: 50, resource_type: inspectorResourceType, ...(inspectorSearch.trim() ? { search: inspectorSearch.trim() } : {}) };
                  if (JSON.stringify(nextQuery) === JSON.stringify(resourceListQuery)) void resourceListResultQuery.refetch();
                  else setResourceListQuery(nextQuery);
                }}>
                <Field label="Resource type">
                  <Select
                    aria-label="Resource type"
                    onChange={(event) => {
                      const resourceType = event.target.value as PlatformInspectorResourceType;
                      setInspectorResourceType(resourceType);
                      setInspectorSearch("");
                      setInspectorResourceId("");
                      setInspectorQuery(null);
                      setResourceListQuery({ limit: 50, resource_type: resourceType });
                    }}
                    value={inspectorResourceType}
                  >
                    <option value="user">{t("User")}</option>
                    <option value="workspace">{t("Workspace")}</option>
                    <option value="incident">{t("Incident")}</option>
                    <option value="notification">{t("Notification")}</option>
                    <option value="worker_run">{t("Worker run")}</option>
                  </Select>
                </Field>
                <Field label="Search">
                  <TextInput
                    maxLength={200}
                    onChange={(event) => setInspectorSearch(event.target.value)}
                    placeholder="Leave empty to browse all recent records"
                    value={inspectorSearch}
                  />
                </Field>
                <Button isLoading={resourceListResultQuery.isFetching} type="submit">
                  {inspectorSearch.trim() ? "Search resources" : "Browse resources"}
                </Button>
                </form>
                <p className="m-0 text-xs text-ink-muted">Up to 50 recent records. Search by name, email, or title to narrow the list.</p>
                {resourceListResultQuery.error ? <ErrorState error={resourceListResultQuery.error} onRetry={() => void resourceListResultQuery.refetch()} title="Could not load resources" /> : null}
                {resourceListResultQuery.isLoading ? <TablePageSkeleton label="Loading resources" /> : null}
                {!resourceListResultQuery.isLoading && resourceListResultQuery.data?.items.length === 0 ? (
                  <EmptyState message="No resources match the current search." title="No results" />
                ) : null}
                <div className="grid max-h-105 gap-2 overflow-auto">
                  {resourceListResultQuery.data?.items.map((resource) => (
                    <button
                      aria-pressed={inspectorQuery?.id === resource.id && inspectorQuery.resource_type === resource.resource_type}
                      className={cn("grid min-w-0 cursor-pointer gap-1 rounded-md border px-3 py-2.5 text-left transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent", inspectorQuery?.id === resource.id ? "border-accent bg-accent/10" : "border-hairline bg-surface-2/45")}
                      key={`${resource.resource_type}:${resource.id}`}
                      onClick={() => {
                        setInspectorResourceType(resource.resource_type);
                        setInspectorResourceId(resource.id);
                        setInspectorQuery({ id: resource.id, resource_type: resource.resource_type });
                      }}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{resource.title}</span>
                        <Badge tone={resource.status === "active" || resource.status === "succeeded" ? "green" : "neutral"}>{displayLabel(resource.status)}</Badge>
                      </div>
                      <span className="[overflow-wrap:anywhere] text-xs text-ink-muted">{resource.subtitle ?? resource.id}</span>
                      <span className="text-xs text-ink-subtle">{resource.workspace_name ?? formatRelativeTime(resource.created_at)}</span>
                    </button>
                  ))}
                </div>
                <details className="min-w-0 border-t border-hairline pt-3"><summary className="cursor-pointer text-sm text-ink-muted">{t("Open exact ID")}</summary><div className="mt-3 grid gap-3">
                  <Field label="Resource ID">
                    <TextInput
                      onChange={(event) => setInspectorResourceId(event.target.value)}
                      placeholder="Optional advanced lookup"
                      value={inspectorResourceId}
                    />
                  </Field>
                  <Button
                    disabled={!UuidPattern.test(inspectorResourceId.trim())}
                    onClick={() => setInspectorQuery({
                      id: inspectorResourceId.trim(),
                      resource_type: inspectorResourceType,
                    })}
                    variant="secondary"
                  >
                    Open exact ID
                  </Button>
                </div></details>
                <p className="m-0 text-xs leading-[1.45] text-ink-subtle">
                  Raw SQL, arbitrary table browsing, and direct field editing are intentionally unavailable.
                </p>
              </Panel>

              <Panel className="grid content-start gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionTitle title="Inspection result" />
                  {inspectorQuery ? <Button isLoading={inspectorResultQuery.isFetching} onClick={() => void inspectorResultQuery.refetch()} size="sm" variant="ghost">Refresh</Button> : null}
                </div>
                {!inspectorQuery ? <EmptyState message="Select a record from the list. You do not need to know its ID." title="No resource selected" /> : null}
                {inspectorResultQuery.isLoading ? <LoadingState message="Inspecting resource..." /> : null}
                {inspectorResultQuery.error ? <ErrorState error={inspectorResultQuery.error} onRetry={() => void inspectorResultQuery.refetch()} title="Could not inspect resource" /> : null}
                {inspectorResultQuery.data ? (
                  <div className="grid min-w-0 gap-4">
                    <EntityHeader
                      badge={<Badge tone="blue">{displayLabel(inspectorResultQuery.data.resource_type)}</Badge>}
                      subtitle={inspectorResultQuery.data.id}
                      title={inspectorResultQuery.data.title}
                    />
                    <KeyValueGrid rows={[
                      ["Status", t(displayLabel(inspectorResultQuery.data.status))],
                      ["Workspace", inspectorResultQuery.data.workspace_name ?? "-"],
                      ["Created", formatDateTime(inspectorResultQuery.data.created_at)],
                      ["Updated", inspectorResultQuery.data.updated_at ? formatDateTime(inspectorResultQuery.data.updated_at) : "-"],
                    ]} />
                    <details className="min-w-0 rounded-md border border-hairline p-3"><summary className="cursor-pointer text-sm font-semibold">{t("Safe record data")} · JSON</summary>
                      <pre className="m-0 mt-3 max-h-100 overflow-auto rounded-md bg-canvas p-3 text-xs leading-[1.5] text-ink-muted">{formatJson(inspectorResultQuery.data.data)}</pre>
                    </details>
                    <DetailSection title="Relationships">
                      {inspectorResultQuery.data.relationships.length === 0 ? <EmptyState message="No related resources are available." title="No relationships" /> : (
                        <div className="grid gap-2">
                          {inspectorResultQuery.data.relationships.map((relationship) => (
                            <div className="grid min-w-0 gap-2" key={`${relationship.resource_type}:${relationship.id}`}>
                              <MiniRow label={displayLabel(relationship.label)} value={relationship.title} />
                              {isInspectableType(relationship.resource_type) ? <Button onClick={() => {
                                if (!isInspectableType(relationship.resource_type)) return;
                                setInspectorResourceType(relationship.resource_type);
                                setInspectorResourceId(relationship.id);
                                setInspectorSearch("");
                                setResourceListQuery({ limit: 50, resource_type: relationship.resource_type });
                                setInspectorQuery({ id: relationship.id, resource_type: relationship.resource_type });
                              }} size="sm" variant="ghost">Open related record</Button> : <span className="text-xs text-ink-muted [overflow-wrap:anywhere]">{relationship.id}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </DetailSection>
                  </div>
                ) : null}
              </Panel>
            </section>
          ) : null}
        </section>
        <AdminActionDialog action={pendingAction} onClose={() => setPendingAction(null)} onSuccess={(title) => setActionNotice(`${t(title)} · ${pendingAction?.target ?? ""}`)} />
      </main>
    </LocalizedText>
  );
}

function AdminTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  const translateNode = useTranslateNode();

  return (
    <button
      aria-controls={`admin-panel-${label.replaceAll(" ", "-")}`}
      aria-selected={active}
      id={`admin-tab-${label.replaceAll(" ", "-")}`}
      className={cn(
        "inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border-0 px-3 text-sm font-semibold leading-none focus-visible:outline-2 focus-visible:outline-accent",
        active ? "bg-surface-2 text-ink" : "bg-transparent text-ink-muted hover:bg-surface-1 hover:text-ink",
      )}
      onClick={onClick}
      role="tab"
      tabIndex={active ? 0 : -1}
      type="button"
    >
      <Icon size={14} strokeWidth={2} />
      {translateNode(label)}
    </button>
  );
}

function WorkspaceDetailTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  const translateNode = useTranslateNode();

  return (
    <button
      aria-selected={active}
      className={cn(
        "inline-flex min-h-10 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-lg border-0 px-3 text-xs font-bold leading-none focus-visible:outline-2 focus-visible:outline-accent",
        active ? "bg-surface-2 text-ink" : "bg-transparent text-ink-muted hover:bg-surface-1 hover:text-ink",
      )}
      onClick={onClick}
      role="tab"
      tabIndex={active ? 0 : -1}
      type="button"
    >
      {translateNode(label)}
    </button>
  );
}

function CompactMetric({ label, value }: { label: string; value: ReactNode }) {
  const translateNode = useTranslateNode();

  return (
    <div className="grid min-w-0 gap-1 rounded-md border border-hairline bg-canvas/45 px-3 py-2.5">
      <span className="text-[11px] font-bold leading-snug text-ink-subtle">{translateNode(label)}</span>
      <strong className="text-[18px] font-semibold leading-tight text-ink [overflow-wrap:anywhere]">{translateNode(value)}</strong>
    </div>
  );
}

function WorkspaceScreenButton({
  count,
  label,
  onClick,
}: {
  count: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const translateNode = useTranslateNode();

  return (
    <button
      className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-hairline bg-surface-2/45 px-3 py-2.5 text-left transition hover:-translate-y-px hover:bg-surface-2"
      onClick={onClick}
      type="button"
    >
      <span className="text-sm font-semibold leading-tight text-ink">{translateNode(label)}</span>
      <span className="rounded-full bg-canvas px-2 py-1 text-xs font-bold leading-none text-ink-muted">{translateNode(count)}</span>
    </button>
  );
}

function StatusBadge({ suspendedAt }: { suspendedAt: string | null }) {
  return suspendedAt ? <Badge tone="red">suspended</Badge> : <Badge tone="green">active</Badge>;
}


function SectionTitle({ title }: { title: string }) {
  const translateNode = useTranslateNode();

  return <h2 className="m-0 text-[17px] font-semibold leading-tight text-ink">{translateNode(title)}</h2>;
}

function EntityHeader({ badge, subtitle, title }: { badge: ReactNode; subtitle: string; title: string }) {
  return (
    <div className="grid min-w-0 gap-2 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-2">{badge}</div>
      <div>
        <h3 className="m-0 text-[20px] font-semibold leading-tight text-ink">{title}</h3>
        <p className="m-0 mt-1 text-xs leading-[1.35] text-ink-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function KeyValueGrid({ rows }: { rows: Array<[string, ReactNode]> }) {
  const translateNode = useTranslateNode();

  return (
    <dl className="grid gap-2 rounded-md border border-hairline bg-surface-2/45 p-3">
      {rows.map(([label, value]) => (
        <div className="grid gap-1 md:grid-cols-[150px_minmax(0,1fr)]" key={label}>
          <dt className="text-xs font-bold uppercase text-ink-subtle">{translateNode(label)}</dt>
          <dd className="m-0 [overflow-wrap:anywhere] text-sm text-ink">{translateNode(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-3 border-t border-hairline-soft pt-4">
      <SectionTitle title={title} />
      {children}
    </section>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  const translateNode = useTranslateNode();

  return (
    <div className="grid gap-1 rounded-md border border-hairline bg-surface-2/45 px-3 py-2">
      <span className="text-xs font-bold uppercase text-ink-subtle">{translateNode(label)}</span>
      <span className="[overflow-wrap:anywhere] text-sm text-ink">{translateNode(value)}</span>
    </div>
  );
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const UuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function EntityChoice({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <button aria-pressed={active} className={cn("grid min-w-0 cursor-pointer gap-2 rounded-lg border p-3 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-accent", active ? "border-accent bg-accent/10" : "border-hairline bg-surface-2/45 hover:bg-surface-2")} onClick={onClick} type="button">{children}</button>;
}

function ListPager({ busy, count, nextCursor, pages, setPages }: { busy: boolean; count: number; nextCursor: string | null | undefined; pages: string[]; setPages: (pages: string[]) => void }) {
  const t = useStaticText();
  return <div className="grid gap-2 border-t border-hairline pt-3">
    <span className="text-xs text-ink-muted">{t("Page")} {pages.length + 1} · {count} {t("results on this page")}</span>
    <div className="flex justify-between gap-2">
      <Button disabled={busy || !pages.length} onClick={() => setPages(pages.slice(0, -1))} size="sm" variant="ghost">Previous</Button>
      <Button disabled={busy || !nextCursor} onClick={() => nextCursor && setPages([...pages, nextCursor])} size="sm" variant="ghost">Next</Button>
    </div>
  </div>;
}

function useDebouncedValue(value: string) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  return settled;
}

function handleTabKeys(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]"));
  const index = tabs.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.focus();
  tabs[next]?.click();
}

function isInspectableType(value: string): value is PlatformInspectorResourceType {
  return ["user", "workspace", "incident", "notification", "worker_run"].includes(value);
}
