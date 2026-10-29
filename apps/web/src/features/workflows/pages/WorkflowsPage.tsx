import type {
  Workflow,
  WorkflowActionCatalogItem,
  WorkflowActionConfigField,
  WorkflowActionInput,
  WorkflowActionRun,
  WorkflowRun,
  WorkflowTriggerCatalogItem,
  WorkflowTriggerInput,
} from "@im/contracts";
import { WORKFLOW_ACTION_CATALOG } from "@im/contracts";
import {
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type Viewport,
  useReactFlow,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Braces,
  ChevronDown,
  CheckCircle2,
  GitBranch,
  LocateFixed,
  Pencil,
  Play,
  Plus,
  Power,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { type Dispatch, type FormEvent, type ReactNode, type SetStateAction, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Badge,
  Button,
  CheckboxField,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Panel,
  RefreshingIndicator,
  Select,
  TablePageSkeleton,
  TabButton,
  TextArea,
  TextInput,
  type DataTableColumn,
} from "../../../shared/components";
import { escalationApi, incidentApi, onCallApi, serviceApi, workflowApi, workerApi, userApi, workspaceApi } from "../../../shared/api/client";
import { queryKeys } from "../../../shared/api/queryKeys";
import { hasWorkspacePermission, useAuth } from "../../../shared/auth";
import { LocalizedText } from "../../../shared/i18n";
import { cn, formatDateTime, shortId } from "../../../shared/utils";

type WorkflowNodeGroup = "Start" | "Logic" | "External" | "Incident" | "Service" | "Webhook" | "Escalation" | "On-call" | "Notification";
type WorkflowNodeTone = "blue" | "green" | "neutral" | "yellow" | "orange" | "red";
type ResourceOptions = {
  escalationPolicies: Array<{ label: string; value: string }>;
  members: Array<{ label: string; value: string }>;
  services: Array<{ label: string; value: string }>;
  schedules: Array<{ label: string; value: string }>;
};
type WorkflowValueOption = {
  description?: string;
  kind: string;
  label: string;
  source: string;
  value: string;
};
type WorkflowConfigSection = "body" | "request" | "root" | "target";

const workflowActionCatalog = WORKFLOW_ACTION_CATALOG as unknown as readonly WorkflowActionCatalogItem[];
const actionPaletteGroups = buildActionPaletteGroups(workflowActionCatalog);
type ActionPaletteGroup = (typeof actionPaletteGroups)[number];

const defaultTriggerInputs: WorkflowTriggerInput[] = [
  {
    trigger_key: "trigger_1",
    event_action: "incident.created",
    resource_type: "incident",
    filters: [],
    entry_action_key: "condition_1",
  },
];

const defaultActionInputs: WorkflowActionInput[] = [
  {
    action_key: "condition_1",
    type: "condition",
    config: {
      display_name: "Check incident priority",
      body: {
        field: "{{event.metadata.priority}}",
        operator: "equals",
        value: "P1",
      },
    },
    next_action_key: "action_1",
    failure_action_key: null,
  },
  {
    action_key: "action_1",
    type: "http_request",
    config: {
      display_name: "Call webhook",
      request: {
        method: "POST",
        url: "https://example.com/workflow",
      },
    },
    next_action_key: null,
    failure_action_key: null,
  },
];

type EditorMode = "builder" | "json";
type SelectedNode = { kind: "action" | "trigger"; key: string } | null;

type GraphMetadata = {
  positions?: Record<string, { x: number; y: number }>;
  viewport?: Viewport;
};

type WorkflowFormState = {
  actions: WorkflowActionInput[];
  actionsJson: string;
  description: string;
  enabled: boolean;
  graphMetadata: GraphMetadata;
  graphMetadataJson: string;
  name: string;
  runAsUserId: string;
  triggers: WorkflowTriggerInput[];
  triggersJson: string;
};

type WorkflowNodeData = {
  detail: string;
  group: WorkflowNodeGroup;
  kind: "action" | "trigger";
  meta: string;
  status?: WorkflowActionRun["status"];
  title: string;
  tone: WorkflowNodeTone;
};

type WorkflowNode = Node<WorkflowNodeData, "workflowNode">;

function hasUnsavedWorkflowChanges(
  current: WorkflowFormState,
  saved: WorkflowFormState,
  editorMode: EditorMode,
) {
  const commonCurrent = {
    description: current.description,
    enabled: current.enabled,
    name: current.name,
    runAsUserId: current.runAsUserId,
  };
  const commonSaved = {
    description: saved.description,
    enabled: saved.enabled,
    name: saved.name,
    runAsUserId: saved.runAsUserId,
  };

  if (JSON.stringify(commonCurrent) !== JSON.stringify(commonSaved)) return true;

  if (editorMode === "json") {
    return current.actionsJson !== saved.actionsJson
      || current.graphMetadataJson !== saved.graphMetadataJson
      || current.triggersJson !== saved.triggersJson;
  }

  return JSON.stringify(current.actions) !== JSON.stringify(saved.actions)
    || JSON.stringify(current.triggers) !== JSON.stringify(saved.triggers)
    || JSON.stringify(current.graphMetadata.positions ?? {}) !== JSON.stringify(saved.graphMetadata.positions ?? {});
}

const workflowNodeTypes = {
  workflowNode: WorkflowCanvasNode,
};

export function WorkflowsPage() {
  const { isPlatformAdmin, projectId, userId } = useAuth();
  const queryClient = useQueryClient();
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("builder");
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({ kind: "trigger", key: "trigger_1" });
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedWorkflowName, setSelectedWorkflowName] = useState<string | null>(null);
  const [testMetadataJson, setTestMetadataJson] = useState("{}");
  const [testResourceId, setTestResourceId] = useState("");
  const [testTriggerKey, setTestTriggerKey] = useState("trigger_1");
  const [form, setForm] = useState<WorkflowFormState>(() => createInitialForm(userId));
  const [savedForm, setSavedForm] = useState<WorkflowFormState>(() => createInitialForm(userId));
  const [pendingSelection, setPendingSelection] = useState<Workflow | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Workflow | null>(null);
  const [workflowPages, setWorkflowPages] = useState<string[]>([]);
  const [runPages, setRunPages] = useState<string[]>([]);

  const projectsQuery = useQuery({
    queryKey: queryKeys.workspaces.mine(),
    queryFn: () => workspaceApi.listMyWorkspaces(),
  });
  const currentProject = projectsQuery.data?.find((project) => project.id === projectId);
  const canManageWorkflows = isPlatformAdmin || hasWorkspacePermission(currentProject?.roles ?? [], "project.manage");
  const queryOptions = { enabled: Boolean(projectId) && canManageWorkflows };
  const workspaceScopedFilter = projectId ? { workspace_id: projectId } : {};
  const serviceListFilter = projectId ? { limit: 100, workspace_id: projectId } : { limit: 100 };
  const incidentListFilter = projectId ? { limit: 100, workspace_id: projectId } : { limit: 100 };
  const usersFilter = projectId ? { workspace_id: projectId } : {};
  const workflowsQuery = useQuery({
    queryKey: queryKeys.workflows.list({ workspace_id: projectId, limit: 50, cursor: workflowPages.at(-1) }),
    queryFn: () => workflowApi.listWorkflows({ workspace_id: projectId, limit: 50, cursor: workflowPages.at(-1) }),
    enabled: Boolean(projectId) && canManageWorkflows,
  });
  const workerReadinessQuery = useQuery({
    queryKey: queryKeys.workers.readiness({ max_run_age_seconds: 120 }),
    queryFn: () => workerApi.getWorkerReadiness({ max_run_age_seconds: 120 }),
    ...queryOptions,
    refetchInterval: 30_000,
  });
  const triggersQuery = useQuery({
    queryKey: queryKeys.workflows.triggers(),
    queryFn: () => workflowApi.listTriggers(),
    ...queryOptions,
  });
  const membersQuery = useQuery({
    queryKey: projectId ? queryKeys.workspaces.members(projectId) : queryKeys.workspaces.members(""),
    queryFn: () => {
      if (!projectId) throw new Error("Project is required");
      return workspaceApi.listMembers(projectId);
    },
    ...queryOptions,
  });
  const servicesQuery = useQuery({
    queryKey: queryKeys.services.list(serviceListFilter),
    queryFn: () => serviceApi.listServices(serviceListFilter),
    ...queryOptions,
  });
  const incidentsQuery = useQuery({
    queryKey: queryKeys.incidents.list(incidentListFilter),
    queryFn: () => incidentApi.listIncidents(incidentListFilter),
    ...queryOptions,
  });
  const escalationPoliciesQuery = useQuery({
    queryKey: queryKeys.escalationPolicies.list(workspaceScopedFilter),
    queryFn: () => escalationApi.listEscalationPolicies(workspaceScopedFilter),
    ...queryOptions,
  });
  const schedulesQuery = useQuery({
    queryKey: queryKeys.onCall.schedules(workspaceScopedFilter),
    queryFn: () => onCallApi.listOnCallSchedules(workspaceScopedFilter),
    ...queryOptions,
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.users.list(usersFilter),
    queryFn: () => userApi.listUsers(usersFilter),
    ...queryOptions,
  });
  const runsQuery = useQuery({
    queryKey: selectedWorkflowId
      ? queryKeys.workflows.runs(selectedWorkflowId, { limit: 25, cursor: runPages.at(-1) })
      : queryKeys.workflows.runs("", { limit: 25 }),
    queryFn: () => {
      if (!selectedWorkflowId) throw new Error("Workflow is required");
      return workflowApi.listWorkflowRuns(selectedWorkflowId, { limit: 25, cursor: runPages.at(-1) });
    },
    enabled: Boolean(selectedWorkflowId) && canManageWorkflows,
    refetchInterval: 10_000,
  });
  const selectedRunQuery = useQuery({
    queryKey: selectedRunId ? queryKeys.workflows.run(selectedRunId) : queryKeys.workflows.run(""),
    queryFn: () => {
      if (!selectedRunId) throw new Error("Workflow run is required");
      return workflowApi.getWorkflowRun(selectedRunId);
    },
    enabled: Boolean(selectedRunId) && canManageWorkflows,
    refetchInterval: selectedRunId ? 5_000 : false,
  });

  const userById = useMemo(() => new Map((usersQuery.data ?? []).map((user) => [user.id, user])), [usersQuery.data]);
  const workflows = workflowsQuery.data?.items ?? [];
  const hasUnsavedChanges = hasUnsavedWorkflowChanges(form, savedForm, editorMode);
  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null;
  const runs = runsQuery.data?.items ?? [];
  const selectedRun = selectedRunQuery.data ?? runs.find((run) => run.id === selectedRunId) ?? null;
  const selectedTestTrigger = form.triggers.find((trigger) => trigger.trigger_key === testTriggerKey) ?? form.triggers[0] ?? null;
  const selectedTestResourceType = selectedTestTrigger?.resource_type ?? inferWorkflowResourceType(selectedTestTrigger?.event_action ?? "");
  const resourceOptions = useMemo<ResourceOptions>(() => ({
    escalationPolicies: (escalationPoliciesQuery.data ?? []).map((policy) => ({ label: policy.name, value: policy.id })),
    members: (membersQuery.data ?? []).map((member) => {
      const user = userById.get(member.user_id);
      return {
        label: user ? `${user.name} <${user.email}>` : member.user_id,
        value: member.user_id,
      };
    }),
    services: (servicesQuery.data?.items ?? []).map((service) => ({ label: service.name, value: service.id })),
    schedules: (schedulesQuery.data ?? []).map((schedule) => ({ label: schedule.name, value: schedule.id })),
  }), [escalationPoliciesQuery.data, membersQuery.data, schedulesQuery.data, servicesQuery.data?.items, userById]);
  const testResourceOptions = useMemo(() => workflowTestResourceOptions(selectedTestResourceType, {
    escalationPolicies: resourceOptions.escalationPolicies,
    incidents: (incidentsQuery.data?.items ?? []).map((incident) => ({
      label: `${incident.title} · ${incident.priority} · ${shortId(incident.id)}`,
      value: incident.id,
    })),
    schedules: resourceOptions.schedules,
    services: resourceOptions.services,
  }), [incidentsQuery.data?.items, resourceOptions.escalationPolicies, resourceOptions.schedules, resourceOptions.services, selectedTestResourceType]);

  const runColumns = useMemo<Array<DataTableColumn<WorkflowRun>>>(
    () => [
      {
        key: "status",
        header: "Status",
        width: 96,
        render: (run) => <WorkflowRunStatusBadge status={run.status} />,
      },
      {
        key: "attempt",
        header: "Attempt",
        width: 64,
        render: (run) => run.attempt,
      },
      {
        key: "created",
        header: "Created",
        width: 150,
        render: (run) => formatDateTime(run.created_at),
      },
    ],
    [],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Project is required");

      const { actions, graphMetadata, triggers } = resolveFormPayload(form, editorMode);
      const validationErrors = validateWorkflowGraph(triggers, actions);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      const payload = {
        actions,
        description: form.description.trim() || null,
        enabled: form.enabled,
        graph_metadata: graphMetadata,
        name: form.name.trim(),
        triggers,
        ...(editingWorkflowId && form.runAsUserId ? { run_as_user_id: form.runAsUserId } : {}),
      };

      if (!payload.name) throw new Error("Workflow name is required.");

      return editingWorkflowId
        ? workflowApi.updateWorkflow(editingWorkflowId, payload)
        : workflowApi.createWorkflow({
            ...payload,
            workspace_id: projectId,
          });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : String(error));
    },
    onSuccess: (workflow) => {
      loadWorkflowIntoForm(workflow);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (workflow: Workflow) =>
      workflow.enabled ? workflowApi.disableWorkflow(workflow.id) : workflowApi.enableWorkflow(workflow.id),
    onSuccess: (workflow) => {
      setSelectedWorkflowId(workflow.id);
      setSelectedWorkflowName(workflow.name);
      if (editingWorkflowId === workflow.id) {
        setForm((current) => ({ ...current, enabled: workflow.enabled }));
        setSavedForm((current) => ({ ...current, enabled: workflow.enabled }));
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (workflowId: string) => workflowApi.deleteWorkflow(workflowId),
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : String(error));
    },
    onSuccess: (workflow) => {
      if (editingWorkflowId === workflow.id) resetForm();
      if (selectedWorkflowId === workflow.id) {
        setSelectedWorkflowId(null);
        setSelectedWorkflowName(null);
        setSelectedRunId(null);
        setRunPages([]);
      }
      setPendingDelete(null);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });
  const setEnabledMutation = useMutation({
    mutationFn: ({ enabled, workflowId }: { enabled: boolean; workflowId: string }) =>
      enabled ? workflowApi.enableWorkflow(workflowId) : workflowApi.disableWorkflow(workflowId),
    onError: (error, variables) => {
      setForm((current) => ({ ...current, enabled: !variables.enabled }));
      setFormError(error instanceof Error ? error.message : String(error));
    },
    onSuccess: (workflow) => {
      setSelectedWorkflowId(workflow.id);
      setSelectedWorkflowName(workflow.name);
      setForm((current) => ({ ...current, enabled: workflow.enabled }));
      setSavedForm((current) => ({ ...current, enabled: workflow.enabled }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });
  const testRunMutation = useMutation({
    mutationFn: async () => {
      if (!editingWorkflowId) throw new Error("Save or load a workflow before running a test.");
      const metadata = parseJsonObject<Record<string, unknown>>(testMetadataJson, "test metadata override");
      const hasMetadataOverride = Object.keys(metadata).length > 0;

      return workflowApi.testWorkflow(editingWorkflowId, {
        ...(hasMetadataOverride ? { metadata } : {}),
        ...(testResourceId.trim() ? { resource_id: testResourceId.trim() } : {}),
        trigger_key: selectedTestTrigger?.trigger_key,
      });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : String(error));
    },
    onSuccess: (run) => {
      setSelectedWorkflowId(run.workflow_id);
      setSelectedRunId(run.id);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.run(run.id) });
    },
  });

  function handleWorkflowEnabledChange(enabled: boolean) {
    setForm((current) => ({ ...current, enabled }));
    setFormError(null);

    if (editingWorkflowId) {
      setEnabledMutation.mutate({
        enabled,
        workflowId: editingWorkflowId,
      });
    }
  }

  const workflowColumns: Array<DataTableColumn<Workflow>> = [
    {
      key: "name",
      header: "Workflow",
      render: (workflow) => (
        <div className="grid gap-1 min-w-0">
          <span className="font-semibold">{workflow.name}</span>
          <span className="text-ink-subtle text-xs">{shortId(workflow.id)}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 120,
      render: (workflow) => (
        <Badge tone={workflow.enabled ? "green" : "neutral"}>
          {workflow.enabled ? "enabled" : "disabled"}
        </Badge>
      ),
    },
    {
      key: "graph",
      header: "Graph",
      render: (workflow) => (
        <span>{workflow.triggers.length} triggers · {workflow.actions.length} actions</span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      width: 170,
      render: (workflow) => formatDateTime(workflow.updated_at),
    },
    {
      key: "controls",
      header: "",
      width: 300,
      render: (workflow) => (
        <div className="flex items-center justify-end gap-2">
          {isManagedIntegrationWorkflow(workflow) ? (
            <Badge tone="blue">Managed</Badge>
          ) : (
            <>
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  requestSelection(workflow);
                }}
                size="sm"
                variant="ghost"
              >
                <Pencil size={14} />
                Edit
              </Button>
              <Button
                isLoading={toggleMutation.isPending}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleMutation.mutate(workflow);
                }}
                size="sm"
                variant={workflow.enabled ? "danger" : "secondary"}
              >
                <Power size={14} />
                {workflow.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                aria-label={`Delete ${workflow.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingDelete(workflow);
                }}
                size="sm"
                variant="danger"
              >
                <Trash2 size={14} />
                Delete
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  function loadWorkflowIntoForm(workflow: Workflow) {
    const triggers = workflow.triggers.map((trigger) => ({
      trigger_key: trigger.trigger_key,
      event_action: trigger.event_action,
      resource_type: trigger.resource_type,
      filters: trigger.filters,
      entry_action_key: trigger.entry_action_key,
    }));
    const actions = workflow.actions.map((action) => ({
      action_key: action.action_key,
      type: action.type,
      config: action.config,
      next_action_key: action.next_action_key,
      failure_action_key: action.failure_action_key,
    }));
    const graphMetadata = parseGraphMetadata(workflow.graph_metadata);

    setEditingWorkflowId(workflow.id);
    setSelectedWorkflowId(workflow.id);
    setSelectedWorkflowName(workflow.name);
    setSelectedRunId(null);
    setRunPages([]);
    setEditorMode("builder");
    const nextForm: WorkflowFormState = {
      actions,
      actionsJson: stringifyJson(actions),
      description: workflow.description ?? "",
      enabled: workflow.enabled,
      graphMetadata,
      graphMetadataJson: stringifyJson(graphMetadata),
      name: workflow.name,
      runAsUserId: workflow.run_as_user_id,
      triggers,
      triggersJson: stringifyJson(triggers),
    };
    setForm(nextForm);
    setSavedForm(nextForm);
    setFormError(null);
    setSelectedNode(triggers[0]?.trigger_key ? { kind: "trigger", key: triggers[0].trigger_key } : null);
    setTestTriggerKey(triggers[0]?.trigger_key ?? "");
    setTestResourceId("");
    setTestMetadataJson("{}");
  }

  function resetForm() {
    const initial = createInitialForm(userId ?? membersQuery.data?.[0]?.user_id);

    setEditingWorkflowId(null);
    setEditorMode("builder");
    setForm(initial);
    setSavedForm(initial);
    setFormError(null);
    setSelectedNode({ kind: "trigger", key: "trigger_1" });
    setSelectedRunId(null);
    setRunPages([]);
    setTestTriggerKey("trigger_1");
    setTestResourceId("");
    setTestMetadataJson("{}");
  }

  function requestSelection(next: Workflow | "new") {
    if (hasUnsavedChanges) {
      setPendingSelection(next);
      return;
    }
    if (next === "new") resetForm();
    else loadWorkflowIntoForm(next);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    saveMutation.mutate();
  }

  function handleEditorModeChange(nextMode: EditorMode) {
    if (nextMode === editorMode) return;

    if (nextMode === "json") {
      setForm((current) => ({
        ...current,
        actionsJson: stringifyJson(current.actions),
        graphMetadataJson: stringifyJson(current.graphMetadata),
        triggersJson: stringifyJson(current.triggers),
      }));
      setEditorMode("json");
      setFormError(null);
      return;
    }

    try {
      const triggers = parseJsonArray<WorkflowTriggerInput>(form.triggersJson, "triggers");
      const actions = parseJsonArray<WorkflowActionInput>(form.actionsJson, "actions");
      const graphMetadata = parseJsonObject<GraphMetadata>(form.graphMetadataJson, "graph metadata");
      setForm((current) => ({
        ...current,
        actions,
        graphMetadata,
        triggers,
      }));
      setEditorMode("builder");
      setSelectedNode(triggers[0]?.trigger_key ? { kind: "trigger", key: triggers[0].trigger_key } : null);
      setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  function validateCurrentForm() {
    try {
      const { actions, triggers } = resolveFormPayload(form, editorMode);
      const errors = validateWorkflowGraph(triggers, actions);
      setFormError(errors[0] ?? "Workflow graph is valid.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  if (projectsQuery.isLoading) {
    return (
      <LocalizedText>
        <section className="grid gap-4">
          <LoadingState message="Checking workflow access..." />
        </section>
      </LocalizedText>
    );
  }

  if (!projectId || !currentProject) {
    return (
      <LocalizedText>
        <section className="grid gap-4">
          <ErrorState
            action={<Link className="text-ink-muted text-[13px] font-[650] no-underline hover:text-ink" to="/projects">Choose project</Link>}
            error="Select a project before creating workflow automation."
            title="Project required"
          />
        </section>
      </LocalizedText>
    );
  }

  if (!canManageWorkflows) {
    return (
      <LocalizedText>
        <section className="grid gap-4">
          <ErrorState
            action={<Link className="text-ink-muted text-[13px] font-[650] no-underline hover:text-ink" to="/incidents">Back to incidents</Link>}
            error="Project management permission is required to create and run workflow automation."
            title="Project management access required"
          />
        </section>
      </LocalizedText>
    );
  }

  return (
    <LocalizedText>
      <section className="grid gap-4">
        <PageHeader
          action={<Button onClick={() => requestSelection("new")} variant="primary">New workflow</Button>}
          description="Build project automation by connecting trigger and action nodes on a canvas."
          help="Workflows automate repeatable operational actions from an event. Start with a trigger, add steps, validate the graph, then save and test it before enabling live processing."
          title="Workflows"
        />

        {workerReadinessQuery.data && !workerReadinessQuery.data.ready ? (
          <ErrorState
            error={`Workflow runs will not start until the worker is running. Stale workers: ${workerReadinessQuery.data.stale_workers.join(", ") || "workflow"}.`}
            title="Workflow worker not ready"
          />
        ) : null}
        {workerReadinessQuery.error ? (
          <ErrorState error={workerReadinessQuery.error} onRetry={() => void workerReadinessQuery.refetch()} title="Could not load workflow worker status" />
        ) : null}

        <div className="grid gap-4">
          <Panel className="grid gap-4" as="form" onSubmit={handleSubmit}>
            <WorkflowHeader
              editingWorkflowId={editingWorkflowId}
              form={form}
              isTogglingEnabled={setEnabledMutation.isPending}
              onEnabledChange={handleWorkflowEnabledChange}
              setForm={setForm}
            />

            <div className="flex items-center gap-1 border-b border-hairline-soft pb-2" role="tablist">
              <TabButton active={editorMode === "builder"} id="workflow-tab-canvas" label="Canvas" onClick={() => handleEditorModeChange("builder")} panelId="workflow-panel-canvas" />
              <TabButton active={editorMode === "json"} id="workflow-tab-json" label="Advanced JSON" onClick={() => handleEditorModeChange("json")} panelId="workflow-panel-json" />
            </div>

            {editorMode === "builder" ? (
              <div aria-labelledby="workflow-tab-canvas" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]" id="workflow-panel-canvas" role="tabpanel">
                <WorkflowCanvas
                  catalog={triggersQuery.data?.items ?? []}
                  form={form}
                  selectedNode={selectedNode}
                  selectedRun={selectedRun}
                  setForm={setForm}
                  setFormError={setFormError}
                  setSelectedNode={setSelectedNode}
                  validateCurrentForm={validateCurrentForm}
                />
                <div className="lg:sticky lg:top-4">
                  <NodeInspector
                    catalog={triggersQuery.data?.items ?? []}
                    form={form}
                    selectedNode={selectedNode}
                    resourceOptions={resourceOptions}
                    setForm={setForm}
                    setSelectedNode={setSelectedNode}
                  />
                </div>
              </div>
            ) : (
              <div aria-labelledby="workflow-tab-json" id="workflow-panel-json" role="tabpanel">
                <AdvancedJsonEditor form={form} handleEditorModeChange={handleEditorModeChange} setForm={setForm} />
              </div>
            )}

            {formError || saveMutation.error || setEnabledMutation.error || testRunMutation.error ? (
              <ErrorState error={formError ?? saveMutation.error ?? setEnabledMutation.error ?? testRunMutation.error} title="Workflow message" />
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => requestSelection("new")} variant="ghost">Cancel</Button>
              <Button isLoading={saveMutation.isPending} type="submit" variant="primary">
                {editingWorkflowId ? (
                  <>
                    <CheckCircle2 size={15} />
                    Save workflow
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    Create workflow
                  </>
                )}
              </Button>
            </div>
          </Panel>

          <div className="grid items-start gap-4 min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel className="grid gap-3 self-start">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-ink text-[16px] font-semibold leading-tight m-0">Saved workflows</h2>
                  <p className="text-ink-muted text-[13px] leading-[1.45] m-0 mt-1">
                    Click a row to load it into the editor, or use the buttons to change status.
                  </p>
                </div>
                {workflowsQuery.isFetching ? <RefreshingIndicator /> : null}
              </div>

                {workflowsQuery.isLoading ? <TablePageSkeleton label="Loading workflows" /> : null}
                {workflowsQuery.error ? <ErrorState error={workflowsQuery.error} onRetry={() => void workflowsQuery.refetch()} title="Could not load workflows" /> : null}
              {!workflowsQuery.isLoading && !workflowsQuery.error ? (
                <DataTable
                  columns={workflowColumns}
                  emptyState={(
                    <EmptyState
                      action={<Button onClick={() => requestSelection("new")} size="sm" variant="secondary">Create workflow</Button>}
                      message="No workflows have been created for this project. Create one to automate repeatable incident response tasks."
                      title="No workflows"
                    />
                  )}
                  getRowKey={(workflow) => workflow.id}
                  onRowClick={(workflow) => {
                    if (!isManagedIntegrationWorkflow(workflow)) requestSelection(workflow);
                  }}
                  rows={workflows}
                />
              ) : null}
              {!workflowsQuery.error ? (
                <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                  <Button disabled={!workflowPages.length || workflowsQuery.isFetching} onClick={() => setWorkflowPages((pages) => pages.slice(0, -1))} size="sm" variant="ghost">Previous</Button>
                  <span>Page {workflowPages.length + 1}</span>
                  <Button disabled={!workflowsQuery.data?.next_cursor || workflowsQuery.isFetching} onClick={() => setWorkflowPages((pages) => [...pages, workflowsQuery.data!.next_cursor!])} size="sm" variant="ghost">Next</Button>
                </div>
              ) : null}
              {toggleMutation.error ? <ErrorState error={toggleMutation.error} title="Could not update workflow status" /> : null}
            </Panel>

            <Panel className="grid gap-3 self-start">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-ink text-[16px] font-semibold leading-tight m-0">Run history</h2>
                  <p className="text-ink-muted text-[13px] leading-[1.45] m-0 mt-1">
                    {selectedWorkflow?.name ?? selectedWorkflowName ?? "Select a workflow to view recent runs."}
                  </p>
                </div>
                {selectedRun ? <Badge tone="blue">overlay active</Badge> : null}
              </div>

              {selectedWorkflowId ? (
                <div className="grid gap-2 rounded-md border border-hairline-soft p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="m-0 text-ink text-[13px] font-[800] leading-tight">Test workflow</h3>
                      <p className="m-0 mt-1 text-ink-muted text-[12px] leading-[1.4]">
                        Run this workflow as if the selected resource fired the selected trigger.
                      </p>
                    </div>
                    <Button
                      disabled={!editingWorkflowId}
                      isLoading={testRunMutation.isPending}
                      onClick={() => testRunMutation.mutate()}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Play size={14} />
                      Run test
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    <TestWorkflowField label="Trigger">
                      <Select
                        onChange={(event) => {
                          setTestTriggerKey(event.target.value);
                          setTestResourceId("");
                        }}
                        value={selectedTestTrigger?.trigger_key ?? ""}
                      >
                        {form.triggers.map((trigger) => (
                          <option key={trigger.trigger_key ?? trigger.event_action} value={trigger.trigger_key ?? ""}>
                            {(trigger.trigger_key ?? "trigger")} · {trigger.event_action}
                          </option>
                        ))}
                      </Select>
                    </TestWorkflowField>
                    <TestWorkflowField
                      hint={testResourceHint(selectedTestResourceType)}
                      label={testResourceLabel(selectedTestResourceType)}
                    >
                      {testResourceOptions.length > 0 ? (
                        <Select
                          onChange={(event) => setTestResourceId(event.target.value)}
                          value={testResourceId}
                        >
                          <option value="">Use default synthetic {selectedTestResourceType}</option>
                          {testResourceOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </Select>
                      ) : (
                        <TextInput
                          onChange={(event) => setTestResourceId(event.target.value)}
                          placeholder={`${selectedTestResourceType} UUID`}
                          value={testResourceId}
                        />
                      )}
                    </TestWorkflowField>
                  </div>
                  <details className="rounded-md border border-hairline-soft p-3">
                    <summary className="cursor-pointer text-ink-muted text-[12px] font-[750] uppercase">
                      Advanced metadata override
                    </summary>
                    <TextArea
                      className="font-mono text-[12px] min-h-24 mt-3"
                      onChange={(event) => setTestMetadataJson(event.target.value)}
                      spellCheck={false}
                      value={testMetadataJson}
                    />
                  </details>
                </div>
              ) : null}

              {!selectedWorkflowId ? (
                <EmptyState message="Workflow runs appear here after matching events are processed by the worker." />
              ) : runsQuery.isLoading ? (
                <TablePageSkeleton label="Loading workflow runs" />
              ) : runsQuery.error ? (
                <ErrorState error={runsQuery.error} onRetry={() => void runsQuery.refetch()} title="Could not load workflow runs" />
              ) : (
                <DataTable
                  columns={runColumns}
                  emptyState={<EmptyState message="No runs yet. Trigger events will create runs when the workflow is enabled." />}
                  getRowKey={(run) => run.id}
                  onRowClick={(run) => setSelectedRunId(run.id === selectedRunId ? null : run.id)}
                  rows={runs}
                  tableMinWidth="100%"
                />
              )}
              {selectedWorkflowId && !runsQuery.error ? (
                <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                  <Button disabled={!runPages.length || runsQuery.isFetching} onClick={() => setRunPages((pages) => pages.slice(0, -1))} size="sm" variant="ghost">Previous</Button>
                  <span>Page {runPages.length + 1}</span>
                  <Button disabled={!runsQuery.data?.next_cursor || runsQuery.isFetching} onClick={() => setRunPages((pages) => [...pages, runsQuery.data!.next_cursor!])} size="sm" variant="ghost">Next</Button>
                </div>
              ) : null}
              {selectedRunQuery.isLoading ? <LoadingState message="Loading run detail..." /> : null}
              {selectedRunQuery.error ? <ErrorState error={selectedRunQuery.error} onRetry={() => void selectedRunQuery.refetch()} title="Could not load run detail" /> : null}
              {selectedRun ? <WorkflowRunDetail actions={form.actions} run={selectedRun} /> : null}
            </Panel>
          </div>
        </div>
        <Dialog
          confirmLabel="Delete workflow"
          description={pendingDelete
            ? `Delete "${pendingDelete.name}"? Its run history and action results will also be permanently deleted.`
            : undefined}
          isConfirming={deleteMutation.isPending}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
          }}
          open={pendingDelete !== null}
          title="Delete workflow?"
          tone="danger"
        />
        <Dialog
          confirmLabel="Discard changes"
          description="Your unsaved workflow changes will be lost."
          onClose={() => setPendingSelection(null)}
          onConfirm={() => {
            if (pendingSelection === "new") resetForm();
            else if (pendingSelection) loadWorkflowIntoForm(pendingSelection);
            setPendingSelection(null);
          }}
          open={pendingSelection !== null}
          title="Discard unsaved changes?"
          tone="danger"
        />
      </section>
    </LocalizedText>
  );
}

function isManagedIntegrationWorkflow(workflow: Workflow) {
  return workflow.graph_metadata?.managed_kind === "webhook_integration_incident_created";
}

function WorkflowHeader({
  editingWorkflowId,
  form,
  isTogglingEnabled,
  onEnabledChange,
  setForm,
}: {
  editingWorkflowId: string | null;
  form: WorkflowFormState;
  isTogglingEnabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  setForm: Dispatch<SetStateAction<WorkflowFormState>>;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-ink text-[17px] font-semibold leading-tight m-0">
            {editingWorkflowId ? "Edit workflow" : "Create workflow"}
          </h2>
          <p className="text-ink-muted text-[13px] leading-[1.45] m-0 mt-1">
            Connect trigger nodes to action nodes. Each action can branch on success or failure.
          </p>
        </div>
        {editingWorkflowId ? <Badge tone="blue">editing</Badge> : <Badge>new</Badge>}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.5fr)]">
        <Field label="Name" required>
          <TextInput
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Escalate P1 incidents to webhook"
            value={form.name}
          />
        </Field>
        <Field label="Description">
          <TextInput
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Optional operational note"
            value={form.description}
          />
        </Field>
        <CheckboxField
          checked={form.enabled}
          description={editingWorkflowId
            ? "This saved workflow starts or stops processing new events immediately."
            : "The workflow will start processing new events after it is created."}
          disabled={isTogglingEnabled}
          label="Enabled"
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
      </div>
    </>
  );
}

function TestWorkflowField({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-2 rounded-md border border-hairline-soft bg-surface-1/35 p-3">
      <span className="text-ink-muted text-[12px] font-[800] uppercase tracking-[0.04em]">
        {label}
      </span>
      <div className="min-w-0">
        {children}
      </div>
      {hint ? <span className="text-ink-subtle text-[12px] leading-[1.35]">{hint}</span> : null}
    </label>
  );
}

function WorkflowCanvas({
  catalog,
  form,
  selectedNode,
  selectedRun,
  setForm,
  setFormError,
  setSelectedNode,
  validateCurrentForm,
}: {
  catalog: WorkflowTriggerCatalogItem[];
  form: WorkflowFormState;
  selectedNode: SelectedNode;
  selectedRun: WorkflowRun | null;
  setForm: Dispatch<SetStateAction<WorkflowFormState>>;
  setFormError: Dispatch<SetStateAction<string | null>>;
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>;
  validateCurrentForm: () => void;
}) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner
        catalog={catalog}
        form={form}
        selectedNode={selectedNode}
        selectedRun={selectedRun}
        setForm={setForm}
        setFormError={setFormError}
        setSelectedNode={setSelectedNode}
        validateCurrentForm={validateCurrentForm}
      />
    </ReactFlowProvider>
  );
}

function WorkflowCanvasInner({
  catalog,
  form,
  selectedNode,
  selectedRun,
  setForm,
  setFormError,
  setSelectedNode,
  validateCurrentForm,
}: {
  catalog: WorkflowTriggerCatalogItem[];
  form: WorkflowFormState;
  selectedNode: SelectedNode;
  selectedRun: WorkflowRun | null;
  setForm: Dispatch<SetStateAction<WorkflowFormState>>;
  setFormError: Dispatch<SetStateAction<string | null>>;
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>;
  validateCurrentForm: () => void;
}) {
  const { fitView } = useReactFlow();
  const [isActionPickerOpen, setIsActionPickerOpen] = useState(false);
  const [actionPickerGroup, setActionPickerGroup] = useState<Exclude<WorkflowNodeGroup, "Start">>(actionPaletteGroups[0]?.label ?? "Logic");
  const [actionPickerSearch, setActionPickerSearch] = useState("");
  const runOverlay = useMemo(() => createRunOverlay(form.triggers, form.actions, selectedRun), [form.actions, form.triggers, selectedRun]);
  const baseNodes = useMemo(() => buildWorkflowNodes(form, selectedNode, runOverlay.actionStatusByKey), [form, runOverlay.actionStatusByKey, selectedNode]);
  const [nodes, setNodes, onCanvasNodesChange] = useNodesState<WorkflowNode>(baseNodes);
  const edges = useMemo(() => buildWorkflowEdges(form, runOverlay.edgeIds), [form, runOverlay.edgeIds]);
  const connectionCount = edges.length;

  useEffect(() => {
    setNodes(baseNodes);
  }, [baseNodes, setNodes]);

  return (
    <section className="grid gap-3 rounded-md border border-hairline-soft bg-surface-2/35 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex flex-wrap items-center gap-2">
          <Button
            onClick={() => addTrigger(catalog, form, setForm, setSelectedNode)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Plus size={14} />
            Add trigger
          </Button>
          <Button
            aria-expanded={isActionPickerOpen}
            aria-haspopup="dialog"
            onClick={() => setIsActionPickerOpen((current) => !current)}
            size="sm"
            type="button"
            variant="primary"
          >
            <Plus size={14} />
            Add step
            <ChevronDown className={cn("transition-transform duration-120 ease", isActionPickerOpen ? "rotate-180" : "")} size={14} />
          </Button>
          {isActionPickerOpen ? (
            <WorkflowActionPicker
              activeGroup={actionPickerGroup}
              onActiveGroupChange={setActionPickerGroup}
              onClose={() => setIsActionPickerOpen(false)}
              onSearchChange={setActionPickerSearch}
              onSelect={(type) => {
                addAction(type, form, selectedNode, setForm, setSelectedNode);
                setIsActionPickerOpen(false);
                setActionPickerSearch("");
              }}
              search={actionPickerSearch}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">{nodes.length} nodes · {connectionCount} connections</Badge>
          <Button onClick={() => { autoLayout(setForm); requestAnimationFrame(() => void fitView({ padding: 0.18, duration: 250 })); }} size="sm" type="button" variant="ghost">
            <GitBranch size={14} />
            Auto layout
          </Button>
          <Button onClick={() => void fitView({ padding: 0.18, duration: 250 })} size="sm" type="button" variant="ghost">
            <LocateFixed size={14} />
            Fit view
          </Button>
          <Button onClick={validateCurrentForm} size="sm" type="button" variant="ghost">
            <CheckCircle2 size={14} />
            Validate
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-hairline-soft bg-surface-1/40 px-3 py-2 text-[12px] text-ink-muted">
        <span>Drag from a port to connect steps.</span>
        <span>Select a node to edit it in the inspector.</span>
        <span>Use success and failure ports for branching.</span>
      </div>

      <div className="workflow-canvas h-[560px] min-w-0 overflow-hidden rounded-lg border border-hairline bg-[#070b12]">
        <ReactFlow
          colorMode="dark"
          connectionLineStyle={{ stroke: "#0099ff", strokeWidth: 2.5 }}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionRadius={28}
          deleteKeyCode={["Backspace", "Delete"]}
          edges={edges}
          fitView
          maxZoom={1.4}
          minZoom={0.35}
          nodes={nodes}
          isValidConnection={(connection) => isValidWorkflowConnection(connection)}
          nodeTypes={workflowNodeTypes}
          onConnectStart={() => setFormError("Drop the connection on an action input to create a step.")}
          onConnect={(connection) => connectWorkflowNodes(connection, setForm, setFormError)}
          onEdgesDelete={(deletedEdges) => deleteWorkflowEdges(deletedEdges, setForm)}
          onMoveEnd={(_, viewport) => setForm((current) => ({ ...current, graphMetadata: updateViewport(current.graphMetadata, viewport) }))}
          onNodeClick={(_, node) => setSelectedNode(nodeToSelectedNode(node.id))}
          onNodesChange={onCanvasNodesChange}
          onNodeDragStop={(_, node) => {
            setForm((current) => ({
                ...current,
                graphMetadata: updateNodePosition(current.graphMetadata, node.id, node.position),
            }));
          }}
          onNodesDelete={(deletedNodes) => deleteWorkflowNodes(deletedNodes, setForm, selectedNode, setSelectedNode)}
          onPaneClick={() => setSelectedNode(null)}
          proOptions={{ hideAttribution: true }}
          {...(form.graphMetadata.viewport ? { defaultViewport: form.graphMetadata.viewport } : {})}
        >
          <Background color="rgba(148,163,184,0.28)" gap={18} />
          <Controls showInteractive={false} />
          <MiniMap
            maskColor="rgba(5,10,18,0.66)"
            nodeColor={(node) => workflowGroupColor((node.data as Partial<WorkflowNodeData>).group)}
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
    </section>
  );
}

function WorkflowActionPicker({
  activeGroup,
  onActiveGroupChange,
  onClose,
  onSearchChange,
  onSelect,
  search,
}: {
  activeGroup: Exclude<WorkflowNodeGroup, "Start">;
  onActiveGroupChange: (group: Exclude<WorkflowNodeGroup, "Start">) => void;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (type: WorkflowActionInput["type"]) => void;
  search: string;
}) {
  const selectedGroup = actionPaletteGroups.find((group) => group.label === activeGroup) ?? actionPaletteGroups[0];
  const searchValue = search.trim().toLowerCase();
  const visibleActions = (selectedGroup?.actions ?? []).filter((action) => {
    if (!searchValue) return true;

    return `${action.label} ${action.description} ${action.type}`.toLowerCase().includes(searchValue);
  });

  return (
    <div aria-label="Add workflow step" className="workflow-action-picker" role="dialog">
      <div className="flex items-start justify-between gap-4 border-b border-hairline-soft pb-3">
        <div className="min-w-0">
          <h3 className="m-0 text-ink text-[15px] font-semibold leading-tight">Add workflow step</h3>
          <p className="m-0 mt-1 text-ink-muted text-[12px] leading-[1.4]">
            Choose what this workflow should do next. Configure the details in the inspector after adding it.
          </p>
        </div>
        <button aria-label="Close action picker" className="workflow-action-picker-close" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>

      <div className="grid min-h-0 gap-3 md:grid-cols-[190px_minmax(0,1fr)]">
        <div className="workflow-action-picker-tabs" role="tablist">
          {actionPaletteGroups.map((group) => (
            <button
              className={cn(
                "workflow-action-picker-tab",
                group.label === selectedGroup?.label ? "is-active" : "",
              )}
              key={group.label}
              onClick={() => onActiveGroupChange(group.label)}
              role="tab"
              type="button"
            >
              <span>{workflowPickerGroupLabel(group.label)}</span>
              <span>{group.actions.length}</span>
            </button>
          ))}
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <label className="workflow-action-picker-search">
            <Search size={15} />
            <input
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={`Search ${selectedGroup ? workflowPickerGroupLabel(selectedGroup.label).toLowerCase() : "steps"}`}
              value={search}
            />
          </label>
          <div>
            <span className="block text-ink text-[13px] font-[750] leading-tight">
              {selectedGroup ? workflowPickerGroupLabel(selectedGroup.label) : "Steps"}
            </span>
            <span className="mt-1 block text-ink-muted text-[12px] leading-[1.35]">
              {selectedGroup ? workflowPickerGroupDescription(selectedGroup) : ""}
            </span>
          </div>
          <div className="workflow-action-picker-grid">
            {visibleActions.map((item) => (
              <button
                className={cn("workflow-action-picker-card", workflowGroupClassName(workflowGroupLabel(item.group)))}
                key={item.type}
                onClick={() => onSelect(item.type)}
                type="button"
              >
                <span className="workflow-action-picker-card-title">{item.label}</span>
                <span className="workflow-action-picker-card-description">{item.description}</span>
                {item.dangerous ? <span className="workflow-action-picker-card-danger">Dangerous</span> : null}
              </button>
            ))}
            {visibleActions.length === 0 ? (
              <div className="rounded-md border border-hairline-soft p-4 text-ink-muted text-[13px]">
                No matching steps in this category.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowCanvasNode(props: NodeProps) {
  const data = props.data as WorkflowNodeData;
  const statusTone = data.status === "succeeded"
    ? "green"
    : data.status === "failed"
      ? "red"
      : data.status === "running"
        ? "blue"
        : "neutral";

  return (
    <div
      className={cn(
        "workflow-canvas-node relative grid min-h-28 w-[17rem] gap-2.5 rounded-lg border p-3 text-left",
        props.selected ? "is-selected" : "",
        data.kind === "trigger" ? "is-trigger" : "is-action",
        workflowGroupClassName(data.group),
      )}
    >
      {data.kind === "action" ? <Handle className="workflow-node-handle workflow-node-target !bg-ink-subtle" position={Position.Left} type="target" /> : null}
      {data.kind === "trigger" ? (
        <Handle className="workflow-node-handle workflow-node-source !bg-accent-blue" id="entry" position={Position.Right} type="source" />
      ) : (
        <>
          <Handle className="workflow-node-handle workflow-node-source !top-[38%] !bg-success" id="success" position={Position.Right} type="source" />
          <Handle className="workflow-node-handle workflow-node-source !top-[72%] !bg-danger" id="failure" position={Position.Right} type="source" />
        </>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1 min-w-0">
          <span className="workflow-node-group">{workflowNodeGroupDisplayName(data.group)}</span>
          <span className="text-ink text-sm font-[750] leading-tight truncate">{data.title}</span>
          <span className="text-ink-muted text-xs leading-[1.35] line-clamp-2">{data.detail}</span>
        </div>
        <div className="grid justify-items-end gap-1 shrink-0">
          {data.status ? <Badge tone={statusTone}>{data.status}</Badge> : null}
        </div>
      </div>
      {data.kind === "action" ? (
        <div className="grid grid-cols-2 gap-2 border-t border-hairline-soft pt-2 text-[11px] font-[750] leading-none uppercase">
          <span className="workflow-node-port is-success">success</span>
          <span className="workflow-node-port is-failure">failure</span>
        </div>
      ) : null}
      <span className="workflow-node-id">{data.meta}</span>
    </div>
  );
}

function NodeInspector({
  catalog,
  form,
  resourceOptions,
  selectedNode,
  setForm,
  setSelectedNode,
}: {
  catalog: WorkflowTriggerCatalogItem[];
  form: WorkflowFormState;
  resourceOptions: ResourceOptions;
  selectedNode: SelectedNode;
  setForm: Dispatch<SetStateAction<WorkflowFormState>>;
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>;
}) {
  if (!selectedNode) {
    return (
      <Panel className="grid gap-2" padding="sm" tone="subtle">
        <h3 className="m-0 text-ink text-[15px] font-semibold leading-tight">Inspector</h3>
        <p className="m-0 text-ink-muted text-[13px] leading-[1.45]">Select a node in the canvas.</p>
      </Panel>
    );
  }

  if (selectedNode.kind === "trigger") {
    const triggerIndex = form.triggers.findIndex((trigger) => trigger.trigger_key === selectedNode.key);
    const trigger = form.triggers[triggerIndex];

    if (!trigger || triggerIndex < 0) return null;

    return (
      <Panel className="grid gap-3" padding="sm" tone="subtle">
        <InspectorHeader eyebrow="Trigger" title={trigger.event_action} />
        <Field hint="Pick the event that starts this workflow." label="Event" required>
          <Select
            onChange={(event) => {
              const item = catalog.find((entry) => entry.action === event.target.value);
              updateTrigger(triggerIndex, setForm, (current) => ({
                ...current,
                event_action: event.target.value,
                resource_type: item?.resource_type ?? current.resource_type,
              }));
            }}
            value={trigger.event_action}
          >
            {ensureCatalogOption(catalog, trigger).map((item) => (
              <option key={item.action} value={item.action}>{item.label}</option>
            ))}
          </Select>
        </Field>
        <NodeDeleteButton onDelete={() => removeTrigger(triggerIndex, setForm, selectedNode, setSelectedNode)} />
      </Panel>
    );
  }

  const actionIndex = form.actions.findIndex((action, index) => (action.action_key ?? `action_${index + 1}`) === selectedNode.key);
  const action = form.actions[actionIndex];

  if (!action || actionIndex < 0) return null;

  const actionKey = action.action_key ?? `action_${actionIndex + 1}`;
  const catalogItem = workflowActionCatalogItem(action.type);
  const actionDisplayName = workflowActionDisplayName(action);

  return (
    <Panel className="grid gap-3" padding="sm" tone="subtle">
      <InspectorHeader eyebrow={workflowActionGroup(action.type)} title={actionDisplayName} />
      <p className="m-0 text-ink-muted text-[13px] leading-[1.45]">{catalogItem.description}</p>
      {catalogItem.dangerous ? <Badge tone="red">Dangerous action</Badge> : null}
      <div className="grid gap-3">
        <Field hint="Used in the canvas and when another step reads this step's output." label="Step name">
          <TextInput
            onChange={(event) => updateActionDisplayName(actionIndex, setForm, event.target.value)}
            placeholder={catalogItem.label}
            value={actionDisplayName}
          />
        </Field>
        <Field label="Step action" required>
          <Select
            onChange={(event) => updateAction(actionIndex, setForm, (current) =>
              presetAction(
                event.target.value as WorkflowActionInput["type"],
                current.action_key ?? actionKey,
                current.next_action_key ?? null,
                current.failure_action_key ?? null,
              ),
            )}
            value={action.type}
          >
            {actionPaletteGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.actions.map((actionItem) => (
                  <option key={actionItem.type} value={actionItem.type}>{actionItem.label}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>
      <ActionConfigFields
        action={action}
        actionIndex={actionIndex}
        catalogItem={catalogItem}
        form={form}
        resourceOptions={resourceOptions}
        setForm={setForm}
      />
      <details className="grid gap-3 rounded-md border border-hairline-soft p-3">
        <summary className="cursor-pointer text-ink-muted text-[12px] font-[750] uppercase">Advanced</summary>
        <div className="grid gap-3 pt-3">
          <AdvancedKeyField
            label="Action key"
            onChange={(value) => renameActionKey(actionIndex, setForm, setSelectedNode, value)}
            value={actionKey}
          />
          <Field label="Raw config JSON">
            <TextArea
              className="font-mono text-[12px] min-h-32"
              onChange={(event) => updateActionRawConfig(actionIndex, setForm, event.target.value)}
              spellCheck={false}
              value={stringifyJson(action.config)}
            />
          </Field>
        </div>
      </details>
      <NodeDeleteButton onDelete={() => removeAction(actionIndex, setForm, selectedNode, setSelectedNode)} />
    </Panel>
  );
}

function AdvancedJsonEditor({
  form,
  handleEditorModeChange,
  setForm,
}: {
  form: WorkflowFormState;
  handleEditorModeChange: (mode: EditorMode) => void;
  setForm: Dispatch<SetStateAction<WorkflowFormState>>;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-ink-muted text-[13px]">
          <Braces size={15} />
          <span>Directly edit the payload saved to the workflow API.</span>
        </div>
        <Button onClick={() => handleEditorModeChange("builder")} size="sm" type="button" variant="ghost">Apply JSON to canvas</Button>
      </div>
      <Field hint="Array of trigger objects. Multiple triggers can enter different actions." label="Triggers JSON" required>
        <TextArea
          className="font-mono text-[12px] min-h-44"
          onChange={(event) => setForm((current) => ({ ...current, triggersJson: event.target.value }))}
          spellCheck={false}
          value={form.triggersJson}
        />
      </Field>
      <Field hint="Array of action objects. Success and failure edges use action keys." label="Actions JSON" required>
        <TextArea
          className="font-mono text-[12px] min-h-56"
          onChange={(event) => setForm((current) => ({ ...current, actionsJson: event.target.value }))}
          spellCheck={false}
          value={form.actionsJson}
        />
      </Field>
      <Field hint="Canvas positions and viewport." label="Graph metadata JSON">
        <TextArea
          className="font-mono text-[12px] min-h-32"
          onChange={(event) => setForm((current) => ({ ...current, graphMetadataJson: event.target.value }))}
          spellCheck={false}
          value={form.graphMetadataJson}
        />
      </Field>
    </div>
  );
}

function ActionConfigFields({
  action,
  actionIndex,
  catalogItem,
  form,
  resourceOptions,
  setForm,
}: {
  action: WorkflowActionInput;
  actionIndex: number;
  catalogItem: WorkflowActionCatalogItem;
  form: WorkflowFormState;
  resourceOptions: ResourceOptions;
  setForm: Dispatch<SetStateAction<WorkflowFormState>>;
}) {
  const targetFields = catalogItem.target_fields;
  const bodyFields = catalogItem.body_fields;
  const isHttpAction = action.type === "http_request" || action.type === "notification_webhook";
  const renderField = (field: WorkflowActionConfigField, section: WorkflowConfigSection) => (
    <WorkflowConfigField
      action={action}
      actionIndex={actionIndex}
      field={field}
      form={form}
      key={`${section}:${field.key}`}
      resourceOptions={resourceOptions}
      section={section}
      setForm={setForm}
    />
  );

  return (
    <div className="grid gap-3">
      {targetFields.length > 0 ? (
        <InspectorSection title="Target">
          {targetFields.map((field) => renderField(field, "target"))}
        </InspectorSection>
      ) : null}
      {isHttpAction ? (
        <HttpActionConfigFields bodyFields={bodyFields} renderField={renderField} />
      ) : bodyFields.length > 0 ? (
        <InspectorSection title={catalogItem.type.endsWith("_create") ? "Create body" : catalogItem.type.endsWith("_update") ? "Fields to update" : "Body"}>
          {bodyFields.map((field) => renderField(field, "body"))}
        </InspectorSection>
      ) : (
        <p className="m-0 text-ink-subtle text-[12px] leading-[1.4]">This step has no body fields.</p>
      )}
    </div>
  );
}

function HttpActionConfigFields({
  bodyFields,
  renderField,
}: {
  bodyFields: WorkflowActionConfigField[];
  renderField: (field: WorkflowActionConfigField, section: WorkflowConfigSection) => ReactNode;
}) {
  const requestFields = bodyFields.filter((field) => field.key === "url" || field.key === "method" || field.key === "timeout_ms");
  const headerFields = bodyFields.filter((field) => field.key === "headers");
  const payloadFields = bodyFields.filter((field) => field.key === "body");

  return (
    <>
      {requestFields.length > 0 ? (
        <InspectorSection title="Request">
          {requestFields.map((field) => renderField(field, "request"))}
        </InspectorSection>
      ) : null}
      {payloadFields.length > 0 ? (
        <InspectorSection title="Request body">
          {payloadFields.map((field) => renderField(field, "root"))}
        </InspectorSection>
      ) : null}
      {headerFields.length > 0 ? (
        <InspectorSection title="Request headers">
          {headerFields.map((field) => renderField(field, "root"))}
        </InspectorSection>
      ) : null}
    </>
  );
}

function InspectorSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="grid gap-3 rounded-md border border-hairline-soft p-3">
      <h4 className="m-0 text-ink text-[13px] font-[750] leading-tight">{title}</h4>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function WorkflowConfigField({
  action,
  actionIndex,
  field,
  form,
  resourceOptions,
  section,
  setForm,
}: {
  action: WorkflowActionInput;
  actionIndex: number;
  field: WorkflowActionConfigField;
  form: WorkflowFormState;
  resourceOptions: ResourceOptions;
  section: WorkflowConfigSection;
  setForm: Dispatch<SetStateAction<WorkflowFormState>>;
}) {
  const value = readActionConfigField(action.config, section, field.key);
  const valueOptions = field.template === false
    ? []
    : buildWorkflowValueOptions(form, actionIndex).filter((option) => isWorkflowValueCompatible(field, option));
  const hint = field.template ? "Use a workflow value or type a fixed value." : undefined;
  const resourceChoices = resourceOptionsForField(field.key, resourceOptions);

  if (action.type === "condition" && section === "body" && field.key === "field") {
    return (
      <WorkflowValueReferenceField
        field={field}
        onChange={(nextValue) => updateActionConfigSection(actionIndex, setForm, section, field.key, nextValue || undefined)}
        options={valueOptions}
        value={stringConfig(value)}
      />
    );
  }

  if (field.kind === "boolean") {
    return (
      <CheckboxField
        checked={Boolean(value)}
        description={hint}
        label={field.label}
        onChange={(event) => updateActionConfigSection(actionIndex, setForm, section, field.key, event.target.checked)}
      />
    );
  }

  if (field.kind === "select" && field.options?.length) {
    return (
      <Field hint={hint} label={field.label} required={field.required}>
        <Select
          onChange={(event) => updateActionConfigSection(actionIndex, setForm, section, field.key, event.target.value || undefined)}
          value={stringConfig(value)}
        >
          <option value="">{field.required ? "Select value" : "No change"}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.kind === "json") {
    return (
      <Field hint={jsonFieldHintForField(field.key)} label={jsonLabelForField(field)} required={field.required}>
        <div className="grid gap-2">
          <div className="rounded-md bg-surface-1 px-3 py-2 text-ink-muted text-[12px]">
            {jsonExampleForField(field.key)}
          </div>
          <TextArea
            className="font-mono text-[12px] min-h-44"
            onChange={(event) => updateActionConfigJsonField(actionIndex, setForm, section, field.key, event.target.value)}
            placeholder={jsonPlaceholderForField(field.key)}
            spellCheck={false}
            value={formatJsonFieldValue(value)}
          />
          <WorkflowValueSelect
            emptyLabel="Pick this value from workflow output"
            onChange={(nextValue) => updateActionConfigSection(actionIndex, setForm, section, field.key, nextValue || undefined)}
            options={valueOptions}
            value={stringConfig(value)}
          />
        </div>
      </Field>
    );
  }

  if (resourceChoices.length > 0) {
    return (
      <div className="grid gap-2">
        <Field hint={hint} label={field.label} required={field.required}>
          <Select
            onChange={(event) => updateActionConfigSection(actionIndex, setForm, section, field.key, event.target.value || undefined)}
            value={stringConfig(value)}
          >
            <option value="">{field.required ? "Select resource or use template below" : "No change"}</option>
            {resourceChoices.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>
        <WorkflowValueSelect
          onChange={(nextValue) => updateActionConfigSection(actionIndex, setForm, section, field.key, nextValue || undefined)}
          options={valueOptions}
          value={stringConfig(value)}
        />
        <TextInput
          onChange={(event) => updateActionConfigSection(actionIndex, setForm, section, field.key, event.target.value || undefined)}
          placeholder={templatePlaceholderForField(field.key)}
          value={stringConfig(value)}
        />
      </div>
    );
  }

  return (
    <Field hint={hint} label={field.label} required={field.required}>
      <div className="grid gap-2">
        {field.kind === "textarea" ? (
          <TextArea
            onChange={(event) => updateActionConfigSection(actionIndex, setForm, section, field.key, event.target.value || undefined)}
            placeholder={templatePlaceholderForField(field.key)}
            value={stringConfig(value)}
          />
        ) : (
          <TextInput
            inputMode={field.kind === "number" ? "numeric" : undefined}
            onChange={(event) => updateActionConfigSection(actionIndex, setForm, section, field.key, parseFieldInputValue(field, event.target.value))}
            placeholder={templatePlaceholderForField(field.key)}
            value={value === undefined || value === null ? "" : String(value)}
          />
        )}
        <WorkflowValueSelect
          onChange={(nextValue) => updateActionConfigSection(actionIndex, setForm, section, field.key, nextValue || undefined)}
          options={valueOptions}
          value={stringConfig(value)}
        />
      </div>
    </Field>
  );
}

function WorkflowValueReferenceField({
  field,
  onChange,
  options,
  value,
}: {
  field: WorkflowActionConfigField;
  onChange: (value: string) => void;
  options: WorkflowValueOption[];
  value: string;
}) {
  return (
    <Field hint="Choose a trigger or previous step output. Use custom only for advanced event metadata paths." label={field.label} required={field.required}>
      <div className="grid gap-2">
        <WorkflowValueSelect
          emptyLabel="Choose value to check"
          onChange={onChange}
          options={options}
          value={value}
        />
        <TextInput
          onChange={(event) => onChange(event.target.value)}
          placeholder="{{event.metadata.priority}}"
          value={value}
        />
        <MetadataPathBuilder onChange={onChange} value={value} />
      </div>
    </Field>
  );
}

function MetadataPathBuilder({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const parsedSegments = metadataSegmentsFromValue(value);
  const segments = parsedSegments.length > 0 ? parsedSegments : ["payload", "incident", "priority"];
  const preview = metadataTemplateFromSegments(segments);

  return (
    <div className="grid gap-2 rounded-md border border-hairline-soft bg-surface-1/45 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-ink text-[12px] font-[800] leading-tight">Event metadata path</span>
          <span className="mt-1 block text-ink-muted text-[12px] leading-[1.35]">
            Build nested metadata without typing dot paths. Numeric levels read arrays.
          </span>
        </div>
        <Button
          onClick={() => onChange(preview)}
          size="sm"
          type="button"
          variant="ghost"
        >
          Use path
        </Button>
      </div>
      <div className="grid gap-2">
        {segments.map((segment, index) => (
          <div className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-2" key={`${index}:${segment}`}>
            <span className="text-ink-subtle text-[11px] font-[750] uppercase">
              {index === 0 ? "metadata" : `level ${index + 1}`}
            </span>
            <TextInput
              onChange={(event) => {
                const nextSegments = [...segments];
                nextSegments[index] = event.target.value;
                onChange(metadataTemplateFromSegments(nextSegments));
              }}
              placeholder={index === 0 ? "payload" : "field or 0"}
              value={segment}
            />
            <Button
              disabled={segments.length <= 1}
              onClick={() => onChange(metadataTemplateFromSegments(segments.filter((_, itemIndex) => itemIndex !== index)))}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          onClick={() => onChange(metadataTemplateFromSegments([...segments, "field"]))}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Plus size={13} />
          Add level
        </Button>
        <code className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-hairline-soft bg-canvas px-2 py-1 text-ink-muted text-[11px]">
          {preview}
        </code>
      </div>
    </div>
  );
}

function WorkflowValueSelect({
  emptyLabel = "Use workflow value",
  onChange,
  options,
  value,
}: {
  emptyLabel?: string;
  onChange: (value: string) => void;
  options: WorkflowValueOption[];
  value: string;
}) {
  if (options.length === 0) return null;

  const groupedOptions = groupWorkflowValueOptions(options);
  const matchesOption = options.some((option) => option.value === value);

  return (
    <Select
      aria-label={emptyLabel}
      onChange={(event) => onChange(event.target.value)}
      value={matchesOption ? value : ""}
    >
      <option value="">{emptyLabel}</option>
      {groupedOptions.map((group) => (
        <optgroup key={group.source} label={group.source}>
          {group.options.map((option) => (
            <option key={`${option.source}:${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

function WorkflowRunStatusBadge({ status }: { status: WorkflowRun["status"] }) {
  if (status === "succeeded") return <Badge tone="green"><CheckCircle2 size={12} /> succeeded</Badge>;
  if (status === "failed") return <Badge tone="red"><XCircle size={12} /> failed</Badge>;
  if (status === "running") return <Badge tone="blue">running</Badge>;
  if (status === "retrying") return <Badge tone="orange">retrying</Badge>;

  return <Badge>{status}</Badge>;
}

function WorkflowActionRunStatusBadge({ status }: { status: WorkflowActionRun["status"] }) {
  if (status === "succeeded") return <Badge tone="green">succeeded</Badge>;
  if (status === "failed") return <Badge tone="red">failed</Badge>;
  if (status === "running") return <Badge tone="blue">running</Badge>;
  if (status === "retrying") return <Badge tone="orange">retrying</Badge>;

  return <Badge>{status}</Badge>;
}

function WorkflowRunDetail({ actions, run }: { actions: WorkflowActionInput[]; run: WorkflowRun }) {
  const actionRuns = run.action_runs ?? [];

  return (
    <div className="grid max-h-[70vh] gap-3 overflow-y-auto rounded-md border border-hairline-soft p-3 pr-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-ink text-[13px] font-[800] leading-tight">Run detail</h3>
          <p className="m-0 mt-1 text-ink-muted text-[12px] leading-[1.4]">
            {run.event?.action ?? "-"} · {run.event?.resource_id ? shortId(run.event.resource_id) : "test event"}
          </p>
        </div>
        <WorkflowRunStatusBadge status={run.status} />
      </div>

      <div className="grid gap-2 text-[12px]">
        <div className="grid gap-1 rounded-md bg-surface-1 p-2">
          <span className="font-[750] text-ink-muted uppercase">Event metadata</span>
          <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-canvas p-2 font-mono text-[11px] text-ink">
            {stringifyJson(run.event?.metadata ?? null)}
          </pre>
        </div>

        {actionRuns.length === 0 ? (
          <EmptyState message="No step logs have been recorded for this run yet." />
        ) : (
          actionRuns.map((actionRun) => {
            const action = actions[actionRun.action_order - 1];
            return (
              <div className="grid gap-2 rounded-md border border-hairline-soft bg-surface-1/45 p-3" key={actionRun.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-[800] text-ink text-[13px] leading-tight">
                      {actionRun.action_order}. {action ? workflowActionDisplayName(action) : actionRun.type}
                    </div>
                    <div className="mt-1 text-ink-muted text-[12px]">
                      {actionRun.started_at ? formatDateTime(actionRun.started_at) : "-"}
                      {actionRun.completed_at ? ` -> ${formatDateTime(actionRun.completed_at)}` : ""}
                    </div>
                  </div>
                  <WorkflowActionRunStatusBadge status={actionRun.status} />
                </div>
                {actionRun.error_message ? (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-red-200 text-[12px]">
                    {actionRun.error_message}
                  </div>
                ) : null}
                <pre className="m-0 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-canvas p-2 font-mono text-[11px] text-ink">
                  {stringifyJson(actionRun.output ?? null)}
                </pre>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function InspectorHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <span className="block text-accent text-xs font-bold leading-none uppercase">{eyebrow}</span>
      <h3 className="m-0 mt-1 text-ink text-[15px] font-semibold leading-tight">{title}</h3>
    </div>
  );
}

function AdvancedKeyField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <Field hint="Advanced identifier used by edges and JSON." label={label}>
      <TextInput onChange={(event) => onChange(event.target.value)} value={value} />
    </Field>
  );
}

function NodeDeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="flex justify-end border-t border-hairline-soft pt-3">
      <Button onClick={onDelete} size="sm" type="button" variant="danger">
        <Trash2 size={14} />
        Delete node
      </Button>
    </div>
  );
}

function createInitialForm(runAsUserId?: string): WorkflowFormState {
  const graphMetadata = defaultGraphMetadata(defaultTriggerInputs, defaultActionInputs);

  return {
    actions: defaultActionInputs,
    actionsJson: stringifyJson(defaultActionInputs),
    description: "",
    enabled: false,
    graphMetadata,
    graphMetadataJson: stringifyJson(graphMetadata),
    name: "",
    runAsUserId: runAsUserId ?? "",
    triggers: defaultTriggerInputs,
    triggersJson: stringifyJson(defaultTriggerInputs),
  };
}

function resolveFormPayload(form: WorkflowFormState, editorMode: EditorMode) {
  if (editorMode === "builder") {
    assertNonEmptyArray(form.triggers, "triggers");
    assertNonEmptyArray(form.actions, "actions");
    return {
      actions: form.actions,
      graphMetadata: form.graphMetadata,
      triggers: form.triggers,
    };
  }

  return {
    actions: parseJsonArray<WorkflowActionInput>(form.actionsJson, "actions"),
    graphMetadata: parseJsonObject<GraphMetadata>(form.graphMetadataJson, "graph metadata"),
    triggers: parseJsonArray<WorkflowTriggerInput>(form.triggersJson, "triggers"),
  };
}

function buildWorkflowNodes(
  form: WorkflowFormState,
  selectedNode: SelectedNode,
  actionStatusByKey: Map<string, WorkflowActionRun["status"]>,
): WorkflowNode[] {
  const metadata = form.graphMetadata.positions ?? {};
  const defaultMetadata = defaultGraphMetadata(form.triggers, form.actions).positions ?? {};

  return [
    ...form.triggers.map((trigger, index): WorkflowNode => {
      const triggerKey = trigger.trigger_key ?? `trigger_${index + 1}`;
      const id = triggerNodeId(triggerKey);

      return {
        id,
        type: "workflowNode",
        position: metadata[id] ?? defaultMetadata[id] ?? { x: 0, y: index * 150 },
        selected: selectedNode?.kind === "trigger" && selectedNode.key === triggerKey,
        data: {
          detail: trigger.resource_type ? `${trigger.resource_type} · ${trigger.filters.length} filters` : `${trigger.filters.length} filters`,
          group: "Start",
          kind: "trigger",
          meta: triggerKey,
          title: formatTriggerDisplayName(trigger),
          tone: "blue",
        },
      };
    }),
    ...form.actions.map((action, index): WorkflowNode => {
      const actionKey = action.action_key ?? `action_${index + 1}`;
      const id = actionNodeId(actionKey);

      const status = actionStatusByKey.get(actionKey);
      const group = workflowActionGroup(action.type);

      return {
        id,
        type: "workflowNode",
        position: metadata[id] ?? defaultMetadata[id] ?? { x: 360 + index * 300, y: 0 },
        selected: selectedNode?.kind === "action" && selectedNode.key === actionKey,
        data: {
          detail: summarizeAction(action, form, index),
          group,
          kind: "action",
          meta: actionKey,
          title: workflowActionDisplayName(action),
          tone: workflowGroupTone(group),
          ...(status ? { status } : {}),
        },
      };
    }),
  ];
}

function buildWorkflowEdges(form: WorkflowFormState, activeEdgeIds: Set<string>): Edge[] {
  const edges: Edge[] = [];

  for (const [index, trigger] of form.triggers.entries()) {
    const triggerKey = trigger.trigger_key ?? `trigger_${index + 1}`;
    if (!trigger.entry_action_key) continue;
    const id = triggerEntryEdgeId(triggerKey);
    edges.push({
      id,
      source: triggerNodeId(triggerKey),
      sourceHandle: "entry",
      target: actionNodeId(trigger.entry_action_key),
      label: "start",
      animated: activeEdgeIds.has(id),
      ...(activeEdgeIds.has(id) ? { className: "workflow-edge-active" } : {}),
    });
  }

  for (const [index, action] of form.actions.entries()) {
    const actionKey = action.action_key ?? `action_${index + 1}`;
    if (action.next_action_key) {
      const id = actionEdgeId(actionKey, "success");
      edges.push({
        id,
        source: actionNodeId(actionKey),
        sourceHandle: "success",
        target: actionNodeId(action.next_action_key),
        label: "success",
        animated: activeEdgeIds.has(id),
        style: { stroke: activeEdgeIds.has(id) ? "#22c55e" : "#72e09c" },
      });
    }
    if (action.failure_action_key) {
      const id = actionEdgeId(actionKey, "failure");
      edges.push({
        id,
        source: actionNodeId(actionKey),
        sourceHandle: "failure",
        target: actionNodeId(action.failure_action_key),
        label: "failure",
        animated: activeEdgeIds.has(id),
        style: { stroke: activeEdgeIds.has(id) ? "#ef4444" : "#ff98ad" },
      });
    }
  }

  return edges;
}

function addTrigger(
  catalog: WorkflowTriggerCatalogItem[],
  form: WorkflowFormState,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>,
) {
  const catalogItem = catalog.find((item) => item.action === "incident.created") ?? catalog[0];
  const triggerKey = nextTriggerKey(form.triggers);
  const entryActionKey = form.actions[0]?.action_key ?? "action_1";
  const trigger: WorkflowTriggerInput = {
    trigger_key: triggerKey,
    event_action: catalogItem?.action ?? "incident.created",
    resource_type: catalogItem?.resource_type ?? "incident",
    filters: [],
    entry_action_key: entryActionKey,
  };
  const id = triggerNodeId(triggerKey);

  setForm((current) => ({
    ...current,
    graphMetadata: updateNodePosition(current.graphMetadata, id, { x: 0, y: current.triggers.length * 150 }),
    triggers: [...current.triggers, trigger],
  }));
  setSelectedNode({ kind: "trigger", key: triggerKey });
}

function addAction(
  type: WorkflowActionInput["type"],
  form: WorkflowFormState,
  selectedNode: SelectedNode,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>,
) {
  const actionKey = nextActionKey(form.actions);
  const action = presetAction(type, actionKey);
  const id = actionNodeId(actionKey);

  setForm((current) => {
    const nextActions = [...current.actions, action];
    const selectedActionIndex = selectedNode?.kind === "action"
      ? current.actions.findIndex((candidate, index) => (candidate.action_key ?? `action_${index + 1}`) === selectedNode.key)
      : -1;
    const selectedTriggerIndex = selectedNode?.kind === "trigger"
      ? current.triggers.findIndex((candidate, index) => (candidate.trigger_key ?? `trigger_${index + 1}`) === selectedNode.key)
      : -1;

    return {
      ...current,
      actions: nextActions.map((candidate, index) =>
        index === selectedActionIndex && !candidate.next_action_key
          ? { ...candidate, next_action_key: actionKey }
          : candidate,
      ),
      graphMetadata: updateNodePosition(current.graphMetadata, id, { x: 360 + current.actions.length * 300, y: selectedActionIndex >= 0 ? selectedActionIndex * 120 : 0 }),
      triggers: current.triggers.map((trigger, index) =>
        index === selectedTriggerIndex && !trigger.entry_action_key
          ? { ...trigger, entry_action_key: actionKey }
          : trigger,
      ),
    };
  });
  setSelectedNode({ kind: "action", key: actionKey });
}

function removeTrigger(
  index: number,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  selectedNode: SelectedNode,
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>,
) {
  setForm((current) => {
    if (current.triggers.length <= 1) return current;
    const removedKey = current.triggers[index]?.trigger_key ?? `trigger_${index + 1}`;
    if (selectedNode?.kind === "trigger" && selectedNode.key === removedKey) {
      const fallback = current.triggers[index - 1] ?? current.triggers[index + 1];
      setSelectedNode(fallback?.trigger_key ? { kind: "trigger", key: fallback.trigger_key } : null);
    }

    return {
      ...current,
      triggers: current.triggers.filter((_, itemIndex) => itemIndex !== index),
    };
  });
}

function removeAction(
  index: number,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  selectedNode: SelectedNode,
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>,
) {
  setForm((current) => {
    if (current.actions.length <= 1) return current;
    const removedActionKey = current.actions[index]?.action_key ?? `action_${index + 1}`;
    if (selectedNode?.kind === "action" && selectedNode.key === removedActionKey) {
      const fallback = current.actions[index - 1] ?? current.actions[index + 1];
      const fallbackKey = fallback?.action_key;
      setSelectedNode(fallbackKey ? { kind: "action", key: fallbackKey } : null);
    }

    return {
      ...current,
      actions: current.actions
        .filter((_, itemIndex) => itemIndex !== index)
        .map((action) => ({
          ...action,
          failure_action_key: action.failure_action_key === removedActionKey ? null : action.failure_action_key,
          next_action_key: action.next_action_key === removedActionKey ? null : action.next_action_key,
        })),
      triggers: current.triggers.map((trigger) => ({
        ...trigger,
        entry_action_key: trigger.entry_action_key === removedActionKey ? null : trigger.entry_action_key,
      })),
    };
  });
}

function updateTrigger(
  index: number,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  updater: (trigger: WorkflowTriggerInput) => WorkflowTriggerInput,
) {
  setForm((current) => ({
    ...current,
    triggers: current.triggers.map((trigger, itemIndex) => itemIndex === index ? updater(trigger) : trigger),
  }));
}

function updateAction(
  index: number,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  updater: (action: WorkflowActionInput) => WorkflowActionInput,
) {
  setForm((current) => ({
    ...current,
    actions: current.actions.map((action, itemIndex) => itemIndex === index ? updater(action) : action),
  }));
}

function updateActionDisplayName(
  index: number,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  value: string,
) {
  updateAction(index, setForm, (action) => ({
    ...action,
    config: cleanRecord({
      ...asRecord(action.config),
      display_name: value.trim() || undefined,
    }),
  }));
}

function renameActionKey(
  index: number,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>,
  nextValue: string,
) {
  setForm((current) => {
    const previousKey = current.actions[index]?.action_key ?? `action_${index + 1}`;
    const nextKey = nextValue.trim();
    if (!nextKey) return current;
    setSelectedNode({ kind: "action", key: nextKey });

    return {
      ...current,
      actions: current.actions.map((action, itemIndex) => {
        const renamedAction = itemIndex === index ? { ...action, action_key: nextKey } : action;

        return {
          ...renamedAction,
          failure_action_key: renamedAction.failure_action_key === previousKey ? nextKey : renamedAction.failure_action_key,
          next_action_key: renamedAction.next_action_key === previousKey ? nextKey : renamedAction.next_action_key,
        };
      }),
      graphMetadata: renamePositionKey(current.graphMetadata, actionNodeId(previousKey), actionNodeId(nextKey)),
      triggers: current.triggers.map((trigger) => ({
        ...trigger,
        entry_action_key: trigger.entry_action_key === previousKey ? nextKey : trigger.entry_action_key,
      })),
    };
  });
}

function updateActionConfigSection(
  index: number,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  section: WorkflowConfigSection,
  key: string,
  value: unknown,
) {
  updateAction(index, setForm, (action) => {
    const config = asRecord(action.config);
    if (section === "root") {
      return {
        ...action,
        config: cleanRecord({
          ...config,
          [key]: value,
        }),
      };
    }

    return {
      ...action,
      config: cleanRecord({
        ...config,
        [section]: cleanRecord({
          ...asRecord(config[section]),
          [key]: value,
        }),
      }),
    };
  });
}

function updateActionConfigJsonField(
  index: number,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  section: WorkflowConfigSection,
  key: string,
  value: string,
) {
  if (!value.trim()) {
    updateActionConfigSection(index, setForm, section, key, undefined);
    return;
  }

  try {
    updateActionConfigSection(index, setForm, section, key, JSON.parse(value));
  } catch {
    updateActionConfigSection(index, setForm, section, key, value);
  }
}

function updateActionRawConfig(
  index: number,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  value: string,
) {
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) return;
    updateAction(index, setForm, (action) => ({
      ...action,
      config: parsed,
    }));
  } catch {
    return;
  }
}

function connectWorkflowNodes(
  connection: Connection,
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  setFormError: Dispatch<SetStateAction<string | null>>,
) {
  if (!isValidWorkflowConnection(connection)) {
    setFormError("Connect a trigger or step output to a different action node.");
    return;
  }

  const targetActionKey = connection.target.slice("action:".length);

  if (connection.source.startsWith("trigger:")) {
    const triggerKey = connection.source.slice("trigger:".length);
    setFormError(null);
    setForm((current) => ({
      ...current,
      triggers: current.triggers.map((trigger, index) =>
        (trigger.trigger_key ?? `trigger_${index + 1}`) === triggerKey
          ? { ...trigger, entry_action_key: targetActionKey }
          : trigger,
      ),
    }));
    return;
  }

  if (connection.source.startsWith("action:")) {
    const actionKey = connection.source.slice("action:".length);
    const field = connection.sourceHandle === "failure" ? "failure_action_key" : "next_action_key";
    setFormError(null);
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action, index) =>
        (action.action_key ?? `action_${index + 1}`) === actionKey
          ? { ...action, [field]: targetActionKey }
          : action,
      ),
    }));
  }
}

function isValidWorkflowConnection(connection: Connection | Edge): boolean {
  if (!connection.source || !connection.target || !connection.target.startsWith("action:")) return false;
  if (connection.source === connection.target) return false;
  if (connection.source.startsWith("trigger:")) return connection.sourceHandle === "entry";
  if (!connection.source.startsWith("action:")) return false;

  return connection.sourceHandle === "success" || connection.sourceHandle === "failure";
}

function deleteWorkflowEdges(edges: Edge[], setForm: Dispatch<SetStateAction<WorkflowFormState>>) {
  setForm((current) => ({
    ...current,
    actions: current.actions.map((action, index) => {
      const actionKey = action.action_key ?? `action_${index + 1}`;
      let nextActionKey = action.next_action_key;
      let failureActionKey = action.failure_action_key;

      for (const edge of edges) {
        if (edge.id === actionEdgeId(actionKey, "success")) nextActionKey = null;
        if (edge.id === actionEdgeId(actionKey, "failure")) failureActionKey = null;
      }

      return {
        ...action,
        failure_action_key: failureActionKey,
        next_action_key: nextActionKey,
      };
    }),
    triggers: current.triggers.map((trigger, index) => {
      const triggerKey = trigger.trigger_key ?? `trigger_${index + 1}`;
      return edges.some((edge) => edge.id === triggerEntryEdgeId(triggerKey))
        ? { ...trigger, entry_action_key: null }
        : trigger;
    }),
  }));
}

function deleteWorkflowNodes(
  nodes: Node[],
  setForm: Dispatch<SetStateAction<WorkflowFormState>>,
  selectedNode: SelectedNode,
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>,
) {
  for (const node of nodes) {
    const selected = nodeToSelectedNode(node.id);
    if (!selected) continue;
    setForm((current) => {
      if (selected.kind === "trigger") {
        const index = current.triggers.findIndex((trigger, itemIndex) => (trigger.trigger_key ?? `trigger_${itemIndex + 1}`) === selected.key);
        if (index < 0 || current.triggers.length <= 1) return current;
        return {
          ...current,
          triggers: current.triggers.filter((_, itemIndex) => itemIndex !== index),
        };
      }

      const index = current.actions.findIndex((action, itemIndex) => (action.action_key ?? `action_${itemIndex + 1}`) === selected.key);
      if (index < 0 || current.actions.length <= 1) return current;
      return {
        ...current,
        actions: current.actions
          .filter((_, itemIndex) => itemIndex !== index)
          .map((action) => ({
            ...action,
            failure_action_key: action.failure_action_key === selected.key ? null : action.failure_action_key,
            next_action_key: action.next_action_key === selected.key ? null : action.next_action_key,
          })),
        triggers: current.triggers.map((trigger) => ({
          ...trigger,
          entry_action_key: trigger.entry_action_key === selected.key ? null : trigger.entry_action_key,
        })),
      };
    });
    if (selectedNode?.kind === selected.kind && selectedNode.key === selected.key) setSelectedNode(null);
  }
}

function autoLayout(setForm: Dispatch<SetStateAction<WorkflowFormState>>) {
  setForm((current) => ({
    ...current,
    graphMetadata: {
      ...current.graphMetadata,
      positions: workflowGraphLayout(current.triggers, current.actions),
    },
  }));
}

function createRunOverlay(triggers: WorkflowTriggerInput[], actions: WorkflowActionInput[], run: WorkflowRun | null) {
  const actionStatusByKey = new Map<string, WorkflowActionRun["status"]>();
  const edgeIds = new Set<string>();

  if (!run?.action_runs) {
    return { actionStatusByKey, edgeIds };
  }

  const actionByOrder = new Map(actions.map((action, index) => [index + 1, action]));
  if (run.entry_action_key) {
    for (const [index, trigger] of triggers.entries()) {
      if (trigger.entry_action_key === run.entry_action_key) {
        edgeIds.add(triggerEntryEdgeId(trigger.trigger_key ?? `trigger_${index + 1}`));
      }
    }
  }

  for (const actionRun of run.action_runs) {
    const action = actionByOrder.get(actionRun.action_order);
    const actionKey = action?.action_key;
    if (!actionKey) continue;
    actionStatusByKey.set(actionKey, actionRun.status);
    if (actionRun.status === "succeeded" && action.next_action_key) edgeIds.add(actionEdgeId(actionKey, "success"));
    if (actionRun.status === "failed" && action.failure_action_key) edgeIds.add(actionEdgeId(actionKey, "failure"));
  }

  return { actionStatusByKey, edgeIds };
}

function validateWorkflowGraph(triggers: WorkflowTriggerInput[], actions: WorkflowActionInput[]) {
  const errors: string[] = [];
  if (triggers.length === 0) errors.push("At least one trigger is required.");
  if (actions.length === 0) errors.push("At least one action is required.");

  const actionKeys = new Set<string>();
  for (const [index, action] of actions.entries()) {
    const actionKey = action.action_key?.trim() || `action_${index + 1}`;
    if (actionKeys.has(actionKey)) errors.push(`Duplicate action key: ${actionKey}`);
    actionKeys.add(actionKey);
  }

  const triggerKeys = new Set<string>();
  for (const [index, trigger] of triggers.entries()) {
    const triggerKey = trigger.trigger_key?.trim() || `trigger_${index + 1}`;
    if (triggerKeys.has(triggerKey)) errors.push(`Duplicate trigger key: ${triggerKey}`);
    triggerKeys.add(triggerKey);
    if (trigger.entry_action_key && !actionKeys.has(trigger.entry_action_key)) errors.push(`${triggerKey} points to missing action: ${trigger.entry_action_key}`);
  }

  for (const action of actions) {
    const actionKey = action.action_key ?? "";
    for (const edgeKey of [action.next_action_key, action.failure_action_key]) {
      if (edgeKey && !actionKeys.has(edgeKey)) errors.push(`${actionKey} points to missing action: ${edgeKey}`);
    }
  }

  const actionByKey = new Map(actions.map((action, index) => [action.action_key ?? `action_${index + 1}`, action]));
  const reachableKeys = new Set<string>();
  const visitingKeys = new Set<string>();

  function visit(actionKey: string) {
    if (visitingKeys.has(actionKey)) {
      errors.push(`Cycle detected at ${actionKey}.`);
      return;
    }
    if (reachableKeys.has(actionKey)) return;

    const action = actionByKey.get(actionKey);
    if (!action) return;
    visitingKeys.add(actionKey);
    reachableKeys.add(actionKey);
    if (action.next_action_key) visit(action.next_action_key);
    if (action.failure_action_key) visit(action.failure_action_key);
    visitingKeys.delete(actionKey);
  }

  for (const trigger of triggers) {
    if (trigger.entry_action_key) visit(trigger.entry_action_key);
  }

  return errors;
}

function presetAction(
  type: WorkflowActionInput["type"],
  actionKey = "action_1",
  nextActionKey: string | null = null,
  failureActionKey: string | null = null,
): WorkflowActionInput {
  return {
    action_key: actionKey,
    type,
    config: {
      display_name: workflowActionCatalogItem(type).label,
      ...defaultActionConfig(type),
    },
    next_action_key: nextActionKey,
    failure_action_key: failureActionKey,
  };
}

function defaultActionConfig(type: WorkflowActionInput["type"]): Record<string, unknown> {
  switch (type) {
    case "condition":
      return {
        body: {
          field: "{{event.metadata.priority}}",
          operator: "equals",
          value: "P1",
        },
      };
    case "notification_webhook":
    case "http_request":
      return {
        request: {
          method: "POST",
          url: "https://example.com/workflow",
        },
      };
    case "integration_webhook":
      return {
        target: { integration_type: "slack" },
      };
    case "service_create":
      return { body: { name: "New service" } };
    case "service_update":
      return { body: { description: "Updated by workflow" }, target: { service_id: "{{event.resource_id}}" } };
    case "service_delete":
      return { target: { service_id: "{{event.resource_id}}" } };
    case "webhook_endpoint_create":
      return { target: { service_id: "{{event.resource_id}}" } };
    case "webhook_endpoint_rotate_secret":
    case "webhook_endpoint_delete":
      return { target: { endpoint_id: "{{event.resource_id}}" } };
    case "incident_create":
      return {
        body: {
          service_id: "{{event.metadata.service_id}}",
          severity: "high",
          source: "workflow",
          title: "{{event.action}}",
        },
      };
    case "incident_ack":
    case "incident_resolve":
      return { target: { incident_id: "{{event.resource_id}}" } };
    case "incident_update_priority":
      return { body: { priority: "P2" }, target: { incident_id: "{{event.resource_id}}" } };
    case "incident_manual_escalation":
      return {
        body: {
          action: "advance_to_next_step",
          force: false,
          update_current_step: false,
        },
        target: { incident_id: "{{event.resource_id}}" },
      };
    case "escalation_policy_create":
      return {
        body: {
          name: "Workflow escalation policy",
          repeat_enabled: false,
          steps: [
            {
              delay_seconds: 0,
              step_order: 1,
              target_id: "{{event.actor_user_id}}",
              target_type: "user",
            },
          ],
        },
      };
    case "escalation_policy_update":
      return { body: { name: "Updated by workflow" }, target: { policy_id: "{{event.resource_id}}" } };
    case "escalation_policy_delete":
      return { target: { policy_id: "{{event.resource_id}}" } };
    case "on_call_schedule_create":
      return {
        body: {
          name: "Workflow on-call schedule",
          rotations: [
            {
              layer: "primary",
              participants: [],
              rotation_interval: 1,
              rotation_type: "weekly",
              starts_at: new Date().toISOString(),
              timezone: "Asia/Seoul",
            },
          ],
          timezone: "Asia/Seoul",
        },
      };
    case "on_call_schedule_update":
      return { body: { timezone: "Asia/Seoul" }, target: { schedule_id: "{{event.resource_id}}" } };
    case "on_call_schedule_delete":
      return { target: { schedule_id: "{{event.resource_id}}" } };
    case "on_call_override_create":
      return {
        body: {
          ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          layer: "primary",
          schedule_id: "{{event.resource_id}}",
          starts_at: new Date().toISOString(),
          user_id: "{{event.actor_user_id}}",
        },
      };
    case "on_call_override_delete":
      return { target: { override_id: "{{event.resource_id}}" } };
    case "notification_provider_update":
      return { body: { enabled: true }, target: { provider: "email" } };
  }
}

function ensureCatalogOption(catalog: WorkflowTriggerCatalogItem[], trigger: WorkflowTriggerInput) {
  if (catalog.some((item) => item.action === trigger.event_action)) return catalog;

  return [
    {
      action: trigger.event_action,
      label: trigger.event_action,
      resource_type: trigger.resource_type ?? "incident",
    },
    ...catalog,
  ];
}

function summarizeAction(action: WorkflowActionInput, form: WorkflowFormState, actionIndex: number): string {
  const config = asRecord(action.config);
  const target = asRecord(config.target);
  const body = asRecord(config.body);

  if (action.type === "condition") {
    const operator = conditionOperator(body.operator);
    const value = operator === "exists" ? "exists" : formatConditionInputValue(body.value);
    const fieldLabel = workflowValueLabel(body.field, buildWorkflowValueOptions(form, actionIndex));

    return `${fieldLabel || "Event priority"} ${operator} ${value || "-"}`;
  }
  if (action.type === "http_request" || action.type === "notification_webhook") {
    const request = asRecord(config.request);
    const legacyBody = asRecord(config.body);
    return `${stringConfig(request.method ?? legacyBody.method) || "POST"} ${stringConfig(request.url ?? legacyBody.url) || "No URL"}`;
  }
  if (action.type === "integration_webhook") {
    return `Send to ${stringConfig(target.integration_type) || "integration"}`;
  }

  const bodyKeys = Object.keys(body);
  const targetKeys = Object.keys(target);
  if (bodyKeys.length > 0) return `Body: ${bodyKeys.join(", ")}`;
  if (targetKeys.length > 0) return `Target: ${targetKeys.join(", ")}`;

  return workflowActionCatalogItem(action.type).description;
}

function workflowActionGroup(type: WorkflowActionInput["type"]): Exclude<WorkflowNodeGroup, "Start"> {
  return workflowGroupLabel(workflowActionCatalogItem(type).group);
}

function workflowActionDisplayName(action: WorkflowActionInput): string {
  return stringConfig(asRecord(action.config).display_name).trim() || workflowActionCatalogItem(action.type).label;
}

function formatTriggerDisplayName(trigger: WorkflowTriggerInput): string {
  const catalogItem = trigger.event_action ? trigger.event_action.split(".").map((part) => part.replaceAll("_", " ")).join(" ") : "Trigger";

  return catalogItem.charAt(0).toUpperCase() + catalogItem.slice(1);
}

function buildWorkflowValueOptions(form: WorkflowFormState, actionIndex: number): WorkflowValueOption[] {
  const triggerOptions = form.triggers.flatMap((trigger) => triggerOutputOptions(trigger));
  const actionOptions = form.actions.slice(0, actionIndex).flatMap((action, index) => actionOutputOptions(action, index));

  return [...triggerOptions, ...actionOptions];
}

function triggerOutputOptions(trigger: WorkflowTriggerInput): WorkflowValueOption[] {
  const source = `Trigger: ${formatTriggerDisplayName(trigger)}`;
  const resourceLabel = trigger.resource_type ? `${trigger.resource_type.replaceAll("_", " ")} ID` : "Resource ID";
  const baseOptions: WorkflowValueOption[] = [
    { kind: "string", label: "Event action", source, value: "{{event.action}}" },
    { kind: "uuid", label: resourceLabel, source, value: "{{event.resource_id}}" },
    { kind: "uuid", label: "Actor user ID", source, value: "{{event.actor_user_id}}" },
    { kind: "json", label: "Metadata object", source, value: "{{event.metadata}}" },
  ];
  const metadataOptionFields = [
    ["priority", "Priority"],
    ["severity", "Severity"],
    ["status", "Status"],
    ["service_id", "Service ID"],
    ["incident_id", "Incident ID"],
    ["endpoint_id", "Webhook endpoint ID"],
    ["policy_id", "Escalation policy ID"],
    ["schedule_id", "Schedule ID"],
    ["override_id", "Override ID"],
    ["user_id", "User ID"],
    ["provider", "Provider"],
  ] as const;
  const metadataOptions: WorkflowValueOption[] = metadataOptionFields.map(([key, label]) => ({
    kind: key.endsWith("_id") ? "uuid" : "string",
    label: `Metadata: ${label}`,
    source,
    value: `{{event.metadata.${key}}}`,
  }));

  return [...baseOptions, ...metadataOptions];
}

function actionOutputOptions(action: WorkflowActionInput, index: number): WorkflowValueOption[] {
  const actionKey = action.action_key ?? `action_${index + 1}`;
  const catalogItem = workflowActionCatalogItem(action.type);
  const source = `Step: ${workflowActionDisplayName(action)}`;

  return (catalogItem.output_fields ?? []).map((field) => ({
    description: field.path,
    kind: field.kind,
    label: field.label,
    source,
    value: `{{actions.${actionKey}.output.${field.path}}}`,
  }));
}

function groupWorkflowValueOptions(options: WorkflowValueOption[]) {
  const groups = new Map<string, WorkflowValueOption[]>();
  for (const option of options) {
    groups.set(option.source, [...(groups.get(option.source) ?? []), option]);
  }

  return Array.from(groups.entries()).map(([source, grouped]) => ({ options: grouped, source }));
}

function workflowValueLabel(value: unknown, options: WorkflowValueOption[]): string {
  const stringValue = stringConfig(value);
  return options.find((option) => option.value === stringValue)?.label ?? stringValue;
}

function metadataSegmentsFromValue(value: string): string[] {
  const trimmed = value.trim();
  const templateMatch = trimmed.match(/^{{\s*event\.metadata(?:\.([^}]+?))?\s*}}$/);
  if (templateMatch) return splitMetadataPath(templateMatch[1] ?? "");
  if (trimmed.startsWith("event.metadata.")) return splitMetadataPath(trimmed.slice("event.metadata.".length));
  if (trimmed.startsWith("metadata.")) return splitMetadataPath(trimmed.slice("metadata.".length));

  return [];
}

