import type { Incident, OnCallSchedule, Service, ServiceStatus, User, WorkspaceMember } from "@im/contracts";
import { ArrowRight, CheckCircle2, Circle, Clock3, Layers3, RadioTower, Siren } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import {
  Badge,
  EmptyState,
  ErrorState,
  IncidentPriorityBadge,
  IncidentStatusBadge,
  OverviewSkeleton,
  PageHeader,
  Panel,
  ServiceStatusBadge,
} from "../../../shared/components";
import { LocalizedText } from "../../../shared/i18n";
import { cn, formatDateTime, formatRelativeTime, shortId } from "../../../shared/utils";
import {
  useOverviewCurrentOnCall,
  useOverviewEscalationPolicies,
  useOverviewIncidents,
  useOverviewOnCallSchedules,
  useOverviewServices,
  useOverviewUsers,
  useOverviewWorkspaceMembers,
} from "../queries";

const serviceStatusWeight: Record<ServiceStatus, number> = {
  critical: 4,
  major: 3,
  degraded: 2,
  normal: 1,
};

export function OverviewPage() {
  const incidentsQuery = useOverviewIncidents();
  const servicesQuery = useOverviewServices();
  const schedulesQuery = useOverviewOnCallSchedules();
  const policiesQuery = useOverviewEscalationPolicies();
  const membersQuery = useOverviewWorkspaceMembers();
  const usersQuery = useOverviewUsers();

  const incidents = incidentsQuery.data?.items ?? [];
  const services = servicesQuery.data?.items ?? [];
  const schedules = schedulesQuery.data ?? [];
  const policies = policiesQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const openIncidents = useMemo(() => incidents.filter((incident) => incident.status !== "resolved"), [incidents]);
  const activeIncidents = useMemo(() => sortOpenIncidents(openIncidents).slice(0, 5), [openIncidents]);
  const impactedServices = useMemo(() => sortImpactedServices(services).slice(0, 5), [services]);
  const servicesNeedingRouting = useMemo(() => services.filter((service) => !service.escalation_policy_id), [services]);
  const criticalOpenIncidents = openIncidents.filter((incident) => incident.priority === "P1" || incident.severity === "critical");
  const triggeredIncidents = openIncidents.filter((incident) => incident.status === "triggered");
  const acknowledgedIncidents = openIncidents.filter((incident) => incident.status === "acknowledged");
  const coveredServices = services.filter((service) => service.escalation_policy_id).length;
  const readinessItems = createReadinessItems({
    members,
    policiesCount: policies.length,
    schedulesCount: schedules.length,
    services,
    servicesNeedingRouting,
  });
  const completedReadiness = readinessItems.filter((item) => item.complete).length;
  const nextReadinessItem = readinessItems.find((item) => !item.complete);
  const serviceNameById = useMemo(() => createServiceNameMap(services), [services]);
  const userNameById = useMemo(() => createUserNameMap(users), [users]);
  const onCallServiceIds = useMemo(
    () => createOnCallServiceIds(services, openIncidents),
    [openIncidents, services],
  );
  const currentOnCallQueries = useOverviewCurrentOnCall(onCallServiceIds);

  const isLoading = incidentsQuery.isLoading
    || servicesQuery.isLoading
    || schedulesQuery.isLoading
    || policiesQuery.isLoading
    || membersQuery.isLoading;
  const error = incidentsQuery.error
    ?? servicesQuery.error
    ?? schedulesQuery.error
    ?? policiesQuery.error
    ?? membersQuery.error;
  const retryOverview = () => Promise.all([
    incidentsQuery.refetch(),
    servicesQuery.refetch(),
    schedulesQuery.refetch(),
    policiesQuery.refetch(),
    membersQuery.refetch(),
    usersQuery.refetch(),
  ]);

  return (
    <LocalizedText>
      <section className="grid gap-4">
        <PageHeader
          action={(
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink primary to="/incidents">Open incidents</ButtonLink>
              <ButtonLink to="/services">Add service</ButtonLink>
            </div>
          )}
          description="Review active incidents, impacted services, on-call coverage, and the setup work still blocking reliable escalation."
          eyebrow="Command center"
          help="Overview is the project home. Start here to see what needs attention, which services are affected, and what setup remains before live alerts are reliable."
          title="Overview"
        />

        {isLoading ? <OverviewSkeleton /> : null}
        {error ? <ErrorState error={error} onRetry={retryOverview} title="Could not load overview" /> : null}

        {!isLoading && !error ? (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <OverviewMetric
                caption={`Recent open incidents · ${triggeredIncidents.length} triggered, ${acknowledgedIncidents.length} acknowledged`}
                icon={Siren}
                label="Open incidents"
                tone={openIncidents.length > 0 ? "red" : "green"}
                value={incidentsQuery.data?.next_cursor ? `${openIncidents.length}+` : openIncidents.length}
              />
              <OverviewMetric
                caption="P1 or critical severity among recent open incidents"
                icon={RadioTower}
                label="Critical response"
                tone={criticalOpenIncidents.length > 0 ? "red" : "neutral"}
                value={incidentsQuery.data?.next_cursor ? `${criticalOpenIncidents.length}+` : criticalOpenIncidents.length}
              />
              <OverviewMetric
                caption={`${services.length} services registered`}
                icon={Layers3}
                label="Impacted services"
                tone={impactedServices.length > 0 ? "yellow" : "green"}
                value={impactedServices.length}
              />
              <OverviewMetric
                caption={`${completedReadiness}/${readinessItems.length} launch checks complete`}
                icon={CheckCircle2}
                label="Readiness"
                tone={completedReadiness === readinessItems.length ? "green" : "blue"}
                value={`${Math.round((completedReadiness / readinessItems.length) * 100)}%`}
              />
            </section>

            <section className="grid items-start gap-4.5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
              <Panel className="grid gap-4" padding="lg">
                <SectionHeading
                  action={<Link className="text-sm font-semibold leading-none text-accent no-underline" to="/incidents">View all</Link>}
                  description="Incidents still requiring acknowledgement or resolution."
                  title="Active response"
                />
                {activeIncidents.length > 0 ? (
                  <div className="grid gap-2.5">
                    {activeIncidents.map((incident) => (
                      <IncidentRow incident={incident} key={incident.id} serviceName={serviceNameById.get(incident.service_id)} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    action={<ButtonLink to="/services">Check services</ButtonLink>}
                    message="No open incidents in the selected project."
                    title="Response queue is clear"
                  />
                )}
              </Panel>

              <Panel className="grid gap-4" padding="lg">
                <SectionHeading
                  action={<Link className="text-sm font-semibold leading-none text-accent no-underline" to="/project-settings">Configure</Link>}
                  description="Setup items that make incoming alerts actionable."
                  title="Launch checklist"
                />
                <div className="grid gap-2.5">
                  {readinessItems.map((item) => (
                    <ReadinessRow item={item} key={item.label} />
                  ))}
                </div>
                {nextReadinessItem ? (
                  <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-ink px-3.5 text-sm font-semibold leading-none text-canvas no-underline transition duration-120 ease hover:-translate-y-px" to={nextReadinessItem.to}>
                    Continue setup
                    <ArrowRight size={15} strokeWidth={2.2} />
                  </Link>
                ) : (
                  <Badge tone="green">Ready for live incidents</Badge>
                )}
              </Panel>
            </section>

            <section className="grid items-start gap-4.5 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1fr)]">
              <Panel className="grid gap-4" padding="lg">
                <SectionHeading
                  action={<Link className="text-sm font-semibold leading-none text-accent no-underline" to="/services">Services</Link>}
                  description="Services with degraded status or open incidents."
                  title="Impacted services"
                />
                {impactedServices.length > 0 ? (
                  <div className="grid gap-2.5">
                    {impactedServices.map((service) => (
                      <ServiceHealthRow key={service.id} service={service} />
                    ))}
                  </div>
                ) : services.length > 0 ? (
                  <EmptyState message="Every registered service is currently normal." title="All services normal" />
                ) : (
                  <EmptyState
                    action={<ButtonLink to="/services">Create service</ButtonLink>}
                    message="Add the first service before wiring webhooks and escalation."
                    title="No services yet"
                  />
                )}
              </Panel>

              <Panel className="grid gap-4" padding="lg">
                <SectionHeading
                  action={<Link className="text-sm font-semibold leading-none text-accent no-underline" to="/on-call">On-call</Link>}
                  description="Coverage and responder context for services that matter right now."
                  title="On-call coverage"
                />
                <div className="grid gap-3 md:grid-cols-3">
                  <CoverageStat label="Schedules" value={schedules.length} />
                  <CoverageStat label="Escalation policies" value={policies.length} />
                  <CoverageStat label="Covered services" value={`${coveredServices}/${services.length}`} />
                </div>

                <div className="grid gap-2.5">
                  {onCallServiceIds.length > 0 ? (
                    onCallServiceIds.map((serviceId, index) => (
                      <CurrentOnCallRow
                        key={serviceId}
                        query={currentOnCallQueries[index]}
                        serviceName={serviceNameById.get(serviceId) ?? shortId(serviceId)}
                        userNameById={userNameById}
                      />
                    ))
                  ) : schedules.length > 0 ? (
                    schedules.slice(0, 4).map((schedule) => (
                      <ScheduleRow key={schedule.id} schedule={schedule} />
                    ))
                  ) : (
                    <EmptyState
                      action={<ButtonLink to="/on-call">Create schedule</ButtonLink>}
                      message="No on-call schedules exist for this project yet."
                      title="No on-call coverage"
                    />
                  )}
                </div>
              </Panel>
            </section>
          </>
        ) : null}
      </section>
    </LocalizedText>
  );
}

type OverviewMetricTone = "neutral" | "blue" | "green" | "yellow" | "red";

const metricToneClasses: Record<OverviewMetricTone, string> = {
  neutral: "text-ink-muted",
  blue: "text-accent",
  green: "text-success",
  yellow: "text-warning",
  red: "text-danger",
};

function OverviewMetric({
  caption,
  icon: Icon,
  label,
  tone,
  value,
}: {
  caption: string;
  icon: typeof Siren;
  label: string;
  tone: OverviewMetricTone;
  value: number | string;
}) {
  return (
    <article className="grid min-h-31 gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase leading-none text-ink-muted">{label}</span>
        <Icon className={metricToneClasses[tone]} size={18} strokeWidth={2.2} />
      </div>
      <strong className="text-[34px] font-[650] leading-none text-ink">{value}</strong>
      <p className="m-0 text-xs leading-[1.35] text-ink-subtle">{caption}</p>
    </article>
  );
}

function SectionHeading({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-1.5">
        <h2 className="m-0 text-xl font-semibold leading-tight text-ink">{title}</h2>
        <p className="m-0 text-sm leading-[1.45] text-ink-muted">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

function IncidentRow({ incident, serviceName }: { incident: Incident; serviceName: string | undefined }) {
  return (
    <Link
      className="grid gap-3 rounded-lg border border-hairline bg-canvas/35 p-3.5 text-ink no-underline transition duration-120 ease hover:-translate-y-px hover:bg-surface-2/60 md:grid-cols-[minmax(0,1fr)_auto]"
      to={`/incidents/${incident.id}`}
    >
      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <IncidentPriorityBadge priority={incident.priority} />
          <IncidentStatusBadge status={incident.status} />
        </div>
        <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-[650] leading-tight text-ink">
          {incident.title}
        </strong>
        <span className="text-xs leading-tight text-ink-subtle">
          {serviceName ?? shortId(incident.service_id)} · {incident.source}
        </span>
      </div>
      <time className="text-xs font-semibold leading-tight text-ink-muted md:text-right" dateTime={incident.updated_at} title={formatDateTime(incident.updated_at)}>
        {formatRelativeTime(incident.updated_at)}
      </time>
    </Link>
  );
}

function ServiceHealthRow({ service }: { service: Service }) {
  return (
    <Link
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-hairline bg-canvas/35 p-3.5 text-ink no-underline transition duration-120 ease hover:-translate-y-px hover:bg-surface-2/60"
      to={`/services/${service.id}`}
    >
      <div className="grid min-w-0 gap-1.5">
        <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-[650] leading-tight text-ink">{service.name}</strong>
        <span className="text-xs leading-tight text-ink-subtle">
          {service.open_incident_count} open incident{service.open_incident_count === 1 ? "" : "s"}
        </span>
      </div>
      <ServiceStatusBadge status={service.status} />
    </Link>
  );
}

function ReadinessRow({ item }: { item: ReadinessItem }) {
  return (
    <Link
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3 text-ink no-underline transition duration-120 ease hover:-translate-y-px",
        item.complete
          ? "border-success/18 bg-success/8"
          : "border-hairline bg-canvas/35 hover:bg-surface-2/60",
      )}
      to={item.to}
    >
      {item.complete ? (
        <CheckCircle2 className="text-success" size={17} strokeWidth={2.2} />
      ) : (
        <Circle className="text-ink-subtle" size={17} strokeWidth={2.2} />
      )}
      <span className="min-w-0 text-sm font-semibold leading-tight text-ink">{item.label}</span>
      <ArrowRight className="text-ink-subtle" size={14} strokeWidth={2.2} />
    </Link>
  );
}

function CoverageStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-hairline bg-canvas/35 p-3">
      <span className="text-xs font-bold uppercase leading-none text-ink-subtle">{label}</span>
      <strong className="text-xl font-semibold leading-none text-ink">{value}</strong>
    </div>
  );
}

function CurrentOnCallRow({
  query,
  serviceName,
  userNameById,
}: {
  query: ReturnType<typeof useOverviewCurrentOnCall>[number] | undefined;
  serviceName: string;
  userNameById: Map<string, string>;
}) {
  const primary = query?.data?.primary_user_id ? userNameById.get(query.data.primary_user_id) ?? shortId(query.data.primary_user_id) : "Unassigned";
  const secondary = query?.data?.secondary_user_id ? userNameById.get(query.data.secondary_user_id) ?? shortId(query.data.secondary_user_id) : "No secondary";

  return (
    <div className="grid gap-2 rounded-lg border border-hairline bg-canvas/35 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-[650] leading-tight text-ink">{serviceName}</strong>
        {query?.isLoading ? <Clock3 className="text-ink-subtle" size={15} strokeWidth={2.2} /> : null}
      </div>
      <div className="grid gap-1.5 text-xs leading-tight text-ink-muted">
        <span>Primary: <strong className="text-ink">{primary}</strong></span>
        <span>Secondary: <strong className="text-ink">{secondary}</strong></span>
      </div>
    </div>
  );
}

function ScheduleRow({ schedule }: { schedule: OnCallSchedule }) {
  const participantCount = new Set(
    schedule.rotations.flatMap((rotation) => rotation.participants.map((participant) => participant.user_id)),
  ).size;

  return (
    <Link
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-hairline bg-canvas/35 p-3.5 text-ink no-underline transition duration-120 ease hover:-translate-y-px hover:bg-surface-2/60"
      to="/on-call"
    >
      <div className="grid min-w-0 gap-1.5">
        <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-[650] leading-tight text-ink">{schedule.name}</strong>
        <span className="text-xs leading-tight text-ink-subtle">{schedule.timezone}</span>
      </div>
      <Badge tone={participantCount > 0 ? "blue" : "neutral"}>{participantCount} users</Badge>
    </Link>
  );
}

function ButtonLink({ children, primary = false, to }: { children: React.ReactNode; primary?: boolean; to: string }) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-9.5 items-center justify-center rounded-full px-3.5 text-sm font-semibold leading-none no-underline transition duration-120 ease hover:-translate-y-px",
        primary
          ? "bg-ink text-canvas"
          : "text-ink-muted shadow-[inset_0_0_0_1px_var(--color-hairline)] hover:bg-surface-2 hover:text-ink",
      )}
      to={to}
    >
      {children}
    </Link>
  );
}

