import type {
  CreateIncidentRequest,
  Incident,
  IncidentFilter,
  IncidentPriority,
  IncidentSeverity,
  IncidentStatus,
  Service,
  WorkspaceRoleKey,
} from "@im/contracts";
import { AlertCircle, CheckCircle, Circle, Clock } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  IncidentPriorityBadge,
  IncidentSeverityBadge,
  IncidentStatusBadge,
  TablePageSkeleton,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  TextArea,
  TextInput,
  type DataTableColumn,
} from "../../../shared/components";
import { cn, formatDateTime, formatRelativeTime, shortId } from "../../../shared/utils";
import { hasWorkspacePermission, useAuth } from "../../../shared/auth";
import {
  useCreateIncidentMutation,
  useIncidentList,
  useIncidentServiceOptions,
  useIncidentWorkspaceRoles,
} from "../queries";
import { LocalizedText } from "../../../shared/i18n";

const incidentStatuses = ["triggered", "acknowledged", "resolved"] as const satisfies readonly IncidentStatus[];
const incidentSeverities = ["critical", "high", "medium", "low"] as const satisfies readonly IncidentSeverity[];
const incidentPriorities = ["P1", "P2", "P3", "P4", "P5"] as const satisfies readonly IncidentPriority[];

type FilterKey = keyof IncidentFilter;

type CreateIncidentFormState = {
  description: string;
  priority: IncidentPriority | "";
  serviceId: string;
  severity: IncidentSeverity;
  title: string;
};

type IncidentListLocationState = {
  createIncident?: {
    serviceId?: string;
  };
};

const defaultCreateFormState: CreateIncidentFormState = {
  description: "",
  priority: "",
  serviceId: "",
  severity: "medium",
  title: "",
};

const signalToneBorder: Record<string, string> = {
  blue: "border-accent/20",
  green: "border-success/18",
  red: "border-danger/20",
  yellow: "border-warning/18",
};