function splitMetadataPath(path: string): string[] {
  return path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function metadataTemplateFromSegments(segments: string[]): string {
  const path = segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(".");

  return path ? `{{event.metadata.${path}}}` : "{{event.metadata}}";
}

function isWorkflowValueCompatible(field: WorkflowActionConfigField, option: WorkflowValueOption) {
  if (field.key === "field") return true;
  if (field.kind === "uuid") return option.kind === "uuid";
  if (field.kind === "number") return option.kind === "number";
  if (field.kind === "boolean") return option.kind === "boolean";
  if (field.kind === "json") return true;

  return true;
}

function workflowGroupTone(group: WorkflowNodeGroup): WorkflowNodeTone {
  if (group === "Start") return "blue";
  if (group === "Logic") return "yellow";
  if (group === "External") return "green";
  if (group === "Incident") return "orange";
  if (group === "Webhook") return "green";
  if (group === "Escalation") return "red";
  if (group === "On-call") return "blue";
  if (group === "Notification") return "yellow";

  return "neutral";
}

function workflowGroupClassName(group: WorkflowNodeGroup) {
  return `is-group-${group.toLowerCase()}`;
}

function workflowGroupColor(group?: WorkflowNodeGroup) {
  if (group === "Start") return "#38bdf8";
  if (group === "Logic") return "#fbbf24";
  if (group === "External") return "#22c55e";
  if (group === "Incident") return "#fb923c";
  if (group === "Service") return "#a78bfa";
  if (group === "Webhook") return "#14b8a6";
  if (group === "Escalation") return "#f43f5e";
  if (group === "On-call") return "#60a5fa";
  if (group === "Notification") return "#facc15";

  return "#94a3b8";
}

function workflowNodeGroupDisplayName(group: WorkflowNodeGroup) {
  if (group === "Start") return "Trigger";
  if (group === "Logic") return "Condition";
  if (group === "External") return "External call";
  if (group === "Service") return "Service";
  if (group === "Webhook") return "Webhook";
  if (group === "Escalation") return "Escalation policy";
  if (group === "On-call") return "On-call";
  if (group === "Notification") return "Notification";

  return "Incident";
}

function workflowActionCatalogItem(type: WorkflowActionInput["type"]): WorkflowActionCatalogItem {
  return workflowActionCatalog.find((item) => item.type === type) ?? {
    body_fields: [],
    dangerous: false,
    description: formatActionTypeFallback(type),
    group: "logic",
    label: formatActionTypeFallback(type),
    output_fields: [],
    target_fields: [],
    type,
  };
}

function formatActionTypeFallback(type: WorkflowActionInput["type"]) {
  return type.replaceAll("_", " ");
}

function workflowGroupLabel(group: WorkflowActionCatalogItem["group"]): Exclude<WorkflowNodeGroup, "Start"> {
  if (group === "on_call") return "On-call";

  return `${group.charAt(0).toUpperCase()}${group.slice(1)}` as Exclude<WorkflowNodeGroup, "Start">;
}

function buildActionPaletteGroups(items: readonly WorkflowActionCatalogItem[]) {
  const groupOrder: WorkflowActionCatalogItem["group"][] = ["logic", "external", "incident", "service", "webhook", "escalation", "on_call", "notification"];

  return groupOrder
    .map((group) => ({
      actions: items.filter((item) => item.group === group),
      description: workflowGroupDescription(group),
      label: workflowGroupLabel(group),
    }))
    .filter((group) => group.actions.length > 0);
}

function workflowPickerGroupLabel(group: WorkflowNodeGroup) {
  if (group === "Logic") return "Conditions";
  if (group === "External") return "External calls";
  if (group === "Incident") return "Incidents";
  if (group === "Service") return "Services";
  if (group === "Webhook") return "Webhook endpoints";
  if (group === "Escalation") return "Escalation policies";
  if (group === "On-call") return "On-call";
  if (group === "Notification") return "Notifications";

  return "Triggers";
}

function workflowPickerGroupDescription(group: ActionPaletteGroup) {
  if (group.label === "Logic") return "Branch or filter the run before continuing.";
  if (group.label === "External") return "Call another system with an HTTP request.";
  if (group.label === "Incident") return "Create, acknowledge, resolve, or escalate incidents.";
  if (group.label === "Service") return "Create services or update service ownership and policy links.";
  if (group.label === "Webhook") return "Create, rotate, or remove ingestion endpoints.";
  if (group.label === "Escalation") return "Create, update, or remove escalation policies.";
  if (group.label === "On-call") return "Create schedules and manage temporary coverage overrides.";

  return "Update project notification delivery settings.";
}

function workflowGroupDescription(group: WorkflowActionCatalogItem["group"]) {
  if (group === "logic") return "Branch by event data";
  if (group === "external") return "Call another system";
  if (group === "incident") return "Create or manage incidents";
  if (group === "service") return "Manage monitored services";
  if (group === "webhook") return "Manage ingestion endpoints";
  if (group === "escalation") return "Manage policies";
  if (group === "on_call") return "Manage schedules and overrides";

  return "Manage notification providers";
}

function inferWorkflowResourceType(action: string) {
  if (action.startsWith("incident.")) return "incident";
  if (action.startsWith("service.")) return "service";
  if (action.startsWith("webhook_endpoint.")) return "webhook_endpoint";
  if (action.startsWith("on_call_schedule.")) return "on_call_schedule";
  if (action.startsWith("on_call_override.")) return "on_call_override";
  if (action.startsWith("escalation_policy.")) return "escalation_policy";
  if (action.startsWith("workspace_invite.")) return "workspace_invite";
  if (action.startsWith("workspace_notification_provider_setting.")) return "workspace_notification_provider_setting";
  if (action.startsWith("notification.")) return "notification";

  return "workspace";
}

function workflowTestResourceOptions(
  resourceType: string,
  options: {
    escalationPolicies: Array<{ label: string; value: string }>;
    incidents: Array<{ label: string; value: string }>;
    schedules: Array<{ label: string; value: string }>;
    services: Array<{ label: string; value: string }>;
  },
) {
  if (resourceType === "incident") return options.incidents;
  if (resourceType === "service") return options.services;
  if (resourceType === "on_call_schedule") return options.schedules;
  if (resourceType === "escalation_policy") return options.escalationPolicies;

  return [];
}

function testResourceLabel(resourceType: string) {
  if (resourceType === "incident") return "Incident";
  if (resourceType === "service") return "Service";
  if (resourceType === "webhook_endpoint") return "Webhook endpoint ID";
  if (resourceType === "on_call_schedule") return "On-call schedule";
  if (resourceType === "on_call_override") return "On-call override ID";
  if (resourceType === "escalation_policy") return "Escalation policy";
  if (resourceType === "workspace") return "Workspace ID";

  return "Resource ID";
}

function testResourceHint(resourceType: string) {
  if (resourceType === "incident") return "The test event metadata is copied from the selected incident state.";
  if (resourceType === "service") return "The test event metadata is copied from the selected service state.";
  if (resourceType === "on_call_schedule") return "The test event metadata is copied from the selected schedule.";
  if (resourceType === "escalation_policy") return "The test event metadata is copied from the selected policy.";

  return "Leave empty to use a synthetic event, or paste a resource UUID.";
}

function readActionConfigField(config: unknown, section: WorkflowConfigSection, key: string): unknown {
  const record = asRecord(config);
  if (section === "root") {
    if (key in record) return record[key];
    return asRecord(record.body)[key];
  }

  const sectionRecord = asRecord(record[section]);
  if (key in sectionRecord) return sectionRecord[key];

  if (section === "request" && key in asRecord(record.body)) {
    return asRecord(record.body)[key];
  }

  if (section === "body" && isRecord(record.input) && key in record.input) {
    return record.input[key];
  }

  return record[key];
}

function resourceOptionsForField(key: string, resourceOptions: ResourceOptions) {
  if (key === "service_id") return resourceOptions.services;
  if (key === "escalation_policy_id" || key === "policy_id") return resourceOptions.escalationPolicies;
  if (key === "schedule_id") return resourceOptions.schedules;
  if (key === "user_id") return resourceOptions.members;

  return [];
}

function parseFieldInputValue(field: WorkflowActionConfigField, value: string): unknown {
  if (!value.trim()) return undefined;
  if (field.kind === "number" && !value.includes("{{")) return Number(value);

  return value;
}

function formatJsonFieldValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return typeof value === "string" ? value : stringifyJson(value);
}