type ReadinessItem = {
  complete: boolean;
  label: string;
  to: string;
};

function createReadinessItems({
  members,
  policiesCount,
  schedulesCount,
  services,
  servicesNeedingRouting,
}: {
  members: WorkspaceMember[];
  policiesCount: number;
  schedulesCount: number;
  services: Service[];
  servicesNeedingRouting: Service[];
}): ReadinessItem[] {
  return [
    {
      complete: services.length > 0,
      label: "Register at least one service",
      to: "/services",
    },
    {
      complete: schedulesCount > 0,
      label: "Create an on-call schedule",
      to: "/on-call",
    },
    {
      complete: policiesCount > 0,
      label: "Create an escalation policy",
      to: "/escalation-policies",
    },
    {
      complete: services.length > 0 && servicesNeedingRouting.length === 0,
      label: "Attach escalation to every service",
      to: "/services",
    },
    {
      complete: members.length > 1,
      label: "Invite at least one responder",
      to: "/project-settings",
    },
  ];
}

function createServiceNameMap(services: Service[]) {
  return new Map(services.map((service) => [service.id, service.name]));
}

function createUserNameMap(users: User[]) {
  return new Map(users.map((user) => [user.id, user.name || user.email]));
}

function sortOpenIncidents(incidents: Incident[]) {
  return [...incidents].sort((a, b) => {
    const priorityDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return Date.parse(b.updated_at) - Date.parse(a.updated_at);
  });
}

function sortImpactedServices(services: Service[]) {
  return [...services]
    .filter((service) => service.status !== "normal" || service.open_incident_count > 0)
    .sort((a, b) => {
      const statusDiff = serviceStatusWeight[b.status] - serviceStatusWeight[a.status];
      if (statusDiff !== 0) return statusDiff;
      return b.open_incident_count - a.open_incident_count;
    });
}

function priorityWeight(priority: Incident["priority"]) {
  return Number(priority.slice(1)) * -1;
}

function createOnCallServiceIds(services: Service[], openIncidents: Incident[]) {
  const serviceIdsWithOpenIncidents = new Set(openIncidents.map((incident) => incident.service_id));
  const sorted = [...services].sort((a, b) => {
    const openDiff = Number(serviceIdsWithOpenIncidents.has(b.id)) - Number(serviceIdsWithOpenIncidents.has(a.id));
    if (openDiff !== 0) return openDiff;
    return serviceStatusWeight[b.status] - serviceStatusWeight[a.status];
  });

  return sorted.slice(0, 4).map((service) => service.id);
}