export function IncidentListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPlatformAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCreateServiceId = getInitialCreateServiceId(location.state);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(Boolean(initialCreateServiceId));
  const [pageCursors, setPageCursors] = useState<string[]>([]);
  const createPanelRef = useRef<HTMLElement>(null);
  const [createForm, setCreateForm] = useState<CreateIncidentFormState>(() => ({
    ...defaultCreateFormState,
    serviceId: initialCreateServiceId ?? "",
  }));

  const filters = useMemo(() => readIncidentFilters(searchParams), [searchParams]);
  const incidentsQuery = useIncidentList(filters);
  const servicesQuery = useIncidentServiceOptions();
  const workspaceRolesQuery = useIncidentWorkspaceRoles();
  const createIncidentMutation = useCreateIncidentMutation();

  const workspaceRoles = workspaceRolesQuery.data ?? [];
  const services = servicesQuery.data?.items ?? [];
  const incidents = incidentsQuery.data?.items ?? [];
  const serviceNameById = useMemo(() => createServiceNameMap(services), [services]);
  const summary = useMemo(() => createIncidentSummary(incidents), [incidents]);
  const visibleIncidents = useMemo(() => sortIncidentsForResponse(incidents), [incidents]);

  const columns = useMemo<Array<DataTableColumn<Incident>>>(
    () => [
      {
        header: "Incident",
        key: "title",
        render: (incident) => (
          <div className="grid gap-1 min-w-55">
            <strong className="text-ink text-sm font-[650] leading-[1.3]">{incident.title}</strong>
            <span className="block text-ink-subtle font-mono text-xs leading-[1.35] max-w-140 overflow-hidden text-ellipsis whitespace-nowrap">
              {incident.source}
            </span>
          </div>
        ),
      },
      {
        header: "Service",
        key: "service",
        render: (incident) => serviceNameById.get(incident.service_id) ?? shortId(incident.service_id),
        width: 180,
      },
      {
        header: "Priority / Severity",
        key: "priority",
        render: (incident) => (
          <div className="flex items-center gap-1.25">
            <IncidentPriorityBadge priority={incident.priority} />
            <IncidentSeverityBadge severity={incident.severity} />
          </div>
        ),
        width: 180,
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
        width: 140,
      },
    ],
    [serviceNameById],
  );

  const hasActiveFilters = Boolean(filters.service_id || filters.priority || filters.severity || (filters.status && filters.status !== "open"));
  const canUseResponseActions = isPlatformAdmin || canUseIncidentResponseActions(workspaceRoles);
  const canCreateIncident = (isPlatformAdmin || hasWorkspacePermission(workspaceRoles, "incident.create"))
    && services.length > 0
    && !createIncidentMutation.isPending;
  const emptyStateAction = hasActiveFilters ? (
    <Button onClick={clearFilters} size="sm" variant="secondary">Clear filters</Button>
  ) : canCreateIncident ? (
    <Button onClick={() => setIsCreatePanelOpen(true)} size="sm" variant="secondary">New incident</Button>
  ) : canUseResponseActions ? (
    <Button onClick={() => navigate("/services")} size="sm" variant="secondary">Create service</Button>
  ) : undefined;

  useEffect(() => {
    const serviceId = getInitialCreateServiceId(location.state);

    if (!serviceId) return;

    setCreateForm((current) => ({ ...current, serviceId }));
    setIsCreatePanelOpen(true);
  }, [location.state]);

  useEffect(() => {
    if (!isCreatePanelOpen) return;
    const frame = requestAnimationFrame(() => {
      createPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      createPanelRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isCreatePanelOpen]);

  function updateFilter(key: FilterKey, value: string) {
    const nextParams = new URLSearchParams(searchParams);
    if (value) nextParams.set(key, value);
    else nextParams.delete(key);
    nextParams.delete("cursor");
    setPageCursors([]);
    setSearchParams(nextParams, { replace: true });
  }

  function clearFilters() {
    setPageCursors([]);
    setSearchParams({}, { replace: true });
  }

  function movePage(direction: "next" | "previous") {
    const nextParams = new URLSearchParams(searchParams);
    if (direction === "next" && incidentsQuery.data?.next_cursor) {
      setPageCursors([...pageCursors, incidentsQuery.data.next_cursor]);
      nextParams.set("cursor", incidentsQuery.data.next_cursor);
    } else if (direction === "previous") {
      const previousCursors = pageCursors.slice(0, -1);
      setPageCursors(previousCursors);
      if (previousCursors.length) nextParams.set("cursor", previousCursors.at(-1)!);
      else nextParams.delete("cursor");
    }
    setSearchParams(nextParams, { replace: true });
  }

  function updateCreateForm<TField extends keyof CreateIncidentFormState>(
    field: TField,
    value: CreateIncidentFormState[TField],
  ) {
    setCreateForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateIncident(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: CreateIncidentRequest = {
      service_id: createForm.serviceId,
      title: createForm.title.trim(),
      severity: createForm.severity,
      source: "manual",
      description: createForm.description.trim() || null,
      ...(createForm.priority ? { priority: createForm.priority } : {}),
    };

    const incident = await createIncidentMutation.mutateAsync(input);
    setCreateForm({ ...defaultCreateFormState, serviceId: createForm.serviceId });
    setIsCreatePanelOpen(false);
    navigate(`/incidents/${incident.id}`);
  }

  return (
    <LocalizedText>
      <section className="grid gap-4">
      <PageHeader
        action={canUseResponseActions ? (
          <Button onClick={() => setIsCreatePanelOpen((current) => !current)} variant="primary">
            {isCreatePanelOpen ? "Cancel" : "New incident"}
          </Button>
        ) : null}
        description="See what needs attention now, then open an incident to respond."
        help="This is the incident queue. Open incidents need attention; use the filters to narrow the queue by status, priority, severity, or service."
        title="Incidents"
      />

      <section aria-label="Incident queue summary" className="grid gap-2.5 grid-cols-2 md:grid-cols-4 min-w-0">
        <QueueSignal label="Open" tone="red" value={summary.open} />
        <QueueSignal label="Triggered" tone="red" value={summary.triggered} />
        <QueueSignal label="Acknowledged" tone="blue" value={summary.acknowledged} />
        <QueueSignal label="Critical" tone="yellow" value={summary.critical} />
      </section>
      <p className="m-0 text-xs text-ink-muted">Counts reflect the current page and filters. Use status filters to view other incidents.</p>

      <div
        className={cn(
          "grid items-start gap-4.5",
          isCreatePanelOpen
            ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)]"
            : "grid-cols-1",
        )}
      >
        <Panel className="grid gap-4">
          <div className="grid gap-2.5">
            <div aria-label="Incident status filters" className="grid gap-2 grid-cols-2 md:grid-cols-4">
              <StatusFilterButton
                active={filters.status === "open"}
                count={filters.status === "open" ? summary.open : undefined}
                icon={<Circle size={13} />}
                label="Open"
                onClick={() => updateFilter("status", "")}
              />
              <StatusFilterButton
                active={filters.status === "triggered"}
                count={filters.status === "triggered" ? summary.triggered : undefined}
                icon={<AlertCircle size={13} />}
                label="Triggered"
                onClick={() => updateFilter("status", "triggered")}
              />
              <StatusFilterButton
                active={filters.status === "acknowledged"}
                count={filters.status === "acknowledged" ? summary.acknowledged : undefined}
                icon={<Clock size={13} />}
                label="Acknowledged"
                onClick={() => updateFilter("status", "acknowledged")}
              />
              <StatusFilterButton
                active={filters.status === "resolved"}
                count={filters.status === "resolved" ? summary.resolved : undefined}
                icon={<CheckCircle size={13} />}
                label="Resolved"
                onClick={() => updateFilter("status", "resolved")}
              />
            </div>
            <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,0.8fr)_auto]">
              <FilterChipGroup label="Priority">
                <FilterChip active={!filters.priority} label="All" onClick={() => updateFilter("priority", "")} />
                {incidentPriorities.map((priority) => (
                  <FilterChip
                    active={filters.priority === priority}
                    key={priority}
                    label={priority}
                    onClick={() => updateFilter("priority", filters.priority === priority ? "" : priority)}
                  />
                ))}
              </FilterChipGroup>
              <FilterChipGroup label="Severity">
                <FilterChip active={!filters.severity} label="All" onClick={() => updateFilter("severity", "")} />
                {incidentSeverities.map((severity) => (
                  <FilterChip
                    active={filters.severity === severity}
                    key={severity}
                    label={formatSeverityLabel(severity)}
                    onClick={() => updateFilter("severity", filters.severity === severity ? "" : severity)}
                  />
                ))}
              </FilterChipGroup>
              <Field label="Service">
                <Select
                  disabled={servicesQuery.isLoading}
                  onChange={(event) => updateFilter("service_id", event.target.value)}
                  value={filters.service_id ?? ""}
                >
                  <option value="">All services</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-start md:justify-end pb-0.25">
                {hasActiveFilters ? (
                  <Button onClick={clearFilters} size="sm" variant="ghost">Clear</Button>
                ) : null}
              </div>
            </div>
            <p className="m-0 text-ink-subtle text-xs leading-[1.4]">
              Open incidents are shown by default and sorted by response urgency. Use filters to narrow the queue without losing the current context.
            </p>
          </div>

          {incidentsQuery.isLoading || servicesQuery.isLoading ? <TablePageSkeleton label="Loading incidents" /> : null}
          {incidentsQuery.error ? <ErrorState error={incidentsQuery.error} onRetry={() => Promise.all([incidentsQuery.refetch(), servicesQuery.refetch()])} title="Could not load incidents" /> : null}
          {!incidentsQuery.isLoading && !incidentsQuery.error ? (
            <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-ink-muted text-xs min-h-4 inline-flex items-center">
                {incidentsQuery.isLoading ? <Skeleton className="h-3 w-36" /> : <>Page {pageCursors.length + 1} · {visibleIncidents.length} {visibleIncidents.length === 1 ? "incident" : "incidents"} shown</>}
              </span>
              {hasActiveFilters ? (
                <button className="text-ink-subtle text-xs underline underline-offset-2 hover:text-ink" onClick={clearFilters} type="button">
                  Clear filters
                </button>
              ) : null}
            </div>
            <div className="hidden sm:block">
            <DataTable
              columns={columns}
              emptyState={
                <EmptyState
                  action={emptyStateAction}
                  message={hasActiveFilters
                    ? "No incidents match the current filters."
                    : services.length > 0
                      ? "No triggered or acknowledged incidents need attention."
                      : "Create a service before opening incidents."}
                  title={hasActiveFilters ? "No incidents" : "No open incidents"}
                />
              }
              getRowKey={(incident) => incident.id}
              onRowClick={(incident) => navigate(`/incidents/${incident.id}`)}
              rows={visibleIncidents}
            />
            </div>
            <div className="grid gap-2 sm:hidden">
              {visibleIncidents.length === 0 ? (
                <EmptyState
                  action={emptyStateAction}
                  message={hasActiveFilters ? "No incidents match the current filters." : "No open incidents need attention."}
                  title={hasActiveFilters ? "No incidents" : "No open incidents"}
                />
              ) : visibleIncidents.map((incident) => (
                <button
                  className="grid min-w-0 gap-2 rounded-xl border border-hairline bg-surface-2 p-3 text-left hover:border-accent/50"
                  key={incident.id}
                  onClick={() => navigate(`/incidents/${incident.id}`)}
                  type="button"
                >
                  <span className="min-w-0 break-words font-semibold text-ink">{incident.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <IncidentPriorityBadge priority={incident.priority} />
                    <IncidentSeverityBadge severity={incident.severity} />
                    <IncidentStatusBadge status={incident.status} />
                  </span>
                  <span className="flex min-w-0 items-center justify-between gap-2 text-xs text-ink-muted">
                    <span className="min-w-0 truncate">{serviceNameById.get(incident.service_id) ?? shortId(incident.service_id)}</span>
                    <time className="shrink-0" dateTime={incident.updated_at}>{formatRelativeTime(incident.updated_at)}</time>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-between gap-2">
              <Button disabled={!pageCursors.length || incidentsQuery.isFetching} onClick={() => movePage("previous")} size="sm" variant="ghost">Previous</Button>
              <Button disabled={!incidentsQuery.data?.next_cursor || incidentsQuery.isFetching} onClick={() => movePage("next")} size="sm" variant="ghost">Next</Button>
            </div>
            </div>
          ) : null}
        </Panel>

        {canUseResponseActions && isCreatePanelOpen ? (
          <aside className="min-w-0 scroll-mt-28 xl:sticky xl:top-21.5" ref={createPanelRef}>
            <form
              className="bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018)),var(--color-surface-1)] border border-hairline rounded-3.5 p-4 grid gap-4"
              onSubmit={handleCreateIncident}
            >
              <div className="grid gap-1.5">
                <h2 className="text-ink text-[17px] font-semibold leading-tight m-0">New incident</h2>
                <p className="text-ink-muted text-xs leading-[1.45] m-0">
                  Use this for a manual incident. Monitoring systems should normally create incidents through a service webhook.
                </p>
              </div>
              <div className="grid gap-3.5">
                <Field label="Title" required>
                  <TextInput
                    disabled={createIncidentMutation.isPending}
                    onChange={(event) => updateCreateForm("title", event.target.value)}
                    placeholder="API latency above threshold"
                    required
                    value={createForm.title}
                  />
                </Field>
                <Field label="Service" required>
                  <Select
                    disabled={servicesQuery.isLoading || createIncidentMutation.isPending}
                    onChange={(event) => updateCreateForm("serviceId", event.target.value)}
                    required
                    value={createForm.serviceId}
                  >
                    <option value="">Select service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-3.5 grid-cols-2">
                  <Field label="Priority">
                    <Select
                      disabled={createIncidentMutation.isPending}
                      onChange={(event) => updateCreateForm("priority", event.target.value as IncidentPriority | "")}
                      value={createForm.priority}
                    >
                      <option value="">Unset</option>
                      {incidentPriorities.map((priority) => (
                        <option key={priority} value={priority}>{priority}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Severity" required>
                    <Select
                      disabled={createIncidentMutation.isPending}
                      onChange={(event) => updateCreateForm("severity", event.target.value as IncidentSeverity)}
                      value={createForm.severity}
                    >
                      {incidentSeverities.map((severity) => (
                        <option key={severity} value={severity}>{severity}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Description">
                  <TextArea
                    disabled={createIncidentMutation.isPending}
                    onChange={(event) => updateCreateForm("description", event.target.value)}
                    placeholder="What is happening, where it is visible, and any immediate context."
                    value={createForm.description}
                  />
                </Field>
              </div>
              {createIncidentMutation.error ? (
                <ErrorState error={createIncidentMutation.error} title="Could not create incident" />
              ) : null}
              <div className="flex flex-wrap gap-2.5 justify-end">
                <Button
                  disabled={createIncidentMutation.isPending}
                  onClick={() => setIsCreatePanelOpen(false)}
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  disabled={!canCreateIncident}
                  isLoading={createIncidentMutation.isPending}
                  type="submit"
                  variant="primary"
                >
                  Create incident
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

function readIncidentFilters(searchParams: URLSearchParams): Partial<IncidentFilter> {
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const severity = searchParams.get("severity");
  const serviceId = searchParams.get("service_id");

  return {
    limit: 100,
    status: isIncidentStatus(status) ? status : "open",
    ...(searchParams.get("cursor") ? { cursor: searchParams.get("cursor")! } : {}),
    ...(isIncidentPriority(priority) ? { priority } : {}),
    ...(isIncidentSeverity(severity) ? { severity } : {}),
    ...(serviceId ? { service_id: serviceId } : {}),
  };
}

function getInitialCreateServiceId(state: unknown) {
  const candidate = (state as IncidentListLocationState | null)?.createIncident?.serviceId;

  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function isIncidentStatus(value: string | null): value is IncidentStatus {
  return incidentStatuses.some((status) => status === value);
}

function isIncidentPriority(value: string | null): value is IncidentPriority {
  return incidentPriorities.some((priority) => priority === value);
}

function isIncidentSeverity(value: string | null): value is IncidentSeverity {
  return incidentSeverities.some((severity) => severity === value);
}

function canUseIncidentResponseActions(roles: readonly WorkspaceRoleKey[]) {
  return hasWorkspacePermission(roles, "incident.respond");
}

function createServiceNameMap(services: Service[]) {
  return new Map(services.map((service) => [service.id, service.name]));
}

function createIncidentSummary(incidents: Incident[]) {
  const triggered = incidents.filter((incident) => incident.status === "triggered").length;
  const acknowledged = incidents.filter((incident) => incident.status === "acknowledged").length;
  const resolved = incidents.filter((incident) => incident.status === "resolved").length;

  return {
    acknowledged,
    critical: incidents.filter((incident) => incident.severity === "critical").length,
    open: triggered + acknowledged,
    resolved,
    total: incidents.length,
    triggered,
  };
}

function sortIncidentsForResponse(incidents: Incident[]) {
  return [...incidents].sort((a, b) => {
    const priorityDiff = Number(a.priority.slice(1)) - Number(b.priority.slice(1));
    if (priorityDiff !== 0) return priorityDiff;

    const statusDiff = incidentStatusWeight(b.status) - incidentStatusWeight(a.status);
    if (statusDiff !== 0) return statusDiff;

    return Date.parse(b.updated_at) - Date.parse(a.updated_at);
  });
}

function incidentStatusWeight(status: IncidentStatus) {
  if (status === "triggered") return 2;
  if (status === "acknowledged") return 1;
  return 0;
}

function QueueSignal({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "blue" | "green" | "red" | "yellow";
  value: number;
}) {
  return (
    <div className={cn("grid gap-2 min-w-0 p-3 rounded-md bg-white/2.5 border border-hairline-soft", signalToneBorder[tone])}>
      <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">{label}</span>
      <strong className="text-ink text-[22px] font-[650] leading-none">{value}</strong>
    </div>
  );
}

function FilterChipGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid gap-1.75 min-w-0">
      <span className="text-ink-muted text-[13px] font-semibold leading-[1.2]">{label}</span>
      <div className="flex flex-wrap gap-1.5 min-w-0">
        {children}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "border cursor-pointer rounded-full min-h-8 px-2.75 text-xs font-[650] leading-none transition-colors",
        active
          ? "bg-ink text-canvas border-ink"
          : "bg-white/2.5 border-hairline-soft text-ink-muted hover:border-hairline hover:text-ink",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function StatusFilterButton({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number | undefined;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex items-center justify-between gap-2.5 min-h-10 min-w-0 px-2.5 py-2.25 rounded-md border cursor-pointer",
        active
          ? "bg-surface-2 border-accent/34 text-ink"
          : "bg-white/2.5 border-hairline-soft text-ink-muted hover:border-hairline hover:text-ink",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-1.25 text-xs font-[650] leading-none overflow-hidden text-ellipsis whitespace-nowrap">
        {icon}
        {label}
      </span>
      {count !== undefined ? <strong className="text-ink text-[13px] font-bold leading-none">{count}</strong> : null}
    </button>
  );
}

function formatSeverityLabel(severity: IncidentSeverity) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}
