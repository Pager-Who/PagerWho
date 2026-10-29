import type {
  ActivityLog,
  ActivityResourceType,
  AuditLogQuery,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceNotificationProvider,
  WorkspaceWebhookIntegrationEventAction,
  WorkspaceRoleKey,
} from "@im/contracts";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { formatWorkspaceRoleKey, hasWorkspacePermission, useAuth, workspaceRoleGroups } from "../../../shared/auth";
import {
  Badge,
  Button,
  CheckboxField,
  DataTable,
  DescriptionList,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Panel,
  SectionHeader,
  Select,
  StateBlock,
  TabButton,
  TablePageSkeleton,
  TextInput,
  type DataTableColumn,
} from "../../../shared/components";
import { LocalizedText, normalizeLocale } from "../../../shared/i18n";
import { cn } from "../../../shared/utils";
import { formatDateTime, formatRelativeTime, shortId } from "../../../shared/utils";
import { ProviderSettingCard } from "../components/ProviderSettingCard";
import { WebhookIntegrationsPanel } from "../components/WebhookIntegrationsPanel";
import {
  useAddTeamMemberMutation,
  useAuditLogs,
  useCreateTeamMutation,
  useCreateWorkspaceInviteMutation,
  useRemoveTeamMemberMutation,
  useRevokeWorkspaceInviteMutation,
  useSettingsEscalationPolicies,
  useSettingsOnCallSchedules,
  useSettingsServices,
  useMyWorkspaces,
  useSettingsTeams,
  useSettingsUsers,
  useTeamMembers,
  useUpdateWorkspaceMemberRolesMutation,
  useUpdateWorkspaceNotificationProviderSettingMutation,
  useWorkspaceInvites,
  useWorkspaceMembers,
  useWorkspaceNotificationProviderSettings,
  useWorkspaceUsage,
} from "../queries";

const defaultInviteRoles = ["incident_responder", "notification_recipient"] as const satisfies readonly WorkspaceRoleKey[];
const defaultInviteExpirationDays = 14;

const auditResourceTypes = [
  "workspace",
  "workspace_invite",
  "workspace_notification_provider_setting",
  "service",
  "incident",
  "webhook_endpoint",
  "on_call_schedule",
  "on_call_override",
  "escalation_policy",
  "notification",
] as const satisfies readonly ActivityResourceType[];

const defaultAuditFilters = {
  action: "",
  actorUserId: "",
  from: "",
  resourceId: "",
  resourceType: "",
  search: "",
  to: "",
};

type AuditFilterFormState = typeof defaultAuditFilters;

type ProjectSettingsTab = "general" | "providers" | "integrations" | "teams" | "access" | "audit";

type SetupFlowItem = {
  actionLabel: string;
  description: string;
  done: boolean;
  label: string;
  onAction: () => void;
  required: boolean;
};

type ProviderFormState = {
  emailEventActions: WorkspaceWebhookIntegrationEventAction[];
  emailEnabled: boolean;
  emailFromName: string;
  emailFromEmail: string;
  emailSmtpHost: string;
  emailSmtpPassword: string;
  emailSmtpPort: string;
  emailSmtpSecurity: "starttls" | "tls";
  emailSmtpUsername: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromPhoneNumber: string;
  twilioEventActions: WorkspaceWebhookIntegrationEventAction[];
};

const providerEventOptions: Array<{ label: string; value: WorkspaceWebhookIntegrationEventAction }> = [
  { label: "Incident created", value: "incident.created" },
  { label: "Incident acknowledged", value: "incident.acknowledged" },
  { label: "Incident resolved", value: "incident.resolved" },
  { label: "Incident priority changed", value: "incident.priority_updated" },
];