function jsonLabelForField(field: WorkflowActionConfigField) {
  if (field.key === "body") return "Request body JSON";
  if (field.key === "headers") return "Request headers JSON";

  return field.label;
}

function jsonFieldHintForField(key: string) {
  if (key === "body") return "Only the HTTP request body goes here. URL, method, and headers are configured separately.";
  if (key === "headers") return "Only HTTP headers go here as a JSON object.";

  return "Enter JSON. Workflow values like {{event.resource_id}} can be used inside strings.";
}

function jsonExampleForField(key: string) {
  if (key === "body") return 'Example: { "channel": "#alerts", "text": "Incident: {{event.resource_id}}" }';
  if (key === "headers") return 'Example: { "Authorization": "Bearer token", "Content-Type": "application/json" }';

  return 'Example: { "key": "value" }';
}

function jsonPlaceholderForField(key: string) {
  if (key === "steps") {
    return stringifyJson([
      {
        delay_seconds: 0,
        step_order: 1,
        target_id: "{{event.actor_user_id}}",
        target_type: "user",
      },
    ]);
  }
  if (key === "rotations") {
    return stringifyJson([
      {
        layer: "primary",
        participants: [],
        rotation_interval: 1,
        rotation_type: "weekly",
        starts_at: new Date().toISOString(),
        timezone: "Asia/Seoul",
      },
    ]);
  }
  if (key === "headers") return stringifyJson({ "x-workflow": "pagerwho" });
  if (key === "body") return stringifyJson({ text: "Incident: {{event.resource_id}}" });

  return "{}";
}

