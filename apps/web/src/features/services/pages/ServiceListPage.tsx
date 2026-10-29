import type { EscalationPolicy, Service, ServiceStatus } from "@im/contracts";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  TablePageSkeleton,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  ServiceStatusBadge,
  TextArea,
  TextInput,
  type DataTableColumn,
} from "../../../shared/components";
import { useAuth } from "../../../shared/auth";
import { LocalizedText } from "../../../shared/i18n";
import { cn, shortId } from "../../../shared/utils";
import {
  useCreateServiceMutation,
  useServiceEscalationPolicies,
  useServiceList,
  useServiceTeams,
  useServiceWorkspaceUsage,
} from "../queries";

const impactedStatuses = ["degraded", "major", "critical"] as const satisfies readonly ServiceStatus[];
type ServiceViewFilter = "all" | "impacted" | "normal";

export function ServiceListPage() {
  const navigate = useNavigate();
  const { projectId } = useAuth();
  const [viewFilter, setViewFilter] = useState<ServiceViewFilter>("all");
  const [pageCursors, setPageCursors] = useState<string[]>([]);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    description: "",
    escalationPolicyId: "",
    name: "",
    teamId: "",
  });
  const servicesQuery = useServiceList(pageCursors.at(-1), viewFilter === "all" ? undefined : viewFilter);
  const teamsQuery = useServiceTeams();
  const policiesQuery = useServiceEscalationPolicies();
  const usageQuery = useServiceWorkspaceUsage();
  const createServiceMutation = useCreateServiceMutation();

  const services = servicesQuery.data?.items ?? [];
  const teams = teamsQuery.data ?? [];
  const escalationPolicies = policiesQuery.data ?? [];

  const policyNameById = useMemo(() => createPolicyNameMap(escalationPolicies), [escalationPolicies]);
  const summary = useMemo(() => createServiceSummary(services), [services]);
  const visibleServices = services;
  const isLoading = servicesQuery.isLoading || teamsQuery.isLoading || policiesQuery.isLoading;
  const supportError = teamsQuery.error
    ?? policiesQuery.error
    ?? usageQuery.error;
  const isServiceQuotaBlocked = Boolean(usageQuery.data?.limits.services !== null
    && usageQuery.data
    && usageQuery.data.usage.services >= usageQuery.data.limits.services);

  const columns = useMemo<Array<DataTableColumn<Service>>>(
    () => [
      {
        header: "Service",
        key: "service",
        render: (service) => (
          <div className="grid gap-1 min-w-55">
            <strong className="text-ink text-sm font-[650] leading-[1.3]">{service.name}</strong>
            <span
              className="block text-ink-subtle text-xs leading-[1.35] max-w-140 overflow-hidden text-ellipsis whitespace-nowrap"
              title={service.description ?? service.id}
            >
              {service.description ?? shortId(service.id)}
            </span>
          </div>
        ),
      },
      {
        header: "Status",
        key: "status",
        render: (service) => <ServiceStatusBadge status={service.status} />,
        width: 120,
      },
      {
        align: "right",
        header: "Open incidents",
        key: "open_incidents",
        render: (service) => service.open_incident_count,
        width: 72,
      },
      {
        header: "Escalation policy",
        key: "policy",
        render: (service) => formatPolicy(service.escalation_policy_id, policyNameById),
        width: 220,
      },
    ],
    [policyNameById],
  );

  async function handleCreateService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;

    const created = await createServiceMutation.mutateAsync({
      name: createForm.name.trim(),
      description: createForm.description.trim() || null,
      workspace_id: projectId,
      team_id: createForm.teamId || null,
      escalation_policy_id: createForm.escalationPolicyId || null,
    });

    setCreateForm({ description: "", escalationPolicyId: "", name: "", teamId: createForm.teamId });
    setIsCreatePanelOpen(false);
    navigate(`/services/${created.service.id}`, {
      state: { defaultWebhookEndpoint: created.default_webhook_endpoint },
    });
  }

  return (
    <LocalizedText>
      <section className="grid gap-4">
      <PageHeader
        action={(
          <Button onClick={() => setIsCreatePanelOpen((current) => !current)} variant="primary">
            {isCreatePanelOpen ? "Cancel" : "New service"}
          </Button>
        )}
        description="Connect the systems that send alerts and see their health in one place."
        help="A service represents a system that can create incidents. Create one, assign its owner, and connect a webhook to start receiving alerts."
        title="Services"
      />

      <p className="m-0 text-xs text-ink-muted">Health counts and filters apply to the current page of services.</p>
      <section aria-label="Service health summary" className="grid gap-2.5 grid-cols-1 sm:grid-cols-3 min-w-0">
        <ServiceSignal label="Total services" value={summary.total} tone="blue" />
        <ServiceSignal label="Need attention" value={summary.impacted} tone={summary.impacted > 0 ? "red" : "green"} />
        <ServiceSignal label="Healthy" value={summary.normal} tone="green" />
      </section>

      <div
        className={cn(
          "grid items-start gap-4.5",
          isCreatePanelOpen
            ? "xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)]"
            : "grid-cols-[minmax(0,1fr)]",
        )}
      >
        <Panel className="grid gap-4">
          <div aria-label="Service status filters" className="grid gap-2 grid-cols-1 sm:grid-cols-3">
            <ServiceStatusFilterButton
              active={viewFilter === "all"}
              count={viewFilter === "all" ? summary.total : undefined}
              label="All"
              onClick={() => { setPageCursors([]); setViewFilter("all"); }}
            />
            <ServiceStatusFilterButton
              active={viewFilter === "impacted"}
              count={viewFilter === "impacted" ? summary.impacted : undefined}
              label="Impacted"
              onClick={() => { setPageCursors([]); setViewFilter("impacted"); }}
            />
            <ServiceStatusFilterButton
              active={viewFilter === "normal"}
              count={viewFilter === "normal" ? summary.normal : undefined}
              label="Normal"
              onClick={() => { setPageCursors([]); setViewFilter("normal"); }}
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-hairline-soft pt-4">
            <div className="grid gap-1">
              <h2 className="text-ink text-sm font-[700] leading-tight m-0">Service inventory</h2>
              <p className="text-ink-subtle text-xs leading-tight m-0">Open a service to manage its alerts and ownership.</p>
            </div>
            <span className="text-ink-subtle text-xs tabular-nums min-h-4 inline-flex items-center">
              {servicesQuery.isLoading ? <Skeleton className="h-3 w-16" /> : `${visibleServices.length} shown`}
            </span>
          </div>

          {isLoading ? <TablePageSkeleton label="Loading services" /> : null}
          {servicesQuery.error ? <ErrorState error={servicesQuery.error} onRetry={() => Promise.all([servicesQuery.refetch(), teamsQuery.refetch(), policiesQuery.refetch()])} title="Could not load services" /> : null}
          {!servicesQuery.error && supportError ? (
            <ErrorState error={supportError} title="Some service metadata could not be loaded" />
          ) : null}
          {!isLoading && !servicesQuery.error ? (
            <DataTable
              columns={columns}
              emptyState={
                <EmptyState
                  message={viewFilter === "all" ? "No services have been added yet." : "No services match this health view."}
                  title="No services"
                />
              }
              getRowKey={(service) => service.id}
              onRowClick={(service) => navigate(`/services/${service.id}`)}
              rows={visibleServices}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            <span>Page {pageCursors.length + 1}</span>
            <div className="flex gap-2">
              <Button disabled={!pageCursors.length || servicesQuery.isFetching} onClick={() => setPageCursors(pageCursors.slice(0, -1))} size="sm" variant="ghost">Previous</Button>
              <Button disabled={!servicesQuery.data?.next_cursor || servicesQuery.isFetching} onClick={() => servicesQuery.data?.next_cursor && setPageCursors([...pageCursors, servicesQuery.data.next_cursor])} size="sm" variant="ghost">Next</Button>
            </div>
          </div>
        </Panel>

        {isCreatePanelOpen ? (
          <aside className="min-w-0 sticky top-21.5">
            <form
              className="bg-surface-1 border border-hairline rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.10)] p-4.5 grid gap-4"
              onSubmit={handleCreateService}
            >
              <div className="grid gap-1.5">
                <h2 className="text-ink text-[17px] font-semibold leading-tight m-0">New service</h2>
                <p className="text-ink-muted text-xs leading-[1.45] m-0">
                  Create a service, then connect its webhook to start receiving incidents.
                </p>
              </div>
              {!policiesQuery.isLoading && escalationPolicies.length === 0 ? (
                <div className="grid gap-2 p-3 rounded-md bg-surface-2 border border-hairline">
                  <strong className="text-ink text-sm font-[650] leading-tight">Add escalation routing</strong>
                  <p className="text-ink-muted text-[13px] leading-[1.45] m-0">
                    A service can be created without a policy, but new incidents will not have service-specific escalation routing.
                  </p>
                  <Button className="justify-self-start" onClick={() => navigate("/escalation-policies")} size="sm" variant="secondary">
                    Open escalation policies
                  </Button>
                </div>
              ) : null}
              <div className="grid gap-3.5">
                <Field label="Name" required>
                  <TextInput
                    disabled={createServiceMutation.isPending}
                    onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Payments API"
                    required
                    value={createForm.name}
                  />
                </Field>
                <Field label="Owner team">
                  <Select
                    disabled={createServiceMutation.isPending || teamsQuery.isLoading}
                    onChange={(event) => setCreateForm((current) => ({ ...current, teamId: event.target.value }))}
                    value={createForm.teamId}
                  >
                    <option value="">No owner team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Escalation policy">
                  <Select
                    disabled={createServiceMutation.isPending || policiesQuery.isLoading}
                    onChange={(event) => setCreateForm((current) => ({ ...current, escalationPolicyId: event.target.value }))}
                    value={createForm.escalationPolicyId}
                  >
                    <option value="">No policy yet</option>
                    {escalationPolicies.map((policy) => (
                      <option key={policy.id} value={policy.id}>{policy.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Description">
                  <TextArea
                    disabled={createServiceMutation.isPending}
                    onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="What this service owns and when operators should page."
                    value={createForm.description}
                  />
                </Field>
              </div>
              {createServiceMutation.error ? (
                <ErrorState error={createServiceMutation.error} title="Could not create service" />
              ) : null}
              {isServiceQuotaBlocked ? (
                <ErrorState
                  error="This project has reached its service limit. Contact support for assistance."
                  title="Service limit reached"
                />
              ) : null}
              <div className="flex flex-wrap gap-2.5 justify-end">
                <Button disabled={createServiceMutation.isPending} onClick={() => setIsCreatePanelOpen(false)} variant="ghost">
                  Cancel
                </Button>
                <Button
                  disabled={!projectId || !createForm.name.trim() || isServiceQuotaBlocked}
                  isLoading={createServiceMutation.isPending}
                  type="submit"
                  variant="primary"
                >
                  Create service
                </Button>
              </div>
            </form>
          </aside>
        ) : null}
      </div>
      </section>
    </LocalizedText>
  );
}

function createPolicyNameMap(policies: EscalationPolicy[]) {
  return new Map(policies.map((policy) => [policy.id, policy.name]));
}

function createServiceSummary(services: Service[]) {
  const impacted = services.filter((service) => isImpactedStatus(service.status)).length;

  return {
    impacted,
    normal: services.filter((service) => service.status === "normal").length,
    total: services.length,
  };
}

function ServiceSignal({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "blue" | "green" | "red";
  value: number;
}) {
  const borderTone = tone === "red"
    ? "border-danger/20"
    : tone === "green"
      ? "border-success/18"
      : "border-accent/20";

  return (
    <div className={cn("flex items-center justify-between gap-3 min-w-0 rounded-lg border bg-surface-1 px-3.5 py-3", borderTone)}>
      <span className="text-ink-muted text-xs font-[650] leading-tight">{label}</span>
      <strong className="text-ink text-xl font-[700] leading-none tabular-nums">{value}</strong>
    </div>
  );
}

function isImpactedStatus(status: ServiceStatus) {
  return impactedStatuses.some((impactedStatus) => impactedStatus === status);
}

function ServiceStatusFilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count?: number | undefined;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex items-center justify-between gap-2.5 min-h-10 min-w-0 px-2.5 py-2.25 rounded-md border cursor-pointer",
        active
          ? "bg-surface-2 border-[rgba(0,153,255,0.34)] text-ink"
          : "bg-surface-2/45 border-hairline-soft text-ink-muted hover:border-hairline hover:text-ink",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="text-xs font-[650] leading-none overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      {count !== undefined ? <strong className="text-ink text-[13px] font-bold leading-none">{count}</strong> : null}
    </button>
  );
}

function formatPolicy(policyId: string | null, policyNameById: Map<string, string>) {
  if (!policyId) return "No policy";
  return policyNameById.get(policyId) ?? shortId(policyId);
}
