import type { Workspace, WorkspaceInvite } from "@im/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { queryKeys } from "../../../shared/api/queryKeys";
import { useAuth } from "../../../shared/auth";
import {
  Badge,
  BrandMark,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  InfoTooltip,
  LoadingState,
  TablePageSkeleton,
  Panel,
  SectionHeader,
  TextInput,
  type DataTableColumn,
} from "../../../shared/components";
import { LocalizedText } from "../../../shared/i18n";
import { ThemeToggleButton } from "../../../shared/theme";
import { cn } from "../../../shared/utils";
import { formatRelativeTime } from "../../../shared/utils";
import {
  useAcceptProjectInviteMutation,
  useCreateProjectMutation,
  useDeclineProjectInviteMutation,
  useMyProjectInvites,
  useMyProjects,
  useProjectSetupEscalationPolicies,
  useProjectSetupIncidents,
  useProjectSetupNotificationProviders,
  useProjectSetupOnCallSchedules,
  useProjectSetupServices,
  useProjectSetupTeams,
} from "../queries";

type SetupChecklistItem = {
  actionLabel: string;
  count: number;
  description: string;
  done: boolean;
  label: string;
  required: boolean;
  step: number;
  to: string;
};

export function ProjectSetupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearProject, logout, projectId, selectProject } = useAuth();
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [hasTouchedExpansion, setHasTouchedExpansion] = useState(false);
  const projectsQuery = useMyProjects();
  const invitesQuery = useMyProjectInvites();
  const createProjectMutation = useCreateProjectMutation();
  const acceptInviteMutation = useAcceptProjectInviteMutation();
  const declineInviteMutation = useDeclineProjectInviteMutation();
  const setupProjectId = expandedProjectId ?? projectId;
  const setupTeamsQuery = useProjectSetupTeams(setupProjectId);
  const setupServicesQuery = useProjectSetupServices(setupProjectId);
  const setupIncidentsQuery = useProjectSetupIncidents(setupProjectId);
  const setupOnCallQuery = useProjectSetupOnCallSchedules(setupProjectId);
  const setupPoliciesQuery = useProjectSetupEscalationPolicies(setupProjectId);
  const setupProvidersQuery = useProjectSetupNotificationProviders(setupProjectId);
  const [projectForm, setProjectForm] = useState({ name: "", slug: "" });

  const projects = projectsQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const pendingInvites = invites.filter((invite) => invite.status === "pending");
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const hasProjects = projects.length > 0;
  const hasPendingInvites = pendingInvites.length > 0;
  const shouldPrioritizeInvites = !selectedProject && hasPendingInvites;
  const setupChecklist = useMemo(
    () => createSetupChecklist({
      escalationPolicyCount: setupPoliciesQuery.data?.length ?? 0,
      hasNotificationProvider: setupProvidersQuery.data?.some((provider) => provider.enabled && provider.configured) ?? false,
      testIncidentCount: setupIncidentsQuery.data?.items.filter((incident) => incident.source === "service-detail-test").length ?? 0,
      onCallScheduleCount: setupOnCallQuery.data?.length ?? 0,
      serviceId: setupServicesQuery.data?.items[0]?.id,
      serviceCount: setupServicesQuery.data?.items.length ?? 0,
      teamCount: setupTeamsQuery.data?.length ?? 0,
    }),
    [
      setupOnCallQuery.data,
      setupPoliciesQuery.data,
      setupProvidersQuery.data,
      setupIncidentsQuery.data,
      setupServicesQuery.data,
      setupTeamsQuery.data,
    ],
  );
  const requiredSetupItems = setupChecklist.filter((item) => item.required);
  const completedSetupCount = requiredSetupItems.filter((item) => item.done).length;
  const setupTotal = requiredSetupItems.length;
  const setupProgressLabel = `${completedSetupCount}/${setupTotal}`;
  const isSetupComplete = setupTotal > 0 && completedSetupCount === setupTotal;
  const nextSetupItem = requiredSetupItems.find((item) => !item.done) ?? null;
  const inviteColumns = useMemo<Array<DataTableColumn<WorkspaceInvite>>>(
    () => [
      {
        header: "Invite",
        key: "invite",
        render: (invite) => (
          <div className="grid gap-1 min-w-45">
            <strong className="text-ink text-sm font-[650] leading-[1.3]">{invite.workspace_name}</strong>
            <span className="text-ink-subtle font-mono text-xs leading-[1.35] block">{invite.role}</span>
          </div>
        ),
      },
      {
        header: "Status",
        key: "status",
        render: (invite) => (
          <Badge tone={invite.status === "pending" ? "yellow" : invite.status === "accepted" ? "green" : "neutral"}>
            {invite.status}
          </Badge>
        ),
        width: 120,
      },
      {
        header: "Actions",
        key: "actions",
        render: (invite) => invite.status === "pending" ? (
          <div className="flex items-center flex-wrap gap-2">
            <Button
              disabled={acceptInviteMutation.isPending && acceptInviteMutation.variables === invite.id}
              isLoading={acceptInviteMutation.isPending && acceptInviteMutation.variables === invite.id}
              onClick={() => handleAcceptInvite(invite.id)}
              size="sm"
              variant="primary"
            >
              Accept
            </Button>
            <Button
              disabled={declineInviteMutation.isPending && declineInviteMutation.variables === invite.id}
              isLoading={declineInviteMutation.isPending && declineInviteMutation.variables === invite.id}
              onClick={() => declineInviteMutation.mutate(invite.id)}
              size="sm"
              variant="ghost"
            >
              Decline
            </Button>
          </div>
        ) : "-",
        width: 180,
      },
    ],
    [acceptInviteMutation, declineInviteMutation],
  );
  const isLoading = projectsQuery.isLoading || invitesQuery.isLoading;
  const hasLoadedProjectContext = projectsQuery.isSuccess && invitesQuery.isSuccess;
  const isPostLoginEntry = new URLSearchParams(location.search).get("post_login") === "1";
  const isSetupLoading = setupTeamsQuery.isLoading
    || setupServicesQuery.isLoading
    || setupIncidentsQuery.isLoading
    || setupOnCallQuery.isLoading
    || setupPoliciesQuery.isLoading
    || setupProvidersQuery.isLoading;
  const supportError = projectsQuery.error ?? invitesQuery.error;
  const setupError = setupTeamsQuery.error
    ?? setupServicesQuery.error
    ?? setupIncidentsQuery.error
    ?? setupOnCallQuery.error
    ?? setupPoliciesQuery.error
    ?? setupProvidersQuery.error;
  const startTitle = selectedProject
    ? selectedProject.name
    : shouldPrioritizeInvites
      ? "Accept an invitation to continue"
      : hasProjects
        ? "Choose a project to continue"
        : "Create your first project";
  const startDescription = selectedProject
    ? "This project context controls the incidents, services, schedules, policies, and delivery logs shown in the app."
    : shouldPrioritizeInvites
      ? "You already have a pending project invitation. Accept it to enter that project without creating a new one."
      : hasProjects
        ? "Pick an existing project, accept an invite, or create a new project for a separate operational space."
        : "Create a project only when you are setting up a new operational space.";

  useEffect(() => {
    if (!hasLoadedProjectContext || !projectId) {
      return;
    }

    if (!projects.some((project) => project.id === projectId)) {
      clearProject();
    }
  }, [clearProject, hasLoadedProjectContext, projectId, projects]);

  useEffect(() => {
    if (!hasLoadedProjectContext || !expandedProjectId) {
      return;
    }

    if (!projects.some((project) => project.id === expandedProjectId)) {
      setExpandedProjectId(null);
    }
  }, [expandedProjectId, hasLoadedProjectContext, projects]);

  useEffect(() => {
    if (hasTouchedExpansion || !hasLoadedProjectContext || !projectId) {
      return;
    }

    if (projects.some((project) => project.id === projectId)) {
      setExpandedProjectId(projectId);
    }
  }, [hasLoadedProjectContext, hasTouchedExpansion, projectId, projects]);

  useEffect(() => {
    if (!isPostLoginEntry || !hasLoadedProjectContext || !selectedProject || hasPendingInvites) {
      return;
    }

    navigate("/overview", { replace: true });
  }, [hasLoadedProjectContext, hasPendingInvites, isPostLoginEntry, navigate, selectedProject]);

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const project = await createProjectMutation.mutateAsync({
      name: projectForm.name.trim(),
      ...(projectForm.slug.trim() ? { slug: projectForm.slug.trim() } : {}),
    });

    selectProject(project.id);
    setProjectForm({ name: "", slug: "" });
    navigate("/overview", { replace: true });
  }

  async function handleAcceptInvite(inviteId: string) {
    const membership = await acceptInviteMutation.mutateAsync(inviteId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    selectProject(membership.workspace_id);
    navigate("/overview", { replace: true });
  }

  function handleOpenProject(project: Workspace) {
    selectProject(project.id);
    setExpandedProjectId(project.id);
    setHasTouchedExpansion(true);
    navigate("/overview", { replace: true });
  }

  function handleToggleProjectSetup(project: Workspace) {
    setHasTouchedExpansion(true);

    if (expandedProjectId === project.id) {
      setExpandedProjectId(null);
      return;
    }

    selectProject(project.id);
    setExpandedProjectId(project.id);
  }

  return (
    <LocalizedText>
      <main className="bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0)_280px),var(--color-canvas)] min-h-screen min-w-0 px-4 py-5 pb-9 sm:px-7.5 sm:py-6">
      <header className="flex items-center gap-4.5 justify-between mx-auto max-w-295 min-w-0 w-full mb-6">
        <div className="flex items-center gap-2.5 text-ink text-[15px] font-bold">
          <BrandMark />
          <span>Pager Who</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggleButton />
          <Button onClick={() => void logout()} size="sm" variant="ghost">
            Logout
          </Button>
        </div>
      </header>

      <section className="grid gap-4 mx-auto max-w-295 min-w-0 w-full">
        <header className="flex items-center justify-between gap-4 border-b border-hairline-soft pb-3.5">
          <div>
            <span className="inline-flex text-accent text-xs font-bold leading-none mb-2 uppercase">Project context</span>
            <div className="flex items-center gap-2.5">
              <h1 className="text-ink text-[clamp(28px,3.4vw,38px)] font-[650] leading-[1.05] m-0">Choose how to start</h1>
              <InfoTooltip>Choose an existing project to continue working, accept an invitation, or create a separate operational space.</InfoTooltip>
            </div>
            <p className="text-ink-muted text-sm leading-normal m-0 max-w-190">
              Join an invited project, open an existing project, or create a new operational space.
            </p>
          </div>
        </header>

        <section className="bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015)),var(--color-surface-1)] border border-hairline rounded-xl grid items-center gap-4.5 lg:grid-cols-[minmax(0,1fr)_auto_auto] min-w-0 p-4.5">
          <div className="grid gap-1.75 min-w-0">
            <span className="text-ink-subtle text-xs font-[750] leading-none uppercase">
              {selectedProject ? "Selected project" : shouldPrioritizeInvites ? "Invitation available" : "Start here"}
            </span>
            <h2 className="text-ink text-2xl font-[650] leading-[1.1] m-0 overflow-wrap-anywhere">
              {startTitle}
            </h2>
            <p className="text-ink-muted text-[13px] leading-[1.45] m-0 max-w-170">
              {startDescription}
            </p>
          </div>
          <div aria-label="Project context summary" className="grid gap-2 grid-cols-[repeat(3,minmax(74px,1fr))] min-w-0">
            <div className="bg-white/3 border border-hairline-soft rounded-md grid gap-1.5 min-w-0 px-3 py-2.5">
              <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Projects</span>
              <strong className="text-ink text-lg font-[650] leading-none">{projects.length}</strong>
            </div>
            <div className="bg-white/3 border border-hairline-soft rounded-md grid gap-1.5 min-w-0 px-3 py-2.5">
              <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Invites</span>
              <strong className="text-ink text-lg font-[650] leading-none">{pendingInvites.length}</strong>
            </div>
            <div className="bg-white/3 border border-hairline-soft rounded-md grid gap-1.5 min-w-0 px-3 py-2.5">
              <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Setup</span>
              <strong className="text-ink text-lg font-[650] leading-none">{selectedProject ? setupProgressLabel : "-"}</strong>
            </div>
          </div>
          {selectedProject || shouldPrioritizeInvites || hasProjects ? (
            <div className="flex items-center flex-wrap gap-2.5 justify-end">
              {selectedProject ? (
                <Button onClick={() => navigate(nextSetupItem?.to ?? "/incidents")} variant="primary">
                  {nextSetupItem ? "Continue setup" : "Open incident queue"}
                </Button>
              ) : shouldPrioritizeInvites ? (
                <Button onClick={() => document.getElementById("pending-invitations")?.scrollIntoView({ behavior: "smooth", block: "start" })} variant="primary">
                  Review invitations
                </Button>
              ) : (
                <Button onClick={() => document.getElementById("my-projects")?.scrollIntoView({ behavior: "smooth", block: "start" })} variant="primary">
                  Choose project
                </Button>
              )}
            </div>
          ) : null}
        </section>

        {supportError ? <ErrorState error={supportError} onRetry={() => Promise.all([projectsQuery.refetch(), invitesQuery.refetch()])} title="Could not load projects" /> : null}

        {hasPendingInvites || acceptInviteMutation.error || declineInviteMutation.error ? (
          <Panel className="grid gap-4.5" id="pending-invitations">
            <SectionHeader
              action={<Badge tone="yellow">{pendingInvites.length} pending</Badge>}
              description="Accept an invitation to enter a project without creating a new one."
              eyebrow="Invitations"
              title="Pending invitations"
            />
            <DataTable
              columns={inviteColumns}
              emptyState={<EmptyState message="No pending project invitations." title="No invites" />}
              getRowKey={(invite) => invite.id}
              rows={pendingInvites}
            />
            {acceptInviteMutation.error ? <ErrorState error={acceptInviteMutation.error} title="Could not accept invite" /> : null}
            {declineInviteMutation.error ? <ErrorState error={declineInviteMutation.error} title="Could not decline invite" /> : null}
          </Panel>
        ) : null}

        <div className={cn(
          "grid items-start gap-4.5",
          hasProjects || !hasPendingInvites ? "xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] grid-cols-1" : "grid-cols-1",
        )}>
          {hasProjects || !hasPendingInvites ? (
            <Panel className="grid gap-4.5" id="my-projects">
              <SectionHeader
                description="Click a project to enter the incident response workspace for that project."
                eyebrow="Projects"
                title="My projects"
              />
              {isLoading ? <TablePageSkeleton label="Loading projects" /> : null}
              {!isLoading && !supportError ? (
                <ProjectList
                  expandedProjectId={expandedProjectId}
                  isSetupComplete={isSetupComplete}
                  isSetupLoading={isSetupLoading}
                  nextSetupItem={nextSetupItem}
                  onOpen={handleOpenProject}
                  onOpenSetupItem={(to) => navigate(to)}
                  onToggleSetup={handleToggleProjectSetup}
                  onRetrySetup={() => Promise.all([
                    setupTeamsQuery.refetch(),
                    setupServicesQuery.refetch(),
                    setupOnCallQuery.refetch(),
                    setupPoliciesQuery.refetch(),
                    setupIncidentsQuery.refetch(),
                    setupProvidersQuery.refetch(),
                  ])}
                  projects={projects}
                  selectedProjectId={projectId}
                  setupChecklist={setupChecklist}
                  setupError={setupError}
                  setupProgressLabel={setupProgressLabel}
                />
              ) : null}
            </Panel>
          ) : null}

          <aside className="grid gap-4.5 min-w-0">
            <form className="bg-surface-1 border border-hairline rounded-3.5 p-4 grid gap-4.5 min-w-0" id="create-project" onSubmit={handleCreateProject}>
              <SectionHeader
                description={shouldPrioritizeInvites ? "Use this only if you need a separate new project." : "Create a new workspace for incident response."}
                eyebrow="New project"
                title={shouldPrioritizeInvites ? "Create instead" : "Create project"}
              />
              <div className="grid gap-3.5">
                <Field label="Name" required>
                  <TextInput
                    disabled={createProjectMutation.isPending}
                    onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    value={projectForm.name}
                  />
                </Field>
                <Field label="Slug">
                  <TextInput
                    disabled={createProjectMutation.isPending}
                    onChange={(event) => setProjectForm((current) => ({ ...current, slug: event.target.value }))}
                    placeholder="core-platform"
                    value={projectForm.slug}
                  />
                </Field>
              </div>
              {createProjectMutation.error ? <ErrorState error={createProjectMutation.error} title="Could not create project" /> : null}
              <div className="flex flex-wrap gap-2.5 justify-end">
                <Button disabled={!projectForm.name.trim()} isLoading={createProjectMutation.isPending} type="submit" variant="primary">
                  Create project
                </Button>
              </div>
            </form>
          </aside>
        </div>
      </section>
      </main>
    </LocalizedText>
  );
}