function templatePlaceholderForField(key: string) {
  if (key.endsWith("_id")) return "{{event.resource_id}}";
  if (key === "title") return "{{event.action}}";
  if (key === "starts_at" || key === "ends_at") return new Date().toISOString();

  return "";
}

function conditionOperator(value: unknown): "equals" | "exists" | "in" {
  return value === "in" || value === "exists" || value === "equals" ? value : "equals";
}

function formatConditionInputValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  return value === undefined || value === null ? "" : String(value);
}

function nextActionKey(actions: WorkflowActionInput[]) {
  let index = actions.length + 1;
  const existingKeys = new Set(actions.map((action, itemIndex) => action.action_key ?? `action_${itemIndex + 1}`));

  while (existingKeys.has(`action_${index}`)) index += 1;

  return `action_${index}`;
}

function nextTriggerKey(triggers: WorkflowTriggerInput[]) {
  let index = triggers.length + 1;
  const existingKeys = new Set(triggers.map((trigger, itemIndex) => trigger.trigger_key ?? `trigger_${itemIndex + 1}`));

  while (existingKeys.has(`trigger_${index}`)) index += 1;

  return `trigger_${index}`;
}

function parseJsonArray<T>(value: string, label: string): T[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  assertNonEmptyArray(parsed, label);
  return parsed as T[];
}