export function ProjectSettingsPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  const { isPlatformAdmin, projectId, selectProject } = useAuth();
  const [activeTab, setActiveTab] = useState<ProjectSettingsTab>("general");
  const workspacesQuery = useMyWorkspaces();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [editingProvider, setEditingProvider] = useState<Exclude<WorkspaceNotificationProvider, "slack"> | null>(null);
  const [isDeleteTwilioDialogOpen, setIsDeleteTwilioDialogOpen] = useState(false);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState<AuditFilterFormState>(defaultAuditFilters);
  const [selectedAuditLogId, setSelectedAuditLogId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({ name: "" });
  const [teamMemberForm, setTeamMemberForm] = useState({ userId: "" });
  const [inviteForm, setInviteForm] = useState({
    invitedUserEmail: "",
    roles: [...defaultInviteRoles] as WorkspaceRoleKey[],
  });
  const [pendingRevokeInvite, setPendingRevokeInvite] = useState<WorkspaceInvite | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>({
    emailEventActions: ["incident.created"],
    emailEnabled: false,
    emailFromName: "",
    emailFromEmail: "",
    emailSmtpHost: "",
    emailSmtpPassword: "",
    emailSmtpPort: "587",
    emailSmtpSecurity: "starttls",
    emailSmtpUsername: "",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioFromPhoneNumber: "",
    twilioEventActions: ["incident.created"],
  });

  const workspaces = workspacesQuery.data ?? [];
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)
    ?? workspaces.find((workspace) => workspace.id === projectId)
    ?? workspaces[0]
    ?? null;
  const usersQuery = useSettingsUsers(selectedWorkspace?.id);
  const users = usersQuery.data ?? [];
  const selectedWorkspaceRoles = selectedWorkspace?.roles ?? [];
  const canManageProjectAccess = isPlatformAdmin || hasWorkspacePermission(selectedWorkspaceRoles, "project.manage");
  const canManageNotificationSettings = isPlatformAdmin || hasWorkspacePermission(selectedWorkspaceRoles, "notification.manage");
  const teamsQuery = useSettingsTeams(selectedWorkspace?.id);
  const membersQueries = useWorkspaceMembers(selectedWorkspace ? [selectedWorkspace.id] : []);
  const servicesQuery = useSettingsServices(selectedWorkspace?.id);
  const onCallSchedulesQuery = useSettingsOnCallSchedules(selectedWorkspace?.id);
  const escalationPoliciesQuery = useSettingsEscalationPolicies(selectedWorkspace?.id);
  const workspaceInvitesQuery = useWorkspaceInvites(canManageProjectAccess ? selectedWorkspace?.id : undefined);
  const providerSettingsQuery = useWorkspaceNotificationProviderSettings(canManageNotificationSettings ? selectedWorkspace?.id : undefined);
  const workspaceUsageQuery = useWorkspaceUsage(selectedWorkspace?.id);
  const createTeamMutation = useCreateTeamMutation();
  const createInviteMutation = useCreateWorkspaceInviteMutation(selectedWorkspace?.id ?? "");
  const revokeInviteMutation = useRevokeWorkspaceInviteMutation(selectedWorkspace?.id ?? "");
  const updateMemberRolesMutation = useUpdateWorkspaceMemberRolesMutation(selectedWorkspace?.id ?? "");
  const updateProviderSettingMutation = useUpdateWorkspaceNotificationProviderSettingMutation(selectedWorkspace?.id ?? "");

  const teams = teamsQuery.data ?? [];
  const members = membersQueries.flatMap((query) => query.data ?? []);
  const workspaceInvites = workspaceInvitesQuery.data ?? [];
  const providerSettings = providerSettingsQuery.data ?? [];
  const emailProviderSetting = providerSettings.find((setting) => setting.provider === "email");
  const twilioProviderSetting = providerSettings.find((setting) => setting.provider === "twilio");
  const isEmailConfigurationReady = Boolean(
    providerForm.emailSmtpHost.trim()
    && providerForm.emailSmtpPort
    && providerForm.emailSmtpUsername.trim()
    && providerForm.emailFromEmail.trim()
    && (providerForm.emailSmtpPassword || emailProviderSetting?.details.has_smtp_password),
  );
  const isTwilioConfigured = Boolean(twilioProviderSetting?.configured);
  const isTwilioEditorOpen = !isTwilioConfigured || editingProvider === "twilio";
  const selectedWorkspaceTeams = selectedWorkspace
    ? teams.filter((team) => team.workspace_id === selectedWorkspace.id)
    : [];
  const selectedTeam = selectedWorkspaceTeams.find((team) => team.id === selectedTeamId)
    ?? selectedWorkspaceTeams[0]
    ?? null;
  const teamMembersQuery = useTeamMembers(selectedTeam?.id);
  const addTeamMemberMutation = useAddTeamMemberMutation(selectedTeam?.id);
  const removeTeamMemberMutation = useRemoveTeamMemberMutation(selectedTeam?.id);
  const teamMembers = teamMembersQuery.data ?? [];
  const selectedWorkspaceTeamCount = selectedWorkspaceTeams.length;
  const selectedWorkspaceServiceCount = servicesQuery.data?.items.length ?? 0;
  const selectedWorkspaceOnCallScheduleCount = onCallSchedulesQuery.data?.length ?? 0;
  const selectedWorkspaceEscalationPolicyCount = escalationPoliciesQuery.data?.length ?? 0;
  const configuredProviderCount = providerSettings.filter((setting) =>
    setting.provider !== "slack" && setting.enabled && setting.configured,
  ).length;
  const pendingInviteCount = workspaceInvites.filter((invite) => invite.status === "pending").length;
  const activeMemberCount = members.filter((member) => member.workspace_id === selectedWorkspace?.id).length;
  const workspaceUsage = workspaceUsageQuery.data ?? null;
  const isMemberQuotaBlocked = Boolean(workspaceUsage?.limits.members !== null
    && workspaceUsage
    && workspaceUsage.usage.members >= workspaceUsage.limits.members);
  const userNameById = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users]);
  const workspaceNameById = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])), [workspaces]);
  const auditLogFilters = useMemo(
    () => createAuditLogFilters(selectedWorkspace?.id, auditFilters),
    [auditFilters, selectedWorkspace?.id],
  );
  const auditLogsQuery = useAuditLogs(auditLogFilters, Boolean(selectedWorkspace?.id) && canManageProjectAccess);
  const auditLogs = auditLogsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const selectedAuditLog = auditLogs.find((log) => log.id === selectedAuditLogId) ?? null;
  const selectedTeamMemberIds = useMemo(() => new Set(teamMembers.map((member) => member.user_id)), [teamMembers]);
  const selectedWorkspaceMembers = selectedWorkspace
    ? members.filter((member) => member.workspace_id === selectedWorkspace.id)
    : [];
  const availableTeamMembers = selectedWorkspaceMembers.filter((member) => !selectedTeamMemberIds.has(member.user_id));
  const memberColumns = useMemo<Array<DataTableColumn<WorkspaceMember>>>(
    () => createMemberColumns(userNameById, workspaceNameById, {
      canManageRoles: canManageProjectAccess,
      onSaveRoles: (userId, roles) => updateMemberRolesMutation.mutateAsync({ roles, userId }),
      savingUserId: updateMemberRolesMutation.variables?.userId,
    }),
    [canManageProjectAccess, updateMemberRolesMutation, userNameById, workspaceNameById],
  );
  const inviteColumns = useMemo<Array<DataTableColumn<WorkspaceInvite>>>(
    () => createProjectInviteColumns(userNameById, {
      canRevoke: canManageProjectAccess,
      onRevoke: setPendingRevokeInvite,
      revokingInviteId: revokeInviteMutation.variables,
    }),
    [canManageProjectAccess, revokeInviteMutation.variables, userNameById],
  );
  const auditColumns = useMemo<Array<DataTableColumn<ActivityLog>>>(
    () => createAuditLogColumns(userNameById),
    [userNameById],
  );
  const supportError = usersQuery.error
    ?? workspacesQuery.error
    ?? teamsQuery.error
    ?? servicesQuery.error
    ?? onCallSchedulesQuery.error
    ?? escalationPoliciesQuery.error
    ?? workspaceUsageQuery.error
    ?? teamMembersQuery.error
    ?? workspaceInvitesQuery.error
    ?? providerSettingsQuery.error
    ?? membersQueries.find((query) => query.error)?.error;
  const setupFlowItems = useMemo<Array<SetupFlowItem>>(
    () => [
      {
        actionLabel: "Choose project",
        description: "Select the project context before changing operational settings.",
        done: Boolean(selectedWorkspace),
        label: "Select project",
        onAction: () => document.getElementById("project-current")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        required: true,
      },
      {
        actionLabel: "Open services",
        description: "Register the services that can receive incidents.",
        done: selectedWorkspaceServiceCount > 0,
        label: "Register services",
        onAction: () => navigate("/services"),
        required: true,
      },
      {
        actionLabel: "Create policy",
        description: "Define who gets notified and when escalation repeats.",
        done: selectedWorkspaceEscalationPolicyCount > 0,
        label: "Create escalation policy",
        onAction: () => navigate("/escalation-policies"),
        required: true,
      },
      {
        actionLabel: "Create schedule",
        description: "Add the primary and secondary responders for incidents.",
        done: selectedWorkspaceOnCallScheduleCount > 0,
        label: "Create on-call schedule",
        onAction: () => navigate("/on-call"),
        required: true,
      },
      {
        actionLabel: "Configure providers",
        description: "Enable at least one provider so responders can be notified.",
        done: configuredProviderCount > 0,
        label: "Enable notification",
        onAction: () => setActiveTab("providers"),
        required: true,
      },
      {
        actionLabel: "Create team",
        description: "Group responders for ownership labels and team targets.",
        done: selectedWorkspaceTeamCount > 0,
        label: "Create team",
        onAction: () => setActiveTab("teams"),
        required: false,
      },
      {
        actionLabel: "Invite user",
        description: "Invite additional responders before assigning ownership.",
        done: activeMemberCount > 1 || pendingInviteCount > 0,
        label: "Add responders",
        onAction: () => setActiveTab("access"),
        required: false,
      },
    ],
    [
      activeMemberCount,
      configuredProviderCount,
      navigate,
      pendingInviteCount,
      selectedWorkspace,
      selectedWorkspaceEscalationPolicyCount,
      selectedWorkspaceOnCallScheduleCount,
      selectedWorkspaceServiceCount,
      selectedWorkspaceTeamCount,
    ],
  );
  const requiredSetupItems = setupFlowItems.filter((item) => item.required);
  const optionalSetupItems = setupFlowItems.filter((item) => !item.required);
  const completedRequiredSetupCount = requiredSetupItems.filter((item) => item.done).length;
  const setupProgressPercent = requiredSetupItems.length > 0
    ? Math.round((completedRequiredSetupCount / requiredSetupItems.length) * 100)
    : 0;
  const nextRequiredSetupItem = requiredSetupItems.find((item) => !item.done);
  const nextSetupItem = nextRequiredSetupItem ?? optionalSetupItems.find((item) => !item.done) ?? null;
  const isProjectReady = completedRequiredSetupCount === requiredSetupItems.length;

  useEffect(() => {
    if (selectedWorkspace) {
      setSelectedWorkspaceId(selectedWorkspace.id);
    }
  }, [selectedWorkspace]);

  useEffect(() => {
    setEditingProvider(null);
    setProviderForm((current) => ({
      ...current,
      emailFromName: "",
      emailEventActions: ["incident.created"],
      emailFromEmail: "",
      emailSmtpHost: "",
      emailSmtpPassword: "",
      emailSmtpPort: "587",
      emailSmtpSecurity: "starttls",
      emailSmtpUsername: "",
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioFromPhoneNumber: "",
      twilioEventActions: ["incident.created"],
    }));
  }, [selectedWorkspace?.id]);

  useEffect(() => {
    if (selectedAuditLogId && !auditLogs.some((log) => log.id === selectedAuditLogId)) {
      setSelectedAuditLogId(null);
    }
  }, [auditLogs, selectedAuditLogId]);

  useEffect(() => {
    if (selectedTeamId && selectedWorkspaceTeams.some((team) => team.id === selectedTeamId)) {
      return;
    }

    const nextTeamId = selectedWorkspaceTeams[0]?.id ?? "";

    if (selectedTeamId !== nextTeamId) {
      setSelectedTeamId(nextTeamId);
    }

    setTeamMemberForm((current) => (current.userId ? { userId: "" } : current));
  }, [selectedTeamId, selectedWorkspaceTeams]);

  useEffect(() => {
    setProviderForm((current) => ({
      ...current,
      emailEnabled: emailProviderSetting?.enabled ?? false,
      emailEventActions: emailProviderSetting?.details.event_actions ?? ["incident.created"],
      emailFromName: emailProviderSetting?.details.from_name ?? "",
      emailFromEmail: emailProviderSetting?.details.from_email ?? "",
      emailSmtpHost: emailProviderSetting?.details.smtp_host ?? "",
      emailSmtpPassword: "",
      emailSmtpPort: String(emailProviderSetting?.details.smtp_port ?? 587),
      emailSmtpSecurity: emailProviderSetting?.details.smtp_security ?? "starttls",
      emailSmtpUsername: emailProviderSetting?.details.smtp_username ?? "",
    }));
  }, [emailProviderSetting]);

  async function handleSaveProviderSetting(provider: Exclude<WorkspaceNotificationProvider, "slack">) {
    if (!selectedWorkspace) return;

    if (provider === "email") {
      await updateProviderSettingMutation.mutateAsync({
        provider,
        input: {
          enabled: providerForm.emailEnabled,
          email: {
            smtp_host: providerForm.emailSmtpHost.trim() || null,
            smtp_port: providerForm.emailSmtpPort ? Number(providerForm.emailSmtpPort) : null,
            smtp_security: providerForm.emailSmtpSecurity,
            smtp_username: providerForm.emailSmtpUsername.trim() || null,
            ...(providerForm.emailSmtpPassword ? { smtp_password: providerForm.emailSmtpPassword } : {}),
            from_name: providerForm.emailFromName.trim() || null,
            from_email: providerForm.emailFromEmail.trim() || null,
            event_actions: providerForm.emailEventActions,
          },
        },
      });
      setProviderForm((current) => ({ ...current, emailSmtpPassword: "" }));
      setProviderNotice("Email provider settings saved.");
      return;
    }

    const updated = await updateProviderSettingMutation.mutateAsync({
      provider,
      input: {
        enabled: true,
        twilio: {
          ...(providerForm.twilioAccountSid.trim() ? { account_sid: providerForm.twilioAccountSid.trim() } : {}),
          ...(providerForm.twilioAuthToken.trim() ? { auth_token: providerForm.twilioAuthToken.trim() } : {}),
          ...(providerForm.twilioFromPhoneNumber.trim() ? { from_phone_number: providerForm.twilioFromPhoneNumber.trim() } : {}),
          event_actions: providerForm.twilioEventActions,
        },
      },
    });
    setProviderForm((current) => ({
      ...current,
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioFromPhoneNumber: "",
    }));
    setEditingProvider(updated.configured ? null : "twilio");
    setProviderNotice("Twilio provider settings saved.");
  }

  function handleStartTwilioEdit() {
    setProviderForm((current) => ({
      ...current,
      twilioAccountSid: twilioProviderSetting?.details.account_sid ?? "",
      twilioAuthToken: "",
      twilioFromPhoneNumber: twilioProviderSetting?.details.from_phone_number ?? "",
      twilioEventActions: twilioProviderSetting?.details.event_actions ?? ["incident.created"],
    }));
    setEditingProvider("twilio");
  }

  function handleCancelTwilioEdit() {
    setProviderForm((current) => ({
      ...current,
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioFromPhoneNumber: "",
    }));
    setEditingProvider(null);
  }

  async function handleDeleteTwilioProviderSetting() {
    if (!selectedWorkspace) return;

    await updateProviderSettingMutation.mutateAsync({
      provider: "twilio",
      input: {
        enabled: false,
        twilio: {
          account_sid: null,
          auth_token: null,
          from_phone_number: null,
        },
      },
    });

    setProviderForm((current) => ({
      ...current,
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioFromPhoneNumber: "",
    }));
    setEditingProvider(null);
    setIsDeleteTwilioDialogOpen(false);
    setProviderNotice("Twilio provider deleted.");
  }

  function handleAuditFilterChange(patch: Partial<AuditFilterFormState>) {
    setAuditFilters((current) => ({
      ...current,
      ...patch,
    }));
    setSelectedAuditLogId(null);
  }

  async function handleCreateTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWorkspace) return;

    const team = await createTeamMutation.mutateAsync({
      name: teamForm.name.trim(),
      workspace_id: selectedWorkspace.id,
    });
    setSelectedTeamId(team.id);
    setTeamForm({ name: "" });
    setTeamMemberForm({ userId: "" });
  }

  async function handleAddTeamMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTeam || !teamMemberForm.userId) return;

    await addTeamMemberMutation.mutateAsync({
      role: "member",
      user_id: teamMemberForm.userId,
    });
    setTeamMemberForm({ userId: "" });
  }

  async function handleRemoveTeamMember(userId: string) {
    if (!selectedTeam) return;

    await removeTeamMemberMutation.mutateAsync(userId);
  }

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWorkspace) return;

    const invitedUserEmail = inviteForm.invitedUserEmail.trim().toLowerCase();
    if (!invitedUserEmail) return;

    await createInviteMutation.mutateAsync({
      expires_in_days: defaultInviteExpirationDays,
      invited_user_email: invitedUserEmail,
      roles: inviteForm.roles,
    });
    setInviteForm((current) => ({ ...current, invitedUserEmail: "" }));
  }

  async function handleRevokeInvite() {
    if (!pendingRevokeInvite) return;

    await revokeInviteMutation.mutateAsync(pendingRevokeInvite.id);
    setPendingRevokeInvite(null);
  }

  function handleSelectWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId);

    if (workspaceId) {
      selectProject(workspaceId);
    }
  }

  return (
    <LocalizedText>
      <section className="grid gap-4">
      <PageHeader
        description="Configure readiness, notification providers, teams, and project access."
        help="Project settings control the people, delivery providers, and access rules used by incident response. Start with General to complete the required setup, then configure providers before testing notifications."
        title="Project settings"
      />

      {supportError ? <ErrorState error={supportError} onRetry={() => Promise.all([
        usersQuery.refetch(),
        workspacesQuery.refetch(),
        teamsQuery.refetch(),
        servicesQuery.refetch(),
        onCallSchedulesQuery.refetch(),
        escalationPoliciesQuery.refetch(),
        workspaceUsageQuery.refetch(),
        teamMembersQuery.refetch(),
        workspaceInvitesQuery.refetch(),
        providerSettingsQuery.refetch(),
        ...membersQueries.map((query) => query.refetch()),
      ])} title="Some project settings data could not be loaded" /> : null}

      <Panel className="grid gap-4.5">
        <div aria-label="Project settings sections" className="flex items-center gap-1 border-b border-hairline-soft pb-2.5 overflow-x-auto" role="tablist">
          <TabButton active={activeTab === "general"} id="settings-tab-general" label="General" onClick={() => setActiveTab("general")} panelId="settings-panel-general" />
          <TabButton active={activeTab === "teams"} count={selectedWorkspaceTeamCount} id="settings-tab-teams" label="Teams" onClick={() => setActiveTab("teams")} panelId="settings-panel-teams" />
          <TabButton active={activeTab === "providers"} count={configuredProviderCount} id="settings-tab-providers" label="Providers" onClick={() => setActiveTab("providers")} panelId="settings-panel-providers" />
          <TabButton active={activeTab === "integrations"} id="settings-tab-integrations" label="Integrations" onClick={() => setActiveTab("integrations")} panelId="settings-panel-integrations" />
          <TabButton active={activeTab === "access"} count={activeMemberCount} id="settings-tab-access" label="Members & roles" onClick={() => setActiveTab("access")} panelId="settings-panel-access" />
          {canManageProjectAccess ? (
            <TabButton active={activeTab === "audit"} count={auditLogs.length} id="settings-tab-audit" label="Audit log" onClick={() => setActiveTab("audit")} panelId="settings-panel-audit" />
          ) : null}
        </div>

        <div className="rounded-lg border border-hairline-soft bg-surface-2/45 px-3.5 py-3 text-ink-muted text-xs leading-[1.45]">
          {activeTab === "general"
            ? "Complete the required setup checklist and confirm which project is currently selected."
            : activeTab === "providers"
                ? "Configure the delivery providers used for responder notifications."
                : activeTab === "integrations"
                  ? "Store reusable webhook destinations, then select them from workflow actions."
                : activeTab === "teams"
                  ? "Group project members so services and escalation policies can target a shared team."
                  : activeTab === "access"
                    ? "Invite responders and assign only the project roles they need."
                    : "Review who changed project settings and which resources were affected."}
        </div>

        {activeTab === "general" ? (
          <div aria-labelledby="settings-tab-general" className="grid gap-4 min-w-0" id="settings-panel-general" role="tabpanel">
            <div className="grid items-start gap-4.5">
              <section className="grid gap-4 min-w-0" id="project-current">
                <SectionHeader
                  description="This context controls which services, responders, and settings you are managing."
                  title="Current project"
                />
                {selectedWorkspace ? (
                  <DescriptionList
                    items={[
                      ["Project", selectedWorkspace.name],
                      ["Slug", selectedWorkspace.slug],
                      ["Roles", formatWorkspaceRoles(selectedWorkspace.roles)],
                      ["Created", formatDateTime(selectedWorkspace.created_at)],
                    ]}
                  />
                ) : <EmptyState message="Select a project first." title="No project selected" />}
              </section>
            </div>

            <Panel className="rounded-xl grid gap-3.5" padding="md">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1 min-w-0">
                  <h3 className="text-ink text-lg font-[650] leading-[1.2] m-0">Project readiness</h3>
                  <p className="text-ink-muted text-xs leading-[1.4] m-0">
                    {isProjectReady ? "Required setup is complete." : "Complete the required setup for incident routing."}
                  </p>
                </div>
                <Badge tone={isProjectReady ? "green" : "yellow"}>{completedRequiredSetupCount}/{requiredSetupItems.length} required</Badge>
              </div>

              <div className="bg-surface-2 rounded-full h-1.5 overflow-hidden">
                <span
                  aria-label={`${setupProgressPercent}% required setup complete`}
                  className="bg-accent-blue block h-full rounded-full transition-[width]"
                  style={{ width: `${setupProgressPercent}%` }}
                />
              </div>

              {nextSetupItem ? (
                <div className="bg-surface-2/75 border border-hairline-soft rounded-lg flex flex-wrap items-center justify-between gap-3 min-w-0 px-3 py-2.75">
                  <span className="text-ink-muted text-xs leading-[1.35]">
                    {nextRequiredSetupItem ? "Next required" : "Next recommended"}: <strong className="text-ink">{nextSetupItem.label}</strong>
                  </span>
                  <Button onClick={nextSetupItem.onAction} size="sm" variant={nextRequiredSetupItem ? "primary" : "secondary"}>
                    {nextSetupItem.actionLabel}
                  </Button>
                </div>
              ) : null}

              <div aria-label="Project setup checklist" className="grid gap-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Required</span>
                  <span className="text-ink-muted text-xs leading-none">{setupProgressPercent}%</span>
                </div>
                {requiredSetupItems.map((item) => (
                  <ProjectSetupFlowRow item={item} key={item.label} />
                ))}

                <div className="flex items-center justify-between gap-2 border-t border-hairline-soft mt-2 pt-3">
                  <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Optional</span>
                  <span className="text-ink-muted text-xs leading-none">{optionalSetupItems.filter((item) => item.done).length}/{optionalSetupItems.length}</span>
                </div>
                {optionalSetupItems.map((item) => (
                  <ProjectSetupFlowRow item={item} key={item.label} />
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeTab === "providers" ? (
          <div aria-labelledby="settings-tab-providers" className="grid gap-4 min-w-0" id="settings-panel-providers" role="tabpanel">
            <SectionHeader
              description="Configure delivery providers used by escalation policies and responder notification preferences."
              title="Notification providers"
            />
            {providerSettingsQuery.isLoading ? <LoadingState message="Loading provider settings..." /> : null}
            {providerSettingsQuery.error ? <ErrorState error={providerSettingsQuery.error} onRetry={() => void providerSettingsQuery.refetch()} title="Could not load provider settings" /> : null}
            <div className="grid gap-4 items-stretch xl:grid-cols-2">
              <ProviderSettingCard
                className="xl:col-span-2"
                disabled={!selectedWorkspace
                  || !canManageNotificationSettings
                  || updateProviderSettingMutation.isPending
                  || (providerForm.emailEnabled && !isEmailConfigurationReady)}
                isSaving={updateProviderSettingMutation.isPending && updateProviderSettingMutation.variables?.provider === "email"}
                onSave={() => void handleSaveProviderSetting("email")}
                setting={emailProviderSetting}
                title="Email"
              >
                <CheckboxField
                  checked={providerForm.emailEnabled}
                  disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                  label="Enable email provider"
                  onChange={(event) => setProviderForm((current) => ({ ...current, emailEnabled: event.target.checked }))}
                />
                <ProviderEventCheckboxes
                  disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                  onChange={(emailEventActions) => setProviderForm((current) => ({ ...current, emailEventActions }))}
                  value={providerForm.emailEventActions}
                />
                <p className="m-0 text-sm leading-relaxed text-ink-muted">
                  Connect an SMTP account owned and billed by your organization. PagerWho uses it only for incident notifications.
                </p>
                {providerForm.emailEnabled && !isEmailConfigurationReady ? (
                  <p className="m-0 text-sm leading-relaxed text-warning">
                    Enter the SMTP server, credentials, and sender address before enabling email delivery.
                  </p>
                ) : null}
                <div className="grid gap-3.5 md:grid-cols-[minmax(0,1fr)_9rem]">
                  <Field label="SMTP host">
                    <TextInput
                      autoComplete="off"
                      disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                      onChange={(event) => setProviderForm((current) => ({ ...current, emailSmtpHost: event.target.value }))}
                      placeholder="smtp.example.com"
                      value={providerForm.emailSmtpHost}
                    />
                  </Field>
                  <Field label="Port">
                    <TextInput
                      disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                      inputMode="numeric"
                      max="65535"
                      min="1"
                      onChange={(event) => setProviderForm((current) => ({ ...current, emailSmtpPort: event.target.value }))}
                      type="number"
                      value={providerForm.emailSmtpPort}
                    />
                  </Field>
                </div>
                <Field label="Connection security" hint="Match the security mode provided by your email service.">
                  <Select
                    disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                    onChange={(event) => {
                      const security = event.target.value as "starttls" | "tls";
                      setProviderForm((current) => ({
                        ...current,
                        emailSmtpPort: resolveSmtpPortForSecurity(current.emailSmtpPort, security),
                        emailSmtpSecurity: security,
                      }));
                    }}
                    value={providerForm.emailSmtpSecurity}
                  >
                    <option value="starttls">STARTTLS · usually port 587</option>
                    <option value="tls">TLS / SSL · usually port 465</option>
                  </Select>
                </Field>
                <div className="grid gap-3.5 md:grid-cols-2">
                  <Field label="SMTP username" hint="Login name provided by your email service.">
                    <TextInput
                      autoComplete="username"
                      disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                      onChange={(event) => setProviderForm((current) => ({ ...current, emailSmtpUsername: event.target.value }))}
                      placeholder="alerts@example.com"
                      value={providerForm.emailSmtpUsername}
                    />
                  </Field>
                  <Field label="SMTP password" hint={emailProviderSetting?.details.has_smtp_password ? "Stored. Enter a new password to replace it." : "App password if required by your email service."}>
                    <TextInput
                      autoComplete="new-password"
                      disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                      onChange={(event) => setProviderForm((current) => ({ ...current, emailSmtpPassword: event.target.value }))}
                      placeholder={emailProviderSetting?.details.has_smtp_password ? "Stored SMTP password" : ""}
                      type="password"
                      value={providerForm.emailSmtpPassword}
                    />
                  </Field>
                  <Field label="From name" hint="Optional display name shown to recipients.">
                    <TextInput
                      disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                      onChange={(event) => setProviderForm((current) => ({ ...current, emailFromName: event.target.value }))}
                      placeholder="PagerWho Alerts"
                      value={providerForm.emailFromName}
                    />
                  </Field>
                  <Field label="From email" hint="Sender address shown on incident emails.">
                    <TextInput
                      autoComplete="email"
                      disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                      onChange={(event) => setProviderForm((current) => ({ ...current, emailFromEmail: event.target.value }))}
                      placeholder="alerts@example.com"
                      type="email"
                      value={providerForm.emailFromEmail}
                    />
                  </Field>
                </div>
              </ProviderSettingCard>

              <ProviderSettingCard
                className="xl:col-span-2"
                disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                footerAction={isTwilioConfigured ? (
                  <>
                    <Button
                      className="w-full sm:w-auto sm:min-w-36"
                      disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                      isLoading={updateProviderSettingMutation.isPending && updateProviderSettingMutation.variables?.provider === "twilio" && !isTwilioEditorOpen}
                      onClick={() => setIsDeleteTwilioDialogOpen(true)}
                      variant="danger"
                    >
                      Delete Twilio
                    </Button>
                    {isTwilioEditorOpen ? (
                      <Button
                        className="w-full sm:w-auto sm:min-w-36"
                        disabled={updateProviderSettingMutation.isPending}
                        onClick={handleCancelTwilioEdit}
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </>
                ) : null}
                isSaving={updateProviderSettingMutation.isPending && updateProviderSettingMutation.variables?.provider === "twilio" && isTwilioEditorOpen}
                onSave={() => {
                  if (isTwilioEditorOpen) {
                    void handleSaveProviderSetting("twilio");
                    return;
                  }

                  handleStartTwilioEdit();
                }}
                saveLabel={isTwilioEditorOpen ? (isTwilioConfigured ? "Update Twilio" : "Save Twilio") : "Edit Twilio"}
                setting={twilioProviderSetting}
                title="Twilio"
              >
                {isTwilioEditorOpen ? (
                  <>
                    <div className="grid gap-3.5 md:grid-cols-2">
                      <Field label="Account SID" hint="Enter a new Account SID to replace the stored value. Leave blank to keep it.">
                        <TextInput
                          disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                          onChange={(event) => setProviderForm((current) => ({ ...current, twilioAccountSid: event.target.value }))}
                          placeholder={twilioProviderSetting?.details.account_sid_masked ?? "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                          value={providerForm.twilioAccountSid}
                        />
                      </Field>
                      <Field label="Auth token" hint={twilioProviderSetting?.details.has_auth_token ? "Stored. Enter a new token to replace it." : "Required for Twilio delivery."}>
                        <TextInput
                          autoComplete="new-password"
                          disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                          onChange={(event) => setProviderForm((current) => ({ ...current, twilioAuthToken: event.target.value }))}
                          placeholder={twilioProviderSetting?.details.has_auth_token ? "Stored auth token" : ""}
                          type="password"
                          value={providerForm.twilioAuthToken}
                        />
                      </Field>
                      <Field label="From phone number" hint="Enter a new E.164 phone number to replace the stored sender. Leave blank to keep it.">
                        <TextInput
                          disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                          onChange={(event) => setProviderForm((current) => ({ ...current, twilioFromPhoneNumber: event.target.value }))}
                          placeholder={twilioProviderSetting?.details.from_phone_number_masked ?? "+15550101001"}
                          value={providerForm.twilioFromPhoneNumber}
                        />
                      </Field>
                    </div>
                    <ProviderEventCheckboxes
                      disabled={!selectedWorkspace || !canManageNotificationSettings || updateProviderSettingMutation.isPending}
                      onChange={(twilioEventActions) => setProviderForm((current) => ({ ...current, twilioEventActions }))}
                      value={providerForm.twilioEventActions}
                    />
                  </>
                ) : (
                  <div className="grid gap-1.5 min-w-0">
                    <strong className="text-ink text-sm font-[650] leading-[1.3]">Twilio is configured</strong>
                    <p className="text-ink-muted text-[13px] leading-[1.45] m-0">
                      Stored credentials are masked. Editing replaces only the fields you fill.
                    </p>
                  </div>
                )}
              </ProviderSettingCard>
            </div>
            {updateProviderSettingMutation.error ? <ErrorState error={updateProviderSettingMutation.error} title="Could not save provider settings" /> : null}
            {providerNotice ? <div aria-live="polite" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-xs text-[#72e09c]" role="status">{providerNotice}</div> : null}
          </div>
        ) : null}

        {activeTab === "integrations" ? (
          <div aria-labelledby="settings-tab-integrations" className="grid gap-4 min-w-0" id="settings-panel-integrations" role="tabpanel">
            <SectionHeader
              description="Configure one reusable webhook destination per service. Workflows can use the default JSON or provide a payload override."
              title="Webhook integrations"
            />
            <WebhookIntegrationsPanel canManage={canManageNotificationSettings} workspaceId={selectedWorkspace?.id} />
          </div>
        ) : null}

        {activeTab === "teams" ? (
          <div aria-labelledby="settings-tab-teams" className="grid gap-4 min-w-0" id="settings-panel-teams" role="tabpanel">
            <SectionHeader
              description="Create responder groups for ownership labels and escalation policy team targets."
              title="Teams"
            />
            <div className="grid items-start gap-4.5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.46fr)]">
              <section className="grid gap-3.5 min-w-0">
                <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Team directory</h3>
                {teamsQuery.isLoading ? <TablePageSkeleton label="Loading teams" /> : (
                  <DataTable
                    columns={[
                      {
                        header: "Team",
                        key: "team",
                        render: (team) => (
                          <div className="grid gap-1 min-w-45">
                            <div className="flex items-center gap-2 min-w-0">
                              <strong className="text-ink text-sm font-[650] leading-[1.3] min-w-0 truncate">{team.name}</strong>
                              {selectedTeam?.id === team.id ? <Badge tone="blue">selected</Badge> : null}
                            </div>
                            <span className="text-ink-subtle font-mono text-xs leading-[1.35] block max-w-140 overflow-hidden text-ellipsis whitespace-nowrap">{shortId(team.id)}</span>
                          </div>
                        ),
                      },
                      {
                        header: "Project",
                        key: "project",
                        render: (team) => workspaceNameById.get(team.workspace_id) ?? shortId(team.workspace_id),
                      },
                      {
                        header: "Updated",
                        key: "updated",
                        render: (team) => formatRelativeTime(team.updated_at),
                        width: 120,
                      },
                    ]}
                    emptyState={<EmptyState message="No teams have been created." title="No teams" />}
                    getRowKey={(team) => team.id}
                    onRowClick={(team) => {
                      setSelectedTeamId(team.id);
                      setTeamMemberForm({ userId: "" });
                    }}
                    rows={selectedWorkspaceTeams}
                  />
                )}
              </section>

              <div className="grid content-start gap-4 min-w-0">
                <form className="bg-surface-2 border border-hairline-soft rounded-lg content-start grid gap-3.5 min-w-0 p-3.5" onSubmit={handleCreateTeam}>
                  <div className="grid gap-1">
                    <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">New team</h3>
                    <p className="text-ink-muted text-xs leading-[1.4] m-0">Teams group project members for shared ownership and escalation targets.</p>
                  </div>
                  <Field label="Project">
                    <Select onChange={(event) => handleSelectWorkspace(event.target.value)} value={selectedWorkspace?.id ?? ""}>
                      {workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Team name" required>
                    <TextInput
                      disabled={!canManageProjectAccess || createTeamMutation.isPending}
                      onChange={(event) => setTeamForm({ name: event.target.value })}
                      required
                      value={teamForm.name}
                    />
                  </Field>
                  {createTeamMutation.error ? <ErrorState error={createTeamMutation.error} title="Could not create team" /> : null}
                  <div className="flex">
                    <Button
                      className="w-full"
                      disabled={!selectedWorkspace || !canManageProjectAccess || !teamForm.name.trim()}
                      isLoading={createTeamMutation.isPending}
                      type="submit"
                      variant="primary"
                    >
                      Create team
                    </Button>
                  </div>
                </form>

                <Panel className="rounded-lg content-start grid gap-3.5" padding="sm" tone="secondary">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-1 min-w-0">
                      <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Team members</h3>
                      <p className="text-ink-muted text-xs leading-[1.4] m-0">
                        {selectedTeam ? `${selectedTeam.name} members receive team-targeted escalations.` : "Select a team to manage responders."}
                      </p>
                    </div>
                    <Badge tone="neutral">{teamMembers.length}</Badge>
                  </div>

                  {!selectedTeam ? (
                    <EmptyState message="Create or select a team first." title="No team selected" />
                  ) : teamMembersQuery.error ? (
                    <ErrorState error={teamMembersQuery.error} onRetry={() => void teamMembersQuery.refetch()} title="Could not load team members" />
                  ) : teamMembersQuery.isLoading ? (
                    <LoadingState message="Loading team members..." />
                  ) : (
                    <>
                      <div className="grid gap-2">
                        {teamMembers.length > 0 ? teamMembers.map((member) => (
                          <div className="border border-hairline-soft rounded-md flex items-center justify-between gap-3 min-w-0 p-2.5" key={member.user_id}>
                            <div className="grid gap-0.5 min-w-0">
                              <strong className="text-ink text-[13px] font-[650] leading-tight truncate">{userNameById.get(member.user_id) ?? shortId(member.user_id)}</strong>
                              <span className="text-ink-muted text-xs leading-[1.35]">{member.role}</span>
                            </div>
                            <Button
                              disabled={!canManageProjectAccess || removeTeamMemberMutation.isPending}
                              onClick={() => void handleRemoveTeamMember(member.user_id)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Remove
                            </Button>
                          </div>
                        )) : (
                          <EmptyState message="Add project members to make this team usable in escalation policies." title="No members" />
                        )}
                      </div>

                      <form className="grid gap-3" onSubmit={handleAddTeamMember}>
                        <Field label="Add project member">
                          <Select
                            disabled={!canManageProjectAccess || addTeamMemberMutation.isPending || availableTeamMembers.length === 0}
                            onChange={(event) => setTeamMemberForm({ userId: event.target.value })}
                            value={teamMemberForm.userId}
                          >
                            <option value="">{availableTeamMembers.length > 0 ? "Select member" : "No available project members"}</option>
                            {availableTeamMembers.map((member) => (
                              <option key={member.user_id} value={member.user_id}>
                                {formatWorkspaceMemberOption(member, userNameById)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        {addTeamMemberMutation.error ? <ErrorState error={addTeamMemberMutation.error} title="Could not add team member" /> : null}
                        {removeTeamMemberMutation.error ? <ErrorState error={removeTeamMemberMutation.error} title="Could not remove team member" /> : null}
                        <Button
                          className="w-full"
                          disabled={!canManageProjectAccess || !teamMemberForm.userId}
                          isLoading={addTeamMemberMutation.isPending}
                          type="submit"
                          variant="primary"
                        >
                          Add member
                        </Button>
                      </form>
                    </>
                  )}
                </Panel>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "access" ? (
          <div aria-labelledby="settings-tab-access" className="grid gap-4 min-w-0" id="settings-panel-access" role="tabpanel">
            <SectionHeader
              description="Invite project users and assign the role bundles they need."
              title="Members & roles"
            />
            <div className="grid items-start gap-4.5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
              <div className="grid gap-4.5 min-w-0">
                <section className="grid gap-3.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Project members</h3>
                    <Badge tone="blue">{activeMemberCount} active</Badge>
                  </div>
                  <DataTable
                    columns={memberColumns}
                    emptyState={<EmptyState message="No members found." title="No members" />}
                    getRowKey={(member) => `${member.workspace_id}:${member.user_id}`}
                    rows={members}
                  />
                  {updateMemberRolesMutation.error ? (
                    <ErrorState error={updateMemberRolesMutation.error} title="Could not update member roles" />
                  ) : null}
                </section>

                <section className="grid gap-3.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Project invitations</h3>
                    <Badge tone={pendingInviteCount > 0 ? "yellow" : "neutral"}>{pendingInviteCount} pending</Badge>
                  </div>
                  <DataTable
                    columns={inviteColumns}
                    emptyState={<EmptyState message="No project invitations found." title="No invites" />}
                    getRowKey={(invite) => invite.id}
                    rows={workspaceInvites}
                  />
                  {revokeInviteMutation.error ? (
                    <ErrorState error={revokeInviteMutation.error} title="Could not cancel invite" />
                  ) : null}
                </section>
              </div>

              <aside className="grid gap-3.5 min-w-0 xl:sticky xl:top-[92px]">
                <form className="bg-surface-2 border border-hairline-soft rounded-xl content-start grid gap-3.5 min-w-0 p-4" onSubmit={handleCreateInvite}>
                  <div className="grid gap-1">
                    <span className="text-accent-blue text-[11px] font-[750] leading-none uppercase">Invitation</span>
                    <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Invite user</h3>
                    <p className="text-ink-muted text-xs leading-[1.4] m-0">Invite a user by email into this project.</p>
                  </div>
                  <Field label="Project">
                    <Select onChange={(event) => handleSelectWorkspace(event.target.value)} value={selectedWorkspace?.id ?? ""}>
                      {workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    hint={selectedWorkspace
                      ? "They can accept the invite from user settings."
                      : "Select a project first."}
                    label="Email"
                    required
                  >
                    <TextInput
                      autoComplete="email"
                      disabled={createInviteMutation.isPending || !selectedWorkspace || !canManageProjectAccess}
                      onChange={(event) => setInviteForm((current) => ({ ...current, invitedUserEmail: event.target.value }))}
                      placeholder="responder@example.com"
                      required
                      type="email"
                      value={inviteForm.invitedUserEmail}
                    />
                  </Field>
                  <Field label="Roles">
                    <RoleCheckboxGroup
                      disabled={createInviteMutation.isPending || !canManageProjectAccess}
                      onChange={(roles) => setInviteForm((current) => ({ ...current, roles }))}
                      value={inviteForm.roles}
                    />
                  </Field>
                  {createInviteMutation.error ? <ErrorState error={createInviteMutation.error} title="Could not create invite" /> : null}
                  {isMemberQuotaBlocked ? (
                    <StateBlock
                      message="This project has reached its member limit. Contact support for assistance."
                      title="Member limit reached"
                      tone="danger"
                    />
                  ) : null}
                  <Button
                    className="w-full"
                    disabled={!selectedWorkspace || !canManageProjectAccess || !inviteForm.invitedUserEmail.trim() || inviteForm.roles.length === 0 || isMemberQuotaBlocked}
                    isLoading={createInviteMutation.isPending}
                    type="submit"
                    variant="primary"
                  >
                    Create invite
                  </Button>
                </form>
              </aside>
            </div>
          </div>
        ) : null}

        {activeTab === "audit" ? (
          <div aria-labelledby="settings-tab-audit" className="grid gap-4 min-w-0" id="settings-panel-audit" role="tabpanel">
            <SectionHeader
              description="Review project activity with actor, resource, action, time, and metadata context."
              title="Audit log"
            />
            {!canManageProjectAccess ? (
              <ErrorState
                error="Project management permission is required to view audit logs."
                title="Project management access required"
              />
            ) : (
              <>
                <Panel className="grid gap-3.5" padding="sm" tone="subtle">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <Field label="Search">
                      <TextInput
                        onChange={(event) => handleAuditFilterChange({ search: event.target.value })}
                        placeholder="Search action, message, resource id"
                        value={auditFilters.search}
                      />
                    </Field>
                    <Field label="Actor">
                      <Select
                        onChange={(event) => handleAuditFilterChange({ actorUserId: event.target.value })}
                        value={auditFilters.actorUserId}
                      >
                        <option value="">Any actor</option>
                        {selectedWorkspaceMembers.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {userNameById.get(member.user_id) ?? shortId(member.user_id)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Resource type">
                      <Select
                        onChange={(event) => handleAuditFilterChange({ resourceType: event.target.value })}
                        value={auditFilters.resourceType}
                      >
                        <option value="">Any resource</option>
                        {auditResourceTypes.map((resourceType) => (
                          <option key={resourceType} value={resourceType}>{resourceType}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Action">
                      <TextInput
                        onChange={(event) => handleAuditFilterChange({ action: event.target.value })}
                        placeholder="service.updated"
                        value={auditFilters.action}
                      />
                    </Field>
                    <Field label="Resource ID">
                      <TextInput
                        onChange={(event) => handleAuditFilterChange({ resourceId: event.target.value })}
                        placeholder="Optional resource UUID"
                        value={auditFilters.resourceId}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="From">
                        <TextInput
                          key={`audit-from-${locale}`}
                          lang={locale}
                          onChange={(event) => handleAuditFilterChange({ from: event.target.value })}
                          type="datetime-local"
                          value={auditFilters.from}
                        />
                      </Field>
                      <Field label="To">
                        <TextInput
                          key={`audit-to-${locale}`}
                          lang={locale}
                          onChange={(event) => handleAuditFilterChange({ to: event.target.value })}
                          type="datetime-local"
                          value={auditFilters.to}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink-subtle text-xs leading-[1.35]">
                      Loaded logs: {auditLogs.length}
                    </span>
                    <Button
                      onClick={() => {
                        setAuditFilters(defaultAuditFilters);
                        setSelectedAuditLogId(null);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Reset filters
                    </Button>
                  </div>
                </Panel>

                <div className="grid items-start gap-4.5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
                  <section className="grid gap-3.5 min-w-0">
                    {auditLogsQuery.isLoading ? <TablePageSkeleton label="Loading audit logs" /> : null}
                    {auditLogsQuery.error ? <ErrorState error={auditLogsQuery.error} onRetry={() => void auditLogsQuery.refetch()} title="Could not load audit logs" /> : null}
                    {!auditLogsQuery.isLoading ? (
                      <DataTable
                        columns={auditColumns}
                        emptyState={<EmptyState message="No audit logs match the current filters." title="No audit logs" />}
                        getRowKey={(log) => log.id}
                        onRowClick={(log) => setSelectedAuditLogId(log.id)}
                        rows={auditLogs}
                      />
                    ) : null}
                    <div className="flex justify-end">
                      <Button
                        disabled={!auditLogsQuery.hasNextPage}
                        isLoading={auditLogsQuery.isFetchingNextPage}
                        onClick={() => void auditLogsQuery.fetchNextPage()}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Load more
                      </Button>
                    </div>
                  </section>
                  <AuditLogDetailPanel log={selectedAuditLog} userNameById={userNameById} />
                </div>
              </>
            )}
          </div>
        ) : null}

        <Dialog
          confirmLabel="Cancel invitation"
          description={pendingRevokeInvite
            ? `${pendingRevokeInvite.invited_user_email} will no longer be able to accept this invitation.`
            : "The recipient will no longer be able to accept this invitation."}
          isConfirming={revokeInviteMutation.isPending}
          onClose={() => setPendingRevokeInvite(null)}
          onConfirm={() => void handleRevokeInvite()}
          open={pendingRevokeInvite !== null}
          title="Cancel this invitation?"
          tone="danger"
        />

        <Dialog
          confirmLabel="Delete Twilio settings"
          description="SMS and phone notifications will stop using Twilio until it is configured again."
          isConfirming={updateProviderSettingMutation.isPending}
          onClose={() => setIsDeleteTwilioDialogOpen(false)}
          onConfirm={() => void handleDeleteTwilioProviderSetting()}
          open={isDeleteTwilioDialogOpen}
          title="Delete Twilio settings?"
          tone="danger"
        />
      </Panel>
      </section>
    </LocalizedText>
  );
}

function ProviderEventCheckboxes({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: WorkspaceWebhookIntegrationEventAction[]) => void;
  value: WorkspaceWebhookIntegrationEventAction[];
}) {
  return (
    <fieldset className="grid gap-2 rounded-lg border border-hairline-soft p-3">
      <legend className="px-1 text-ink-muted text-[13px] font-semibold">Send notifications for</legend>
      <p className="m-0 text-ink-subtle text-xs leading-[1.4]">
        Lifecycle updates go to the email or phone recipients reached by the original incident alert.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {providerEventOptions.map((option) => (
          <CheckboxField
            checked={value.includes(option.value)}
            disabled={disabled || (value.length === 1 && value[0] === option.value)}
            key={option.value}
            label={option.label}
            onChange={(event) => onChange(event.target.checked
              ? [...value, option.value]
              : value.filter((action) => action !== option.value))}
          />
        ))}
      </div>
    </fieldset>
  );
}

function resolveSmtpPortForSecurity(currentPort: string, security: "starttls" | "tls"): string {
  if (security === "tls" && currentPort === "587") return "465";
  if (security === "starttls" && currentPort === "465") return "587";
  return currentPort;
}

function ProjectSetupFlowRow({ item }: { item: SetupFlowItem }) {
  const isComplete = item.done;
  const isRecommended = !item.required;
  const statusTone = isComplete ? "green" : item.required ? "yellow" : "neutral";
  const statusLabel = isComplete ? "done" : item.required ? "required" : "optional";

  return (
    <article className={cn(
      "items-center grid gap-3 grid-cols-[10px_minmax(0,1fr)_auto] min-w-0 rounded-md border px-3 py-2.5",
      isComplete
        ? "bg-surface-2/45 border-hairline-soft"
        : isRecommended
          ? "bg-surface-2/55 border-hairline-soft"
          : "bg-warning/10 border-warning/18",
    )}>
      <span
        aria-hidden="true"
        className={cn(
          "rounded-full h-2 w-2",
          isComplete ? "bg-success" : isRecommended ? "bg-accent-blue" : "bg-ink-subtle",
        )}
      />
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <strong className={cn(
          "text-[13px] font-[650] leading-tight min-w-0",
          isComplete ? "text-ink-subtle" : "text-ink",
        )}>
          {item.label}
        </strong>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>
      {!isComplete ? (
        <Button
          onClick={item.onAction}
          size="sm"
          variant={item.required ? "secondary" : "ghost"}
        >
          {item.actionLabel}
        </Button>
      ) : null}
    </article>
  );
}

function AuditLogDetailPanel({
  log,
  userNameById,
}: {
  log: ActivityLog | null;
  userNameById: Map<string, string>;
}) {
  if (!log) {
    return (
      <aside className="bg-surface-2 border border-hairline-soft rounded-xl content-start grid gap-2 min-w-0 p-4 xl:sticky xl:top-[92px]">
        <span className="text-accent-blue text-[11px] font-[750] leading-none uppercase">Audit detail</span>
        <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Select a log</h3>
        <p className="text-ink-muted text-xs leading-[1.4] m-0">
          Choose a row to inspect exact timestamp, actor, resource, and metadata.
        </p>
      </aside>
    );
  }

  return (
    <aside className="bg-surface-2 border border-hairline-soft rounded-xl content-start grid gap-3.5 min-w-0 p-4 xl:sticky xl:top-[92px]">
      <div className="grid gap-1 min-w-0">
        <span className="text-accent-blue text-[11px] font-[750] leading-none uppercase">Audit detail</span>
        <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">{log.action}</h3>
        <p className="text-ink-muted text-xs leading-[1.4] m-0">{log.message}</p>
      </div>
      <DescriptionList
        items={[
          ["Time", formatDateTime(log.created_at)],
          ["Actor", formatAuditActor(log.actor_user_id, userNameById)],
          ["Actor ID", log.actor_user_id ? <span className="font-mono">{log.actor_user_id}</span> : "-"],
          ["Workspace", log.workspace_id ? <span className="font-mono">{log.workspace_id}</span> : "-"],
          ["Resource", `${log.resource_type}${log.resource_id ? ` ${shortId(log.resource_id)}` : ""}`],
          ["Resource ID", log.resource_id ? <span className="font-mono">{log.resource_id}</span> : "-"],
        ]}
      />
      <div className="grid gap-2 min-w-0">
        <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Metadata</span>
        <pre className="bg-surface-1 border border-hairline rounded-md max-h-92 overflow-auto p-3 text-ink-muted text-[11px] leading-[1.45] whitespace-pre-wrap">
          {formatAuditMetadata(log.metadata)}
        </pre>
      </div>
    </aside>
  );
}

function RoleCheckboxGroup({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (roles: WorkspaceRoleKey[]) => void;
  value: readonly WorkspaceRoleKey[];
}) {
  const selectedRoles = useMemo(() => new Set(value), [value]);

  return (
    <div className="grid gap-3 min-w-0">
      {workspaceRoleGroups.map((group) => (
        <div className="grid gap-2 min-w-0" key={group.label}>
          <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">{group.label}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.roles.map((role) => (
              <CheckboxField
                checked={selectedRoles.has(role)}
                disabled={disabled}
                key={role}
                label={formatWorkspaceRoleKey(role)}
                onChange={(event) => onChange(toggleWorkspaceRole(value, role, event.target.checked))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberRoleEditor({
  disabled,
  isSaving,
  member,
  onSave,
}: {
  disabled: boolean;
  isSaving: boolean;
  member: WorkspaceMember;
  onSave: (roles: WorkspaceRoleKey[]) => Promise<unknown>;
}) {
  const initialRoles = member.roles;
  const [draftRoles, setDraftRoles] = useState<WorkspaceRoleKey[]>(initialRoles);
  const hasChanges = !areWorkspaceRolesEqual(draftRoles, initialRoles);

  useEffect(() => {
    setDraftRoles(initialRoles);
  }, [initialRoles]);

  return (
    <div className="grid gap-2 min-w-0">
      <RoleCheckboxGroup disabled={disabled || isSaving} onChange={setDraftRoles} value={draftRoles} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={disabled || isSaving || !hasChanges || draftRoles.length === 0}
          isLoading={isSaving}
          onClick={() => void onSave(draftRoles)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Save roles
        </Button>
        {hasChanges ? (
          <Button disabled={disabled || isSaving} onClick={() => setDraftRoles(initialRoles)} size="sm" type="button" variant="ghost">
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RoleBadgeList({ roles }: { roles: readonly WorkspaceRoleKey[] | undefined }) {
  const visibleRoles = roles ?? [];

  if (visibleRoles.length === 0) {
    return <Badge tone="neutral">-</Badge>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleRoles.map((role) => (
        <Badge key={role} tone="blue">{formatWorkspaceRoleKey(role)}</Badge>
      ))}
    </div>
  );
}

function toggleWorkspaceRole(
  roles: readonly WorkspaceRoleKey[],
  role: WorkspaceRoleKey,
  checked: boolean,
): WorkspaceRoleKey[] {
  if (checked) {
    return [...new Set([...roles, role])];
  }

  return roles.filter((currentRole) => currentRole !== role);
}

function areWorkspaceRolesEqual(left: readonly WorkspaceRoleKey[], right: readonly WorkspaceRoleKey[]) {
  if (left.length !== right.length) return false;

  const rightRoles = new Set(right);

  return left.every((role) => rightRoles.has(role));
}

function formatWorkspaceRoles(roles: readonly WorkspaceRoleKey[] | undefined) {
  if (!roles || roles.length === 0) {
    return "-";
  }

  return roles.map(formatWorkspaceRoleKey).join(", ");
}

function createAuditLogColumns(userNameById: Map<string, string>): Array<DataTableColumn<ActivityLog>> {
  return [
    {
      header: "Time",
      key: "time",
      render: (log) => (
        <time dateTime={log.created_at} title={formatDateTime(log.created_at)}>
          {formatRelativeTime(log.created_at)}
        </time>
      ),
      width: 130,
    },
    {
      header: "Actor",
      key: "actor",
      render: (log) => formatAuditActor(log.actor_user_id, userNameById),
      width: 160,
    },
    {
      header: "Action",
      key: "action",
      render: (log) => (
        <div className="grid gap-1 min-w-50">
          <strong className="text-ink text-sm font-[650] leading-[1.3]">{log.action}</strong>
          <span className="text-ink-subtle font-mono text-xs leading-[1.35] block max-w-150 overflow-hidden text-ellipsis whitespace-nowrap">
            {log.message}
          </span>
        </div>
      ),
    },
    {
      header: "Resource",
      key: "resource",
      render: (log) => `${log.resource_type}${log.resource_id ? ` ${shortId(log.resource_id)}` : ""}`,
      width: 210,
    },
    {
      header: "ID",
      key: "id",
      render: (log) => <span className="font-mono">{shortId(log.id)}</span>,
      width: 110,
    },
  ];
}

function createAuditLogFilters(workspaceId: string | undefined, filters: AuditFilterFormState): Partial<AuditLogQuery> {
  if (!workspaceId) {
    return {};
  }

  return cleanAuditFilters({
    action: filters.action.trim(),
    actor_user_id: filters.actorUserId,
    from: toAuditDateTime(filters.from),
    resource_id: filters.resourceId.trim(),
    search: filters.search.trim(),
    to: toAuditDateTime(filters.to),
    workspace_id: workspaceId,
    ...(filters.resourceType ? { resource_type: filters.resourceType as ActivityResourceType } : {}),
  });
}

function cleanAuditFilters(filters: Partial<AuditLogQuery>): Partial<AuditLogQuery> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as Partial<AuditLogQuery>;
}

function toAuditDateTime(value: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatAuditActor(actorUserId: string | null, userNameById: Map<string, string>) {
  if (!actorUserId) {
    return "System";
  }

  return userNameById.get(actorUserId) ?? shortId(actorUserId);
}

function formatAuditMetadata(metadata: unknown) {
  if (metadata === undefined || metadata === null) {
    return "{}";
  }

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

function createMemberColumns(
  userNameById: Map<string, string>,
  workspaceNameById: Map<string, string>,
  options: {
    canManageRoles: boolean;
    onSaveRoles: (userId: string, roles: WorkspaceRoleKey[]) => Promise<unknown>;
    savingUserId: string | undefined;
  },
): Array<DataTableColumn<WorkspaceMember>> {
  return [
    {
      header: "User",
      key: "user",
      render: (member) => userNameById.get(member.user_id) ?? shortId(member.user_id),
    },
    {
      header: "Project",
      key: "project",
      render: (member) => workspaceNameById.get(member.workspace_id) ?? shortId(member.workspace_id),
    },
    {
      header: "Roles",
      key: "roles",
      render: (member) => (
        <MemberRoleEditor
          disabled={!options.canManageRoles}
          isSaving={options.savingUserId === member.user_id}
          member={member}
          onSave={(roles) => options.onSaveRoles(member.user_id, roles)}
        />
      ),
      width: 520,
    },
  ];
}

function formatWorkspaceMemberOption(member: WorkspaceMember, userNameById: Map<string, string>) {
  return `${userNameById.get(member.user_id) ?? shortId(member.user_id)} (${formatWorkspaceRoles(member.roles)})`;
}

function createProjectInviteColumns(
  userNameById: Map<string, string>,
  options: {
    canRevoke: boolean;
    onRevoke: (invite: WorkspaceInvite) => void;
    revokingInviteId: string | undefined;
  },
): Array<DataTableColumn<WorkspaceInvite>> {
  return [
    {
      header: "Invite",
      key: "invite",
      render: (invite) => {
        const invitedUserName = invite.invited_user_id ? userNameById.get(invite.invited_user_id) : undefined;

        return (
          <div className="grid gap-1 min-w-45">
            <strong className="text-ink text-sm font-[650] leading-[1.3]">{invitedUserName ?? invite.invited_user_email}</strong>
            <span className="text-ink-subtle font-mono text-xs leading-[1.35] block max-w-140 overflow-hidden text-ellipsis whitespace-nowrap">{invite.invited_user_email}</span>
          </div>
        );
      },
    },
    {
      header: "Roles",
      key: "roles",
      render: (invite) => <RoleBadgeList roles={invite.roles} />,
      width: 280,
    },
    {
      header: "Status",
      key: "status",
      render: (invite) => <Badge tone={invite.status === "pending" ? "yellow" : invite.status === "accepted" ? "green" : "neutral"}>{invite.status}</Badge>,
      width: 110,
    },
    {
      header: "Expires",
      key: "expires",
      render: (invite) => formatDateTime(invite.expires_at),
      width: 160,
    },
    {
      header: "Actions",
      key: "actions",
      render: (invite) => invite.status === "pending" && options.canRevoke ? (
        <Button
          disabled={options.revokingInviteId === invite.id}
          isLoading={options.revokingInviteId === invite.id}
          onClick={() => options.onRevoke(invite)}
          size="sm"
          variant="ghost"
        >
          Cancel
        </Button>
      ) : "-",
      width: 110,
    },
  ];
}