function ProjectList({
  expandedProjectId,
  isSetupComplete,
  isSetupLoading,
  nextSetupItem,
  onOpen,
  onOpenSetupItem,
  onRetrySetup,
  onToggleSetup,
  projects,
  selectedProjectId,
  setupChecklist,
  setupError,
  setupProgressLabel,
}: {
  expandedProjectId: string | null;
  isSetupComplete: boolean;
  isSetupLoading: boolean;
  nextSetupItem: SetupChecklistItem | null;
  onOpen: (project: Workspace) => void;
  onOpenSetupItem: (to: string) => void;
  onRetrySetup: () => void | Promise<unknown>;
  onToggleSetup: (project: Workspace) => void;
  projects: Workspace[];
  selectedProjectId: string | undefined;
  setupChecklist: SetupChecklistItem[];
  setupError: unknown;
  setupProgressLabel: string;
}) {
  if (projects.length === 0) {
    return (
      <div className="bg-surface-1 border border-hairline rounded-md p-4.5">
        <EmptyState message="Accept an invitation or create a project to continue." title="No projects" />
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      {projects.map((project) => {
        const isExpanded = expandedProjectId === project.id;
        const isSelected = selectedProjectId === project.id;

        return (
          <article
            className={cn(
              "bg-surface-1 border rounded-md min-w-0 overflow-hidden transition-colors duration-120",
              isSelected ? "border-accent/42" : "border-hairline",
            )}
            key={project.id}
          >
            <div className="grid items-center gap-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_auto] min-w-0 p-3.5">
              <div className="grid gap-2 min-w-0">
                <div className="flex items-center flex-wrap gap-2 min-w-0">
                  <strong className="text-ink text-sm font-[650] leading-[1.3] overflow-wrap-anywhere">{project.name}</strong>
                  {isSelected ? <Badge tone="green">selected</Badge> : null}
                </div>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-ink-subtle text-xs leading-[1.35] min-w-0">
                  <span className="font-mono max-w-96 overflow-hidden text-ellipsis whitespace-nowrap">{project.slug}</span>
                  <span>Role: {project.role ?? "-"}</span>
                  <span>Updated {formatRelativeTime(project.updated_at)}</span>
                </div>
              </div>
              <div className="flex items-center flex-wrap justify-start lg:justify-end gap-2">
                <Button onClick={() => onOpen(project)} size="sm" variant={isSelected ? "primary" : "secondary"}>
                  Open
                </Button>
                <Button
                  aria-expanded={isExpanded}
                  aria-controls={`project-setup-${project.id}`}
                  onClick={() => onToggleSetup(project)}
                  size="sm"
                  variant="ghost"
                >
                  <span className="inline-flex items-center gap-1.5">
                    Setup
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("transition-transform duration-120 ease", isExpanded ? "rotate-180" : "")}
                      size={14}
                      strokeWidth={2.25}
                    />
                  </span>
                </Button>
              </div>
            </div>

            {isExpanded ? (
              <div className="border-t border-hairline-soft bg-white/[0.018] p-3.5" id={`project-setup-${project.id}`}>
                <ProjectReadinessDetails
                  isSetupComplete={isSetupComplete}
                  isSetupLoading={isSetupLoading}
                  nextSetupItem={nextSetupItem}
                  onOpenSetupItem={onOpenSetupItem}
                  onRetrySetup={onRetrySetup}
                  projectName={project.name}
                  setupChecklist={setupChecklist}
                  setupError={setupError}
                  setupProgressLabel={setupProgressLabel}
                />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function ProjectReadinessDetails({
  isSetupComplete,
  isSetupLoading,
  nextSetupItem,
  onOpenSetupItem,
  onRetrySetup,
  projectName,
  setupChecklist,
  setupError,
  setupProgressLabel,
}: {
  isSetupComplete: boolean;
  isSetupLoading: boolean;
  nextSetupItem: SetupChecklistItem | null;
  onOpenSetupItem: (to: string) => void;
  onRetrySetup: () => void | Promise<unknown>;
  projectName: string;
  setupChecklist: SetupChecklistItem[];
  setupError: unknown;
  setupProgressLabel: string;
}) {
  if (isSetupLoading) {
    return <LoadingState message="Loading setup status..." />;
  }

  if (setupError) {
    return <ErrorState error={setupError} onRetry={onRetrySetup} title="Could not load setup status" />;
  }

  return (
    <div className="grid gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1 min-w-0">
          <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Readiness</span>
          <strong className="text-ink text-sm font-[650] leading-[1.3]">
            {isSetupComplete ? "Ready for incidents" : "Incident loop setup"}
          </strong>
          <p className="text-ink-muted text-[13px] leading-[1.45] m-0">
            Complete the required steps for {projectName} from top to bottom.
          </p>
        </div>
        <Badge tone={isSetupComplete ? "green" : "yellow"}>{setupProgressLabel}</Badge>
      </div>
      <div className="bg-surface-2 border border-hairline rounded-md grid gap-2 p-3.25">
        <strong className="text-ink text-sm font-[650] leading-[1.3]">
          {nextSetupItem ? "Next setup step" : "Incident loop configured"}
        </strong>
        <p className="text-ink-muted text-[13px] leading-[1.45] m-0">
          {nextSetupItem?.description ?? "Core service intake, escalation, on-call, and delivery setup are available."}
        </p>
        <Button
          className="justify-self-start"
          onClick={() => onOpenSetupItem(nextSetupItem?.to ?? "/incidents")}
          size="sm"
          variant={nextSetupItem ? "secondary" : "primary"}
        >
          {nextSetupItem?.actionLabel ?? "Open incidents"}
        </Button>
      </div>
      <div className="grid gap-2">
        {setupChecklist.map((item) => (
          <SetupStatusRow item={item} key={item.label} onOpen={onOpenSetupItem} />
        ))}
      </div>
    </div>
  );
}

function SetupStatusRow({
  item,
  onOpen,
}: {
  item: SetupChecklistItem;
  onOpen: (to: string) => void;
}) {
  const isComplete = item.done;
  const isRecommended = !item.required;

  return (
    <article className={cn(
      "items-center grid gap-3 grid-cols-[28px_minmax(0,1fr)] sm:grid-cols-[28px_minmax(0,1fr)_auto] min-w-0 rounded-md border p-2.5",
      isComplete
        ? "bg-success/5 border-success/16"
        : isRecommended
          ? "bg-white/1.5 border-hairline-soft"
          : "bg-white/2.5 border-hairline-soft",
    )}>
      <span
        aria-label={`Step ${item.step}`}
        className={cn(
          "inline-flex items-center justify-center rounded-full h-7 w-7 text-xs font-bold leading-none",
          isComplete
            ? "bg-success text-canvas"
            : isRecommended
              ? "bg-accent/14 text-accent"
              : "bg-white/5 text-ink",
        )}
      >
        {item.step}
      </span>
      <div className="grid gap-0.75 min-w-0">
        <strong className="text-ink text-[13px] font-[650] leading-tight">{item.label}</strong>
        <span className="text-ink-subtle text-xs leading-[1.35]">{item.description}</span>
      </div>
      <div className="col-span-2 flex items-center justify-start gap-2 sm:col-span-1 sm:justify-end">
        <Badge tone={setupStatusTone(item)}>{setupStatusLabel(item)}</Badge>
        <Button
          onClick={() => onOpen(item.to)}
          size="sm"
          variant={isComplete || isRecommended ? "ghost" : "secondary"}
        >
          {isComplete ? "Review" : item.actionLabel}
        </Button>
      </div>
    </article>
  );
}

function createSetupChecklist({
  escalationPolicyCount,
  hasNotificationProvider,
  testIncidentCount,
  onCallScheduleCount,
  serviceId,
  serviceCount,
  teamCount,
}: {
  escalationPolicyCount: number;
  hasNotificationProvider: boolean;
  testIncidentCount: number;
  onCallScheduleCount: number;
  serviceId?: string | undefined;
  serviceCount: number;
  teamCount: number;
}): SetupChecklistItem[] {
  return [
    {
      actionLabel: "Create service",
      count: serviceCount,
      description: "Register the system that receives incidents and exposes its webhook endpoint.",
      done: serviceCount > 0,
      label: "Service catalog",
      required: true,
      step: 1,
      to: "/services",
    },
    {
      actionLabel: "Create policy",
      count: escalationPolicyCount,
      description: "Define who gets notified first, when escalation advances, and when repeat stops.",
      done: escalationPolicyCount > 0,
      label: "Escalation policy",
      required: true,
      step: 2,
      to: "/escalation-policies",
    },
    {
      actionLabel: "Create schedule",
      count: onCallScheduleCount,
      description: "Set the primary and secondary responders used by escalation steps.",
      done: onCallScheduleCount > 0,
      label: "On-call schedule",
      required: true,
      step: 3,
      to: "/on-call",
    },
    {
      actionLabel: "Configure providers",
      count: hasNotificationProvider ? 1 : 0,
      description: "Enable at least one delivery provider before relying on automated notifications.",
      done: hasNotificationProvider,
      label: "Notification provider",
      required: true,
      step: 4,
      to: "/project-settings",
    },
    {
      actionLabel: "Send test event",
      count: testIncidentCount,
      description: "Send a test event from a service webhook and open the created incident to confirm intake works.",
      done: testIncidentCount > 0,
      label: "Test incident",
      required: true,
      step: 5,
      to: serviceId ? `/services/${serviceId}?tab=webhooks` : "/services",
    },
    {
      actionLabel: "Manage project",
      count: teamCount,
      description: "Create responder groups for ownership labels and team targets in escalation policies.",
      done: teamCount > 0,
      label: "Teams",
      required: false,
      step: 6,
      to: "/project-settings",
    },
  ];
}

function setupStatusLabel(item: SetupChecklistItem) {
  if (item.done) return item.count > 0 ? `${item.count} set` : "Done";
  return item.required ? "Required" : "Optional";
}

function setupStatusTone(item: SetupChecklistItem) {
  if (item.done) return "green";
  return item.required ? "yellow" : "neutral";
}
