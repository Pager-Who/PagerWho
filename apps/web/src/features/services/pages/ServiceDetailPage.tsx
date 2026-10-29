import type {
  EscalationPolicy,
  EscalationPolicyStep,
  Incident,
  OnCallSchedule,
  Team,
  User,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
  WebhookIngestionResult,
} from "@im/contracts";
import type { ReactNode } from "react";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  Button,
  CodeBlock,
  DataTable,
  DescriptionList,
  Dialog,
  DetailPageSkeleton,
  EmptyState,
  ErrorState,
  Field,
  IncidentSeverityBadge,
  IncidentStatusBadge,
  LoadingState,
  PageHeader,
  Panel,
  RefreshingIndicator,
  Select,
  Skeleton,
  ServiceStatusBadge,
  SectionHeader,
  TabButton,
  TextArea,
  TextInput,
  type DataTableColumn,
} from "../../../shared/components";
import { LocalizedText } from "../../../shared/i18n";
import { WebhookIntegrationsPanel } from "../../settings/components/WebhookIntegrationsPanel";
import { formatDateTime, formatDurationSeconds, formatRelativeTime, shortId } from "../../../shared/utils";
import {
  useCreateServiceWebhookEndpointMutation,
  useDeleteServiceMutation,
  useRotateWebhookEndpointSecretMutation,
  useServiceCurrentOnCallForService,
  useServiceDetail,
  useServiceEscalationPolicies,
  useServiceEscalationPolicy,
  useServiceIncidents,
  useServiceOnCallSchedules,
  useServiceTeams,
  useServiceUsers,
  useServiceWebhookEndpoints,
  useTestWebhookEndpointMutation,
  useUpdateServiceMutation,
} from "../queries";

type ServiceDetailTab = "overview" | "incidents" | "webhooks" | "escalation";

type ServiceDetailLocationState = {
  defaultWebhookEndpoint?: WebhookEndpointWithSecret;
};

const webhookSecretStoragePrefix = "pagerwho:webhook-secret:";