function parseJsonObject<T extends Record<string, unknown>>(value: string, label: string): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object.`);

  return parsed as T;
}

function assertNonEmptyArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty JSON array.`);
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseGraphMetadata(value: unknown): GraphMetadata {
  return isRecord(value) ? (value as GraphMetadata) : {};
}

function workflowGraphLayout(triggers: WorkflowTriggerInput[], actions: WorkflowActionInput[]) {
  const positions: Record<string, { x: number; y: number }> = {};
  const actionKeys = actions.map((action, index) => action.action_key ?? `action_${index + 1}`);
  const actionByKey = new Map(actionKeys.map((key, index) => [key, actions[index]]));
  const depthByKey = new Map<string, number>();
  const queue: string[] = [];

  for (const [index, trigger] of triggers.entries()) {
    const triggerKey = trigger.trigger_key ?? `trigger_${index + 1}`;
    positions[triggerNodeId(triggerKey)] = { x: 40, y: index * 180 };
    if (trigger.entry_action_key && actionByKey.has(trigger.entry_action_key)) {
      const currentDepth = depthByKey.get(trigger.entry_action_key);
      if (currentDepth === undefined || currentDepth > 0) {
        depthByKey.set(trigger.entry_action_key, 0);
        queue.push(trigger.entry_action_key);
      }
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const actionKey = queue[cursor];
    if (!actionKey) continue;
    const action = actionByKey.get(actionKey);
    const depth = depthByKey.get(actionKey) ?? 0;
    if (!action) continue;

    for (const nextKey of [action.next_action_key, action.failure_action_key]) {
      if (!nextKey || !actionByKey.has(nextKey)) continue;
      const nextDepth = depth + 1;
      const currentDepth = depthByKey.get(nextKey);
      if (currentDepth === undefined || nextDepth < currentDepth) {
        depthByKey.set(nextKey, nextDepth);
        queue.push(nextKey);
      }
    }
  }

  const maxReachableDepth = Math.max(-1, ...depthByKey.values());
  for (const [index, actionKey] of actionKeys.entries()) {
    if (!depthByKey.has(actionKey)) depthByKey.set(actionKey, maxReachableDepth + 1 + index);
  }

  const rowByDepth = new Map<number, number>();
  for (const actionKey of actionKeys) {
    const depth = depthByKey.get(actionKey) ?? 0;
    const row = rowByDepth.get(depth) ?? 0;
    positions[actionNodeId(actionKey)] = { x: 380 + depth * 320, y: row * 180 };
    rowByDepth.set(depth, row + 1);
  }

  return positions;
}

function defaultGraphMetadata(triggers: WorkflowTriggerInput[], actions: WorkflowActionInput[]): GraphMetadata {
  return { positions: workflowGraphLayout(triggers, actions) };
}

function updateNodePosition(metadata: GraphMetadata, nodeId: string, position: { x: number; y: number }): GraphMetadata {
  return {
    ...metadata,
    positions: {
      ...(metadata.positions ?? {}),
      [nodeId]: position,
    },
  };
}

function updateViewport(metadata: GraphMetadata, viewport: Viewport): GraphMetadata {
  return {
    ...metadata,
    viewport,
  };
}

function renamePositionKey(metadata: GraphMetadata, previousNodeId: string, nextNodeId: string): GraphMetadata {
  const positions = { ...(metadata.positions ?? {}) };
  const position = positions[previousNodeId];
  if (position) {
    delete positions[previousNodeId];
    positions[nextNodeId] = position;
  }

  return {
    ...metadata,
    positions,
  };
}

function nodeToSelectedNode(nodeId: string): SelectedNode {
  if (nodeId.startsWith("trigger:")) return { kind: "trigger", key: nodeId.slice("trigger:".length) };
  if (nodeId.startsWith("action:")) return { kind: "action", key: nodeId.slice("action:".length) };
  return null;
}

function triggerNodeId(triggerKey: string) {
  return `trigger:${triggerKey}`;
}

function actionNodeId(actionKey: string) {
  return `action:${actionKey}`;
}

function triggerEntryEdgeId(triggerKey: string) {
  return `trigger:${triggerKey}:entry`;
}

function actionEdgeId(actionKey: string, edge: "failure" | "success") {
  return `action:${actionKey}:${edge}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringConfig(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== ""),
  );
}