export function ServiceDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { serviceId } = useParams();
  const initialWebhookSecret = getInitialWebhookSecret(location.state, serviceId) ?? readStoredWebhookSecret(serviceId);
  const [activeTab, setActiveTab] = useState<ServiceDetailTab>(() => initialWebhookSecret || new URLSearchParams(location.search).get("tab") === "webhooks" ? "webhooks" : "overview");
  const [isEditingService, setIsEditingService] = useState(false);
  const [autoCreatedWebhookServiceId, setAutoCreatedWebhookServiceId] = useState<string | null>(null);
  const [autoRotatedWebhookEndpointId, setAutoRotatedWebhookEndpointId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const serviceQuery = useServiceDetail(serviceId);
  const incidentsQuery = useServiceIncidents(serviceId, { limit: 100 });
  const webhookEndpointsQuery = useServiceWebhookEndpoints(serviceId);
  const teamsQuery = useServiceTeams();
  const usersQuery = useServiceUsers();
  const policiesQuery = useServiceEscalationPolicies();
  const schedulesQuery = useServiceOnCallSchedules();
  const currentOnCallQuery = useServiceCurrentOnCallForService(serviceId);
  const updateServiceMutation = useUpdateServiceMutation(serviceId ?? "");
  const deleteServiceMutation = useDeleteServiceMutation(serviceId ?? "");
  const createWebhookMutation = useCreateServiceWebhookEndpointMutation(serviceId ?? "");
  const rotateWebhookMutation = useRotateWebhookEndpointSecretMutation(serviceId ?? "");
  const testWebhookMutation = useTestWebhookEndpointMutation(serviceId ?? "");
  const [webhookSecret, setWebhookSecret] = useState<WebhookEndpointWithSecret | null>(() => initialWebhookSecret);
  const [serviceForm, setServiceForm] = useState({
    description: "",
    escalationPolicyId: "",
    name: "",
    teamId: "",
  });
  const [escalationPolicySelectionId, setEscalationPolicySelectionId] = useState("");

  const service = serviceQuery.data;
  const escalationPolicyQuery = useServiceEscalationPolicy(service?.escalation_policy_id);

  const incidents = incidentsQuery.data?.items ?? [];
  const activeIncidents = useMemo(() => incidents.filter((incident) => incident.status !== "resolved"), [incidents]);
  const recentIncidents = useMemo(() => incidents.slice(0, 6), [incidents]);
  const webhookEndpoints = webhookEndpointsQuery.data ?? [];
  const activeWebhookEndpoint = useMemo(
    () => webhookEndpoints.find((endpoint) => !endpoint.disabled_at) ?? null,
    [webhookEndpoints],
  );
  const visibleWebhookEndpoint = activeWebhookEndpoint
    ?? (webhookSecret && !webhookSecret.disabled_at ? webhookSecret : null);
  const escalationPolicies = policiesQuery.data ?? [];
  const selectedEscalationPolicy = escalationPolicySelectionId
    ? escalationPolicies.find((policy) => policy.id === escalationPolicySelectionId) ?? escalationPolicyQuery.data
    : null;
  const teamNameById = useMemo(() => createTeamNameMap(teamsQuery.data ?? []), [teamsQuery.data]);
  const userNameById = useMemo(() => createUserNameMap(usersQuery.data ?? []), [usersQuery.data]);
  const scheduleNameById = useMemo(() => createScheduleNameMap(schedulesQuery.data ?? []), [schedulesQuery.data]);
  const primaryOnCall = formatUser(currentOnCallQuery.data?.primary_user_id ?? null, userNameById);
  const secondaryOnCall = formatUser(currentOnCallQuery.data?.secondary_user_id ?? null, userNameById);
  const incidentColumns = useMemo<Array<DataTableColumn<Incident>>>(
    () => createIncidentColumns((incident) => navigate(`/incidents/${incident.id}`)),
    [navigate],
  );
  const supportError = incidentsQuery.error
    ?? webhookEndpointsQuery.error
    ?? teamsQuery.error
    ?? usersQuery.error
    ?? policiesQuery.error
    ?? schedulesQuery.error
    ?? currentOnCallQuery.error
    ?? escalationPolicyQuery.error;

  useEffect(() => {
    const nextWebhookSecret = getInitialWebhookSecret(location.state, serviceId);

    if (nextWebhookSecret) {
      writeStoredWebhookSecret(nextWebhookSecret);
      setWebhookSecret(nextWebhookSecret);
      setActiveTab("webhooks");
      return;
    }

    setWebhookSecret((current) => {
      if (current?.service_id === serviceId) {
        return current;
      }

      return readStoredWebhookSecret(serviceId);
    });
  }, [location.state, serviceId]);

  useEffect(() => {
    if (!serviceId || !activeWebhookEndpoint) return;

    setWebhookSecret((current) => {
      if (current?.id === activeWebhookEndpoint.id) {
        return current;
      }

      const storedSecret = readStoredWebhookSecret(serviceId);
      return storedSecret?.id === activeWebhookEndpoint.id ? storedSecret : null;
    });
  }, [activeWebhookEndpoint?.id, serviceId]);

  useEffect(() => {
    if (!serviceId || activeTab !== "webhooks") return;
    if (webhookEndpointsQuery.isLoading || webhookEndpointsQuery.isFetching) return;
    if (webhookEndpoints.length > 0 || createWebhookMutation.isPending) return;
    if (autoCreatedWebhookServiceId === serviceId) return;

    setAutoCreatedWebhookServiceId(serviceId);
    createWebhookMutation.mutateAsync()
      .then((created) => {
        writeStoredWebhookSecret(created);
        setWebhookSecret(created);
      })
      .catch(() => {
        // The mutation error is rendered by the webhook panel.
      });
  }, [
    activeTab,
    autoCreatedWebhookServiceId,
    createWebhookMutation,
    serviceId,
    webhookEndpoints.length,
    webhookEndpointsQuery.isFetching,
    webhookEndpointsQuery.isLoading,
  ]);

  useEffect(() => {
    if (!serviceId || activeTab !== "webhooks" || !activeWebhookEndpoint) return;
    if (webhookSecret?.id === activeWebhookEndpoint.id) return;
    if (readStoredWebhookSecret(serviceId)?.id === activeWebhookEndpoint.id) return;
    if (rotateWebhookMutation.isPending || autoRotatedWebhookEndpointId === activeWebhookEndpoint.id) return;

    setAutoRotatedWebhookEndpointId(activeWebhookEndpoint.id);
    rotateWebhookMutation.mutateAsync(activeWebhookEndpoint.id)
      .then((rotated) => {
        writeStoredWebhookSecret(rotated);
        setWebhookSecret(rotated);
      })
      .catch(() => {
        // The mutation error is rendered by the webhook panel.
      });
  }, [
    activeTab,
    activeWebhookEndpoint,
    autoRotatedWebhookEndpointId,
    rotateWebhookMutation,
    serviceId,
    webhookSecret?.id,
  ]);

  useEffect(() => {
    if (!service || updateServiceMutation.isPending) return;
    setServiceForm({
      description: service.description ?? "",
      escalationPolicyId: service.escalation_policy_id ?? "",
      name: service.name,
      teamId: service.team_id ?? "",
    });
    setEscalationPolicySelectionId(service.escalation_policy_id ?? "");
  }, [service, updateServiceMutation.isPending]);

  async function handleUpdateService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateServiceMutation.mutateAsync({
      name: serviceForm.name.trim(),
      description: serviceForm.description.trim() || null,
      team_id: serviceForm.teamId || null,
      escalation_policy_id: serviceForm.escalationPolicyId || null,
    });
    setIsEditingService(false);
  }

  async function handleEscalationPolicyChange(event: React.ChangeEvent<HTMLSelectElement>) {
    if (!service) return;

    const escalationPolicyId = event.target.value;
    const previousEscalationPolicyId = service.escalation_policy_id ?? "";
    setEscalationPolicySelectionId(escalationPolicyId);
    setServiceForm((current) => ({
      ...current,
      escalationPolicyId,
    }));

    try {
      await updateServiceMutation.mutateAsync({
        escalation_policy_id: escalationPolicyId || null,
      });
    } catch {
      setEscalationPolicySelectionId(previousEscalationPolicyId);
      setServiceForm((current) => ({
        ...current,
        escalationPolicyId: previousEscalationPolicyId,
      }));
    }
  }

  async function handleCreateWebhook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await createWebhookMutation.mutateAsync();
    writeStoredWebhookSecret(created);
    setWebhookSecret(created);
  }

  async function handleDeleteService() {
    if (!service) return;

    await deleteServiceMutation.mutateAsync();
    setIsDeleteDialogOpen(false);
    navigate("/services");
  }

  async function handleRotateWebhook(endpointId: string) {
    const rotated = await rotateWebhookMutation.mutateAsync(endpointId);
    writeStoredWebhookSecret(rotated);
    setWebhookSecret(rotated);
  }

  async function handleTestWebhook(endpointId: string, payload: unknown) {
    return testWebhookMutation.mutateAsync({ endpointId, payload });
  }

  if (!serviceId) {
    return (
      <LocalizedText>
        <section className="grid gap-4">
          <ErrorState
            action={
              <Link className="flex text-ink-muted text-[13px] font-[650] leading-none no-underline hover:text-ink" to="/services">
                Back to services
              </Link>
            }
            title="Service id is missing"
          />
        </section>
      </LocalizedText>
    );
  }

  return (
    <LocalizedText>
      <section className="grid gap-4">
      <PageHeader
        description={service ? (
          <span className="flex items-center flex-wrap gap-2.25 text-ink-muted text-[13px]">
            <ServiceStatusBadge status={service.status} />
            <span>{formatTeam(service.team_id, teamNameById)}</span>
            <span>{service.open_incident_count} open incidents</span>
          </span>
        ) : <Skeleton className="h-4 w-72 max-w-full" />}
        eyebrow={<Link className="text-ink-muted text-[13px] font-[650] leading-none no-underline hover:text-ink" to="/services">← Services</Link>}
        help="Manage this service's ownership, alert intake, incidents, and escalation policy from one place."
        title={service?.name ?? "Service"}
      />

      {serviceQuery.isLoading ? <DetailPageSkeleton label="Loading service detail" /> : null}
      {serviceQuery.error ? <ErrorState error={serviceQuery.error} onRetry={() => void serviceQuery.refetch()} title="Could not load service" /> : null}
      {!serviceQuery.error && supportError ? <ErrorState error={supportError} onRetry={() => Promise.all([incidentsQuery.refetch(), webhookEndpointsQuery.refetch(), teamsQuery.refetch(), usersQuery.refetch(), policiesQuery.refetch(), schedulesQuery.refetch(), currentOnCallQuery.refetch(), escalationPolicyQuery.refetch()])} title="Some service metadata could not be loaded" /> : null}

      {service ? (
        <>
          <Panel className="grid items-start gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 min-w-0">
              <ServiceSignal label="Status" value={<ServiceStatusBadge status={service.status} />} />
              <ServiceSignal label="Escalation policy" value={escalationPolicyQuery.data?.name ?? "No policy"} />
              <ServiceSignal label="Open incidents" value={service.open_incident_count} />
              <ServiceSignal label="Webhook" value={visibleWebhookEndpoint ? "Active" : "Not configured"} />
            </div>
            <div className="flex items-center flex-wrap gap-2 justify-start xl:justify-end min-w-0">
              <Button
                onClick={() => {
                  setIsEditingService(true);
                  setActiveTab("overview");
                }}
                size="sm"
                variant="ghost"
              >
                Edit service
              </Button>
              <Button
                disabled={deleteServiceMutation.isPending}
                isLoading={deleteServiceMutation.isPending}
                onClick={() => setIsDeleteDialogOpen(true)}
                size="sm"
                variant="danger"
              >
                Delete service
              </Button>
            </div>
          </Panel>
          {deleteServiceMutation.error ? <ErrorState error={deleteServiceMutation.error} title="Could not delete service" /> : null}

          <Panel className="grid gap-4.5">
            <div aria-label="Service detail sections" className="flex items-center gap-1 border-b border-hairline-soft pb-2.5 overflow-x-auto" role="tablist">
              <TabButton active={activeTab === "overview"} label="Overview" onClick={() => setActiveTab("overview")} />
              <TabButton active={activeTab === "incidents"} count={incidents.length} label="Incidents" onClick={() => setActiveTab("incidents")} />
              <TabButton active={activeTab === "webhooks"} label="Webhook" onClick={() => setActiveTab("webhooks")} />
              <TabButton active={activeTab === "escalation"} label="Escalation" onClick={() => setActiveTab("escalation")} />
            </div>

            <div className="rounded-lg border border-hairline-soft bg-surface-2/45 px-3.5 py-3 text-ink-muted text-xs leading-[1.45]">
              {activeTab === "overview"
                ? "Review ownership and service metadata. Edit the service here when its owner or routing changes."
                : activeTab === "incidents"
                  ? "See active and recent incidents created for this service, then open one to continue the response."
                  : activeTab === "webhooks"
                    ? "Connect your monitoring system, copy the webhook URL, and send a test event before going live."
                    : "Choose the escalation policy that defines who should be notified when this service needs attention."}
            </div>

            {activeTab === "overview" ? (
              <div className="grid gap-4 min-w-0" role="tabpanel">
                {isEditingService ? (
                  <ServiceEditForm
                    escalationPolicies={escalationPolicies}
                    isSaving={updateServiceMutation.isPending}
                    policiesLoading={policiesQuery.isLoading}
                    serviceForm={serviceForm}
                    teams={teamsQuery.data ?? []}
                    updateError={updateServiceMutation.error}
                    onCancel={() => {
                      setServiceForm({
                        description: service.description ?? "",
                        escalationPolicyId: service.escalation_policy_id ?? "",
                        name: service.name,
                        teamId: service.team_id ?? "",
                      });
                      setIsEditingService(false);
                    }}
                    onChange={setServiceForm}
                    onSubmit={handleUpdateService}
                  />
                ) : (
                  <div className="grid items-start gap-4.5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
                    <DescriptionList
                      items={[
                        ["Service", service.name],
                        ["Owner team", formatTeam(service.team_id, teamNameById)],
                        ["Escalation policy", escalationPolicyQuery.data?.name ?? "No policy"],
                        ["Created", formatDateTime(service.created_at)],
                        ["Updated", formatDateTime(service.updated_at)],
                      ]}
                    />
                    <div className="border-l border-hairline grid gap-2.5 min-w-0 pl-3.5">
                      <span className="text-ink-subtle text-xs font-bold leading-none uppercase">Description</span>
                      <p className="text-ink-muted text-[13px] leading-[1.55] m-0">
                        {service.description ?? "No description has been recorded for this service."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {activeTab === "incidents" ? (
              <div className="grid gap-4 min-w-0" role="tabpanel">
                <div className="grid items-start gap-4.5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)] min-w-0">
                  <section className="grid gap-4 min-w-0">
                    <SectionHeader
                      description="Incidents that still need acknowledgement or resolution."
                      title="Active incidents"
                    />
                    {incidentsQuery.isLoading ? (
                      <LoadingState message="Loading service incidents..." />
                    ) : (
                      <DataTable
                        columns={incidentColumns}
                        emptyState={<EmptyState message="No active incidents are attached to this service." title="No active incidents" />}
                        getRowKey={(incident) => incident.id}
                        onRowClick={(incident) => navigate(`/incidents/${incident.id}`)}
                        rows={activeIncidents}
                      />
                    )}
                  </section>
                  <section className="grid gap-4 min-w-0">
                    <SectionHeader
                      description="The latest incidents associated with this service."
                      title="Recent incidents"
                    />
                    {incidentsQuery.isLoading ? (
                      <LoadingState message="Loading recent incidents..." />
                    ) : (
                      <DataTable
                        columns={incidentColumns}
                        emptyState={<EmptyState message="No incidents have been attached to this service." title="No incidents" />}
                        getRowKey={(incident) => incident.id}
                        onRowClick={(incident) => navigate(`/incidents/${incident.id}`)}
                        rows={recentIncidents}
                      />
                    )}
                  </section>
                </div>
              </div>
            ) : null}

            {activeTab === "webhooks" ? (
              <div className="grid gap-4 min-w-0" role="tabpanel">
                {webhookEndpointsQuery.isLoading ? <LoadingState message="Loading webhook..." /> : null}
                {!webhookEndpointsQuery.isLoading ? (
                  <WebhookPanel
                    createError={createWebhookMutation.error}
                    endpoint={visibleWebhookEndpoint}
                    isCreating={createWebhookMutation.isPending}
                    isRotating={rotateWebhookMutation.isPending}
                    isTesting={testWebhookMutation.isPending}
                    rotateError={rotateWebhookMutation.error}
                    testError={testWebhookMutation.error}
                    webhookSecret={webhookSecret}
                    onCreate={handleCreateWebhook}
                    onRotate={handleRotateWebhook}
                    onTest={handleTestWebhook}
                  />
                ) : null}
                <section className="grid gap-3 min-w-0">
                  <SectionHeader
                    description="Route this service to the project webhook, a service-specific destination, or both."
                    title="Outbound webhook routing"
                  />
                  <WebhookIntegrationsPanel canManage serviceId={serviceId} workspaceId={service?.workspace_id} />
                </section>
              </div>
            ) : null}

            {activeTab === "escalation" ? (
              <div className="grid gap-4 min-w-0" role="tabpanel">
                <div className="grid items-start gap-4.5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)] min-w-0">
                  <section className="grid gap-4 min-w-0">
                    <Panel className="grid gap-3 rounded-xl" padding="sm" tone="secondary">
                      <Field label="Escalation policy">
                        <Select
                          disabled={updateServiceMutation.isPending || policiesQuery.isLoading}
                          onChange={handleEscalationPolicyChange}
                          value={escalationPolicySelectionId}
                        >
                          <option value="">No policy</option>
                          {escalationPolicies.map((policy) => (
                            <option key={policy.id} value={policy.id}>{policy.name}</option>
                          ))}
                        </Select>
                      </Field>
                      {policiesQuery.isLoading ? <RefreshingIndicator label="Loading policies..." /> : null}
                      {updateServiceMutation.isPending ? <span className="text-ink-muted text-xs">Saving policy...</span> : null}
                      {updateServiceMutation.error ? <ErrorState error={updateServiceMutation.error} title="Could not update escalation policy" /> : null}
                    </Panel>
                    {escalationPolicyQuery.isLoading || policiesQuery.isLoading ? <LoadingState message="Loading escalation policy..." /> : null}
                    {!escalationPolicyQuery.isLoading && !policiesQuery.isLoading && selectedEscalationPolicy ? (
                      <EscalationPolicyPanel
                        policy={selectedEscalationPolicy}
                        scheduleNameById={scheduleNameById}
                        teamNameById={teamNameById}
                        userNameById={userNameById}
                      />
                    ) : null}
                    {!escalationPolicyQuery.isLoading && !policiesQuery.isLoading && !selectedEscalationPolicy ? (
                      <EmptyState
                        message={escalationPolicies.length > 0
                          ? "Select an escalation policy for this service."
                          : "No escalation policies are available in this workspace."}
                        title="No policy"
                      />
                    ) : null}
                  </section>
                  <section className="grid gap-4 min-w-0">
                    <SectionHeader
                      description="The people or schedules the selected policy will notify."
                      title="Responder targets"
                    />
                    {selectedEscalationPolicy ? (
                      <ResponderTargetsPanel
                        policy={selectedEscalationPolicy}
                        isOnCallLoading={currentOnCallQuery.isLoading}
                        primaryOnCall={primaryOnCall}
                        scheduleNameById={scheduleNameById}
                        secondaryOnCall={secondaryOnCall}
                        teamNameById={teamNameById}
                        userNameById={userNameById}
                      />
                    ) : (
                      <EmptyState message="Select an escalation policy to see responder targets." title="No targets" />
                    )}
                  </section>
                </div>
              </div>
            ) : null}

          </Panel>
        </>
      ) : null}
      <Dialog
        confirmLabel="Delete service"
        description={service ? `Delete ${service.name}? This cannot be undone.` : undefined}
        isConfirming={deleteServiceMutation.isPending}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => void handleDeleteService()}
        open={isDeleteDialogOpen}
        title="Delete service?"
        tone="danger"
      />
      </section>
    </LocalizedText>
  );
}

function ServiceSignal({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-l border-hairline grid gap-2 min-w-0 pl-3">
      <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">{label}</span>
      <strong className="flex items-center text-ink text-[13px] font-[650] leading-[1.3] min-h-6 min-w-0 overflow-wrap-anywhere">
        {value}
      </strong>
    </div>
  );
}

function WebhookPanel({
  createError,
  endpoint,
  isCreating,
  isRotating,
  isTesting,
  onCreate,
  onRotate,
  onTest,
  rotateError,
  testError,
  webhookSecret,
}: {
  createError: unknown;
  endpoint: WebhookEndpoint | null;
  isCreating: boolean;
  isRotating: boolean;
  isTesting: boolean;
  onCreate: (event: React.FormEvent<HTMLFormElement>) => void;
  onRotate: (endpointId: string) => void | Promise<void>;
  onTest: (endpointId: string, payload: unknown) => Promise<WebhookIngestionResult>;
  rotateError: unknown;
  testError: unknown;
  webhookSecret: WebhookEndpointWithSecret | null;
}) {
  const visibleSecret = endpoint && webhookSecret?.id === endpoint.id ? webhookSecret : null;
  const [testPayload, setTestPayload] = useState(() => JSON.stringify(createDefaultWebhookPayload(), null, 2));
  const [testResult, setTestResult] = useState<WebhookIngestionResult | null>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);

  async function handleTestSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPayloadError(null);
    setTestResult(null);

    let payload: unknown;

    try {
      payload = JSON.parse(testPayload);
    } catch (error) {
      setPayloadError(error instanceof Error ? error.message : "Payload must be valid JSON.");
      return;
    }

    if (!endpoint) return;

    setTestResult(await onTest(endpoint.id, payload));
  }

  if (!endpoint) {
    return (
      <form className="grid gap-4 w-full" onSubmit={onCreate}>
        <Panel className="grid gap-4 p-5" tone="secondary">
          <div className="grid gap-1.5">
            <span className="text-accent text-[11px] font-[800] leading-none uppercase">Connect a source</span>
            <h3 className="text-ink text-[18px] font-[700] leading-tight m-0">Send alerts to this service</h3>
            <p className="text-ink-muted text-sm leading-[1.5] m-0 max-w-160">
              Create a webhook URL, add it to your monitoring tool, and send a test event to confirm the full incident flow.
            </p>
          </div>
          <ol className="grid gap-2 sm:grid-cols-3 list-none m-0 p-0">
            {[
              ["1", "Create a webhook", "Generate the service endpoint."],
              ["2", "Add it to your monitor", "Use the URL in your alert integration."],
              ["3", "Send a test event", "Confirm an incident is created."],
            ].map(([step, title, description]) => (
              <li className="grid gap-1 rounded-lg border border-hairline-soft bg-surface-1 p-3" key={step}>
                <span className="text-accent text-xs font-[800]">{step}</span>
                <strong className="text-ink text-sm font-[650] leading-tight">{title}</strong>
                <span className="text-ink-muted text-xs leading-[1.4]">{description}</span>
              </li>
            ))}
          </ol>
          <div className="flex justify-end">
            <Button disabled={isCreating} isLoading={isCreating} type="submit" variant="primary">
              Create webhook
            </Button>
          </div>
        </Panel>
        {createError ? <ErrorState error={createError} title="Could not create webhook" /> : null}
      </form>
    );
  }

  return (
    <section className="grid gap-4 w-full">
      <Panel className="rounded-xl grid gap-3 w-full" padding="sm" tone="secondary">
        <div className="flex items-start justify-between gap-4 min-w-0">
          <div className="grid gap-1 min-w-0">
            <strong className="text-ink text-[15px] font-[650] leading-[1.3]">Service webhook</strong>
            <span className="text-ink-muted text-xs leading-[1.35]">
              Created {formatRelativeTime(endpoint.created_at)}
            </span>
          </div>
          <span className="bg-[rgba(95,214,151,0.12)] border border-[rgba(95,214,151,0.24)] rounded-full text-[#8af0b7] text-[11px] font-bold leading-none px-2.5 py-1.5">
            Active
          </span>
        </div>
        <div className="grid gap-1.5 min-w-0">
          <span className="text-ink-subtle text-xs font-bold uppercase">Webhook URL</span>
          <CodeBlock>
            {visibleSecret?.url_with_secret ?? endpoint.url}
          </CodeBlock>
          {visibleSecret ? (
            <span className="text-ink-muted text-xs leading-[1.35]">
              This secret is shown once. Store the URL now.
            </span>
          ) : null}
        </div>
        {visibleSecret ? (
          <div className="grid gap-1.5 min-w-0">
            <span className="text-ink-subtle text-xs font-bold uppercase">Secret token</span>
            <CodeBlock>
              {visibleSecret.secret}
            </CodeBlock>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2.5 justify-end">
          <Button
            disabled={isRotating}
            isLoading={isRotating}
            onClick={() => onRotate(endpoint.id)}
            variant="secondary"
          >
            Rotate secret
          </Button>
        </div>
      </Panel>
      {rotateError ? <ErrorState error={rotateError} title="Could not rotate webhook" /> : null}
      <form className="bg-surface-2 border border-hairline rounded-xl grid gap-3.5 min-w-0 p-3 w-full" onSubmit={handleTestSubmit}>
        <div className="grid gap-1 min-w-0">
          <strong className="text-ink text-[15px] font-[650] leading-[1.3]">Test webhook</strong>
          <span className="text-ink-muted text-xs leading-[1.45]">
            Sends a real lifecycle event through this endpoint. Send the trigger sample first, then change it to resolved with the same event_key to resolve that incident.
          </span>
        </div>
        <div className="bg-warning/10 border border-warning/18 rounded-md text-warning text-xs leading-[1.45] p-2.5">
          A repeated triggered event is deduplicated. A repeated event_key with status resolved resolves its existing incident.
        </div>
        <Field error={payloadError} label="Payload JSON" required>
          <TextArea
            className="font-mono min-h-56 text-xs"
            disabled={isTesting}
            onChange={(event) => {
              setTestPayload(event.target.value);
              setPayloadError(null);
            }}
            required
            spellCheck={false}
            value={testPayload}
          />
        </Field>
        {testError ? <ErrorState error={testError} title="Webhook test failed" /> : null}
        {testResult ? <WebhookTestResult result={testResult} /> : null}
        <div className="flex flex-wrap gap-2.5 justify-end">
          <Button
            disabled={isTesting}
            onClick={() => {
              setTestPayload(JSON.stringify(createDefaultWebhookPayload(), null, 2));
              setPayloadError(null);
              setTestResult(null);
            }}
            variant="ghost"
          >
            New trigger sample
          </Button>
          <Button
            disabled={isTesting}
            onClick={() => {
              setTestPayload(createResolveWebhookPayload(testPayload));
              setPayloadError(null);
              setTestResult(null);
            }}
            variant="secondary"
          >
            Change to resolve
          </Button>
          <Button disabled={isTesting} isLoading={isTesting} type="submit" variant="primary">
            Send test webhook
          </Button>
        </div>
      </form>
    </section>
  );
}

function WebhookTestResult({ result }: { result: WebhookIngestionResult }) {
  return (
    <Panel className="rounded-lg grid gap-3" padding="sm" tone="subtle">
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="grid gap-1 min-w-0">
          <strong className="text-ink text-sm font-[650] leading-[1.3]">Webhook accepted</strong>
          <span className="text-ink-muted text-xs leading-[1.35] overflow-wrap-anywhere">
            {result.normalized_event.title}
          </span>
        </div>
        <span className="bg-accent/14 rounded-full text-[#72c7ff] text-[11px] font-bold leading-none px-2.5 py-1.5 capitalize">
          {result.action}
        </span>
      </div>
      <DescriptionList
        items={[
          ["Incident", (
            <Link className="text-ink no-underline hover:text-accent-blue" to={`/incidents/${result.incident.id}`}>
              {result.incident.title}
            </Link>
          )],
          ["Status", result.incident.status],
          ["Severity", result.normalized_event.severity],
          ["Priority", result.normalized_event.priority],
          ["Source", result.normalized_event.source],
          ["Event key", result.normalized_event.event_key],
          ["Fingerprint", result.normalized_event.fingerprint],
        ]}
      />
    </Panel>
  );
}

function createDefaultWebhookPayload() {
  const eventKey = `service-webhook-smoke-${Date.now()}`;

  return {
    title: "Checkout API latency spike",
    description: "Created from the service webhook test panel",
    details: {
      metric: "http.server.duration.p95",
      threshold: "3s",
      value: "3.4s",
    },
    severity: "critical",
    priority: "P1",
    event_key: eventKey,
    fingerprint: eventKey,
    source: "service-detail-test",
    status: "triggered",
  };
}

function createResolveWebhookPayload(currentPayload: string) {
  try {
    const parsed = JSON.parse(currentPayload) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return JSON.stringify({ ...parsed, status: "resolved" }, null, 2);
    }
  } catch {
    // Replace malformed input with a usable resolve example.
  }

  const sample = createDefaultWebhookPayload();
  return JSON.stringify({ ...sample, status: "resolved" }, null, 2);
}

function ServiceEditForm({
  escalationPolicies,
  isSaving,
  onCancel,
  onChange,
  onSubmit,
  policiesLoading,
  serviceForm,
  teams,
  updateError,
}: {
  escalationPolicies: EscalationPolicy[];
  isSaving: boolean;
  onCancel: () => void;
  onChange: React.Dispatch<React.SetStateAction<{
    description: string;
    escalationPolicyId: string;
    name: string;
    teamId: string;
  }>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  policiesLoading: boolean;
  serviceForm: {
    description: string;
    escalationPolicyId: string;
    name: string;
    teamId: string;
  };
  teams: Team[];
  updateError: unknown;
}) {
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <h3 className="text-ink text-[17px] font-[600] leading-tight m-0 mb-1.25">Edit service</h3>
      {!policiesLoading && escalationPolicies.length === 0 ? (
        <Panel className="rounded-md grid gap-2" padding="sm" tone="secondary">
          <strong className="text-ink text-sm font-[650] leading-tight">No escalation policies yet</strong>
          <p className="text-ink-muted text-[13px] leading-[1.45] m-0">No existing policy can be connected to this service yet.</p>
        </Panel>
      ) : null}
      <div className="grid gap-3.5 grid-cols-2">
        <Field label="Name" required>
          <TextInput
            disabled={isSaving}
            onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
            required
            value={serviceForm.name}
          />
        </Field>
        <Field label="Escalation policy">
          <Select
            disabled={isSaving || policiesLoading}
            onChange={(event) => onChange((current) => ({ ...current, escalationPolicyId: event.target.value }))}
            value={serviceForm.escalationPolicyId}
          >
            <option value="">No policy</option>
            {escalationPolicies.map((policy) => (
              <option key={policy.id} value={policy.id}>{policy.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Owner team">
          <Select
            disabled={isSaving}
            onChange={(event) => onChange((current) => ({ ...current, teamId: event.target.value }))}
            value={serviceForm.teamId}
          >
            <option value="">No owner team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </Select>
        </Field>
        <div className="col-span-full">
          <Field label="Description">
            <TextArea
              disabled={isSaving}
              onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))}
              value={serviceForm.description}
            />
          </Field>
        </div>
      </div>
      {updateError ? <ErrorState error={updateError} title="Could not update service" /> : null}
      <div className="flex flex-wrap gap-2.5 justify-end">
        <Button disabled={isSaving} onClick={onCancel} variant="ghost">
          Cancel
        </Button>
        <Button disabled={isSaving} isLoading={isSaving} type="submit" variant="primary">
          Save service
        </Button>
      </div>
    </form>
  );
}

function EscalationPolicyPanel({
  policy,
  scheduleNameById,
  teamNameById,
  userNameById,
}: {
  policy: EscalationPolicy;
  scheduleNameById: Map<string, string>;
  teamNameById: Map<string, string>;
  userNameById: Map<string, string>;
}) {
  return (
    <div className="grid gap-4.5 min-w-0">
      <DescriptionList
        items={[
          ["Policy", policy.name],
          ["Repeat", policy.repeat_enabled ? "Enabled" : "Disabled"],
          ["Repeat interval", formatDurationSeconds(policy.repeat_interval_seconds)],
          ["Repeat limit", policy.repeat_limit ?? "Unlimited"],
        ]}
      />
      <ol className="grid gap-2 list-none m-0 p-0">
        {policy.steps.map((step) => (
          <li className="bg-surface-2/55 border border-hairline-soft rounded-xl items-center grid gap-2.5 grid-cols-[64px_minmax(0,1fr)_auto] px-3 py-2.5" key={step.id}>
            <span className="text-ink-subtle text-xs font-bold uppercase">Step {step.step_order}</span>
            <strong className="text-ink text-[13px] leading-[1.35]">
              {formatPolicyTarget(step, { scheduleNameById, teamNameById, userNameById })}
            </strong>
            <em className="text-ink-muted text-xs not-italic">{formatDurationSeconds(step.delay_seconds)}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ResponderTargetsPanel({
  isOnCallLoading,
  policy,
  primaryOnCall,
  scheduleNameById,
  secondaryOnCall,
  teamNameById,
  userNameById,
}: {
  isOnCallLoading: boolean;
  policy: EscalationPolicy;
  primaryOnCall: string;
  scheduleNameById: Map<string, string>;
  secondaryOnCall: string;
  teamNameById: Map<string, string>;
  userNameById: Map<string, string>;
}) {
  return (
    <ol className="grid gap-2 list-none m-0 p-0">
      {policy.steps.map((step) => {
        const target = formatResponderTarget(step, {
          primaryOnCall,
          scheduleNameById,
          secondaryOnCall,
          teamNameById,
          userNameById,
        });

        return (
          <li className="bg-surface-2/55 border border-hairline-soft rounded-xl grid gap-1.5 min-w-0 px-3 py-2.5" key={step.id}>
            <div className="flex items-center justify-between gap-3 min-w-0">
              <span className="text-ink-subtle text-xs font-bold uppercase">Step {step.step_order}</span>
              <em className="text-ink-muted text-xs not-italic">{formatStepDelay(step.delay_seconds)}</em>
            </div>
            <strong className="text-ink text-[13px] font-[650] leading-[1.35] overflow-wrap-anywhere">
              {isOnCallLoading && (step.target_type === "primary_on_call" || step.target_type === "secondary_on_call")
                ? <RefreshingIndicator label="Loading responder..." />
                : target.name}
            </strong>
            <span className="text-ink-muted text-xs leading-[1.35] overflow-wrap-anywhere">
              {target.detail}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function createIncidentColumns(onOpen: (incident: Incident) => void): Array<DataTableColumn<Incident>> {
  return [
    {
      header: "Incident",
      key: "incident",
      render: (incident) => (
        <button
          className="bg-transparent border-0 text-ink cursor-pointer font-[inherit] font-[650] p-0 text-left hover:text-accent-blue"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(incident);
          }}
          type="button"
        >
          {incident.title}
        </button>
      ),
    },
    {
      header: "Severity",
      key: "severity",
      render: (incident) => <IncidentSeverityBadge severity={incident.severity} />,
      width: 110,
    },
    {
      header: "Status",
      key: "status",
      render: (incident) => <IncidentStatusBadge status={incident.status} />,
      width: 140,
    },
    {
      header: "Updated",
      key: "updated_at",
      render: (incident) => (
        <time dateTime={incident.updated_at} title={formatDateTime(incident.updated_at)}>
          {formatRelativeTime(incident.updated_at)}
        </time>
      ),
      width: 150,
    },
  ];
}

function getInitialWebhookSecret(state: unknown, serviceId: string | undefined): WebhookEndpointWithSecret | null {
  const candidate = (state as ServiceDetailLocationState | null)?.defaultWebhookEndpoint;

  if (!candidate || !serviceId || candidate.service_id !== serviceId) {
    return null;
  }

  return candidate;
}

function readStoredWebhookSecret(serviceId: string | undefined): WebhookEndpointWithSecret | null {
  if (!serviceId || typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(getWebhookSecretStorageKey(serviceId));

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as unknown;
    return isWebhookEndpointWithSecret(parsed) && parsed.service_id === serviceId ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredWebhookSecret(endpoint: WebhookEndpointWithSecret) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getWebhookSecretStorageKey(endpoint.service_id), JSON.stringify(endpoint));
  } catch {
    // The current render still shows the secret even when browser storage is unavailable.
  }
}

function getWebhookSecretStorageKey(serviceId: string) {
  return `${webhookSecretStoragePrefix}${serviceId}`;
}

function isWebhookEndpointWithSecret(value: unknown): value is WebhookEndpointWithSecret {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Record<keyof WebhookEndpointWithSecret, unknown>>;

  return typeof candidate.id === "string"
    && typeof candidate.service_id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.url === "string"
    && typeof candidate.has_secret === "boolean"
    && typeof candidate.created_at === "string"
    && (candidate.disabled_at === null || typeof candidate.disabled_at === "string")
    && typeof candidate.secret === "string"
    && typeof candidate.url_with_secret === "string";
}

function createTeamNameMap(teams: Team[]) {
  return new Map(teams.map((team) => [team.id, team.name]));
}

function createUserNameMap(users: User[]) {
  return new Map(users.map((user) => [user.id, user.name]));
}

function createScheduleNameMap(schedules: OnCallSchedule[]) {
  return new Map(schedules.map((schedule) => [schedule.id, schedule.name]));
}

function formatPolicyTarget(
  step: EscalationPolicyStep,
  maps: {
    scheduleNameById: Map<string, string>;
    teamNameById: Map<string, string>;
    userNameById: Map<string, string>;
  },
) {
  if (step.target_type === "primary_on_call") {
    const scheduleName = step.target_id ? maps.scheduleNameById.get(step.target_id) : null;
    return scheduleName ? `${scheduleName} · Primary responder` : "Primary responder";
  }

  if (step.target_type === "secondary_on_call") {
    const scheduleName = step.target_id ? maps.scheduleNameById.get(step.target_id) : null;
    return scheduleName ? `${scheduleName} · Secondary responder` : "Secondary responder";
  }

  if (step.target_type === "team_channel") return "Webhook";
  if (step.target_type === "team") return step.target_id ? maps.teamNameById.get(step.target_id) ?? shortId(step.target_id) : "Team";
  if (step.target_type === "webhook") return "Webhook";
  return step.target_id ? maps.userNameById.get(step.target_id) ?? shortId(step.target_id) : "User";
}

function formatResponderTarget(
  step: EscalationPolicyStep,
  context: {
    primaryOnCall: string;
    scheduleNameById: Map<string, string>;
    secondaryOnCall: string;
    teamNameById: Map<string, string>;
    userNameById: Map<string, string>;
  },
) {
  if (step.target_type === "primary_on_call") {
    const scheduleName = step.target_id ? context.scheduleNameById.get(step.target_id) : null;
    return {
      detail: scheduleName ? `${scheduleName} · Primary responder` : "Primary responder",
      name: context.primaryOnCall,
    };
  }

  if (step.target_type === "secondary_on_call") {
    const scheduleName = step.target_id ? context.scheduleNameById.get(step.target_id) : null;
    return {
      detail: scheduleName ? `${scheduleName} · Secondary responder` : "Secondary responder",
      name: context.secondaryOnCall,
    };
  }

  if (step.target_type === "team") {
    return {
      detail: "Team",
      name: step.target_id ? context.teamNameById.get(step.target_id) ?? shortId(step.target_id) : "Team",
    };
  }

  if (step.target_type === "team_channel") {
    return {
      detail: "Webhook notification",
      name: "Webhook",
    };
  }

  if (step.target_type === "webhook") {
    return {
      detail: "Webhook notification",
      name: "Webhook",
    };
  }

  return {
    detail: "Direct user",
    name: step.target_id ? context.userNameById.get(step.target_id) ?? shortId(step.target_id) : "User",
  };
}

function formatStepDelay(delaySeconds: number) {
  return delaySeconds === 0 ? "Immediately" : `After ${formatDurationSeconds(delaySeconds)}`;
}

function formatUser(userId: string | null, userNameById: Map<string, string>) {
  if (!userId) return "Unassigned";
  return userNameById.get(userId) ?? shortId(userId);
}

function formatTeam(teamId: string | null, teamNameById: Map<string, string>) {
  if (!teamId) return "No owner team";
  return teamNameById.get(teamId) ?? shortId(teamId);
}
