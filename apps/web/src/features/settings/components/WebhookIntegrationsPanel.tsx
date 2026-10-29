import type { ServiceWebhookIntegration, ServiceWebhookRoutingMode, WorkspaceWebhookIntegration, WorkspaceWebhookIntegrationEventAction, WorkspaceWebhookIntegrationType } from "@im/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  CheckboxField,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Panel,
  Select,
  TabButton,
  TextArea,
  TextInput,
} from "../../../shared/components";
import {
  useUpdateWorkspaceWebhookIntegrationMutation,
  useWorkspaceWebhookIntegrations,
} from "../queries";
import { useServiceWebhookIntegrations, useUpdateServiceWebhookIntegrationMutation } from "../../services/queries";

const integrationTypes = ["slack", "discord", "teams", "custom"] as const;
const integrationEventOptions: Array<{ label: string; value: WorkspaceWebhookIntegrationEventAction }> = [
  { label: "Incident created", value: "incident.created" },
  { label: "Incident acknowledged", value: "incident.acknowledged" },
  { label: "Incident resolved", value: "incident.resolved" },
  { label: "Incident priority changed", value: "incident.priority_updated" },
];

const templateVariables = [
  { group: "Event", label: "Action", description: "Event name, such as incident.created", value: "{{event.action}}" },
  { group: "Event", label: "Resource type", description: "Resource that produced the event", value: "{{event.resource_type}}" },
  { group: "Event", label: "Resource ID", description: "ID of the incident or other resource", value: "{{event.resource_id}}" },
  { group: "Event", label: "Occurred at", description: "Event timestamp", value: "{{event.occurred_at}}" },
  { group: "Advanced", label: "All event", description: "Complete event object including metadata", value: "{{event}}" },
  { group: "Incident metadata", label: "Title", description: "Incident title when the trigger provides it", value: "{{event.metadata.title}}" },
  { group: "Incident metadata", label: "Severity", description: "critical, high, medium, or low", value: "{{event.metadata.severity}}" },
  { group: "Incident metadata", label: "Priority", description: "P1 through P5", value: "{{event.metadata.priority}}" },
  { group: "Incident metadata", label: "Status", description: "Current incident status", value: "{{event.metadata.status}}" },
  { group: "Incident metadata", label: "Service ID", description: "Owning service ID", value: "{{event.metadata.service_id}}" },
  { group: "Incident metadata", label: "Incident ID", description: "Incident ID when included in metadata", value: "{{event.metadata.incident_id}}" },
  { group: "Advanced", label: "All metadata", description: "Complete metadata object", value: "{{event.metadata}}" },
] as const;

const previewEvent = {
  id: "44fbeec6-20b3-40bb-a289-8811c95cbf3c",
  activity_log_id: "6af74d65-2c78-476d-b405-360984fcb79b",
  workspace_id: "79d6bca2-a7a6-44c4-bfe4-7972d925bff1",
  action: "incident.created",
  resource_type: "incident",
  resource_id: "8d57b880-3d2d-4c74-85e0-9b2fe05f8d89",
  actor_user_id: "180ed96c-5359-4d14-9d87-3b0f87656c6d",
  occurred_at: "2026-10-11T09:30:00.000Z",
  processed_at: null,
  origin: "activity",
  created_at: "2026-10-11T09:30:00.000Z",
  metadata: {
    title: "Checkout API latency",
    severity: "high",
    priority: "P1",
    status: "triggered",
    service_id: "checkout-api",
    incident_id: "8d57b880-3d2d-4c74-85e0-9b2fe05f8d89",
  },
};

const integrationCopy: Record<WorkspaceWebhookIntegrationType, { label: string; description: string; placeholder: string; example: Record<string, unknown> }> = {
  slack: {
    label: "Slack",
    description: "Send selected incident lifecycle events to a Slack incoming webhook.",
    placeholder: "https://hooks.slack.com/services/...",
    example: {
      text: "🚨 Incident: {{event.metadata.title}}\nSeverity: {{event.metadata.severity}}\nPriority: {{event.metadata.priority}}\nStatus: {{event.metadata.status}}\nService ID: {{event.metadata.service_id}}\nIncident ID: {{event.metadata.incident_id}}\nEvent: {{event.action}}\nResource: {{event.resource_type}} / {{event.resource_id}}\nOccurred at: {{event.occurred_at}}",
    },
  },
  discord: {
    label: "Discord",
    description: "Send selected incident lifecycle events to a Discord channel webhook.",
    placeholder: "https://discord.com/api/webhooks/...",
    example: {
      content: "🚨 Incident: {{event.metadata.title}}",
      embeds: [{
        title: "{{event.metadata.title}}",
        description: "Severity: {{event.metadata.severity}}\nPriority: {{event.metadata.priority}}\nStatus: {{event.metadata.status}}\nService ID: {{event.metadata.service_id}}\nIncident ID: {{event.metadata.incident_id}}\nEvent: {{event.action}}\nResource: {{event.resource_type}} / {{event.resource_id}}\nOccurred at: {{event.occurred_at}}",
      }],
    },
  },
  teams: {
    label: "Microsoft Teams",
    description: "Send selected incident lifecycle events to a Teams workflow webhook.",
    placeholder: "https://prod-00.region.logic.azure.com/...",
    example: {
      title: "{{event.metadata.title}}",
      severity: "{{event.metadata.severity}}",
      priority: "{{event.metadata.priority}}",
      status: "{{event.metadata.status}}",
      service_id: "{{event.metadata.service_id}}",
      incident_id: "{{event.metadata.incident_id}}",
      event_action: "{{event.action}}",
      resource_type: "{{event.resource_type}}",
      resource_id: "{{event.resource_id}}",
      occurred_at: "{{event.occurred_at}}",
    },
  },
  custom: {
    label: "Custom",
    description: "Send selected incident lifecycle events to any HTTPS endpoint that accepts JSON.",
    placeholder: "https://example.com/webhooks/incidents",
    example: { event: "{{event}}" },
  },
};

export function WebhookIntegrationsPanel({ canManage, serviceId, workspaceId }: { canManage: boolean; serviceId?: string | undefined; workspaceId?: string | undefined }) {
  const [activeType, setActiveType] = useState<WorkspaceWebhookIntegrationType>("slack");
  const workspaceQuery = useWorkspaceWebhookIntegrations(canManage && !serviceId ? workspaceId : undefined);
  const serviceQuery = useServiceWebhookIntegrations(canManage ? serviceId : undefined);
  const query = serviceId ? serviceQuery : workspaceQuery;
  const integration = query.data?.find((item) => item.type === activeType);

  if (!workspaceId && !serviceId) return <EmptyState message="Select a project first." title="No project selected" />;
  if (!canManage) return <EmptyState message="Notification management permission is required." title="Integrations are restricted" />;
  if (query.isLoading) return <LoadingState message="Loading webhook integrations..." />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load webhook integrations" />;

  return (
    <div className="grid gap-4 min-w-0">
      <div aria-label="Webhook services" className="flex items-center gap-1 overflow-x-auto" role="tablist">
        {integrationTypes.map((type) => (
          <TabButton
            active={activeType === type}
            {...(query.data?.find((item) => item.type === type)?.configured ? { count: 1 } : {})}
            id={`integration-tab-${type}`}
            key={type}
            label={integrationCopy[type].label}
            onClick={() => setActiveType(type)}
            panelId={`integration-panel-${type}`}
          />
        ))}
      </div>
      <IntegrationEditor integration={integration} serviceId={serviceId} type={activeType} workspaceId={workspaceId} />
    </div>
  );
}

function IntegrationEditor({
  integration,
  serviceId,
  type,
  workspaceId,
}: {
  integration: WorkspaceWebhookIntegration | ServiceWebhookIntegration | undefined;
  serviceId?: string | undefined;
  type: WorkspaceWebhookIntegrationType;
  workspaceId?: string | undefined;
}) {
  const copy = integrationCopy[type];
  const mutation = useUpdateWorkspaceWebhookIntegrationMutation(workspaceId ?? "");
  const serviceMutation = useUpdateServiceWebhookIntegrationMutation(serviceId ?? "");
  const isPending = mutation.isPending || serviceMutation.isPending;
  const initialBody = useMemo(() => JSON.stringify(integration?.details.default_body ?? copy.example, null, 2), [copy.example, integration?.details.default_body]);
  const [enabled, setEnabled] = useState(integration?.enabled ?? true);
  const [url, setUrl] = useState(integration?.details.url ?? "");
  const [body, setBody] = useState(initialBody);
  const [eventActions, setEventActions] = useState<WorkspaceWebhookIntegrationEventAction[]>(integration?.details.event_actions ?? ["incident.created"]);
  const [routingMode, setRoutingMode] = useState<ServiceWebhookRoutingMode>("routing_mode" in (integration ?? {}) ? (integration as ServiceWebhookIntegration).routing_mode : "inherit");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [variableSearch, setVariableSearch] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const payloadPreview = useMemo(() => buildPayloadPreview(body), [body]);
  const filteredVariables = useMemo(() => {
    const search = variableSearch.trim().toLowerCase();
    if (!search) return templateVariables;
    return templateVariables.filter((variable) =>
      `${variable.group} ${variable.label} ${variable.description} ${variable.value}`.toLowerCase().includes(search),
    );
  }, [variableSearch]);

  useEffect(() => {
    setEnabled(integration?.enabled ?? true);
    setUrl(integration?.details.url ?? "");
    setBody(initialBody);
    setEventActions(integration?.details.event_actions ?? ["incident.created"]);
    setRoutingMode("routing_mode" in (integration ?? {}) ? (integration as ServiceWebhookIntegration).routing_mode : "inherit");
    setError(null);
    setNotice(null);
    setVariableSearch("");
  }, [initialBody, integration?.details.event_actions, integration?.details.url, integration?.enabled, type]);

  const insertVariable = (value: string) => {
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? start;
    const nextBody = `${body.slice(0, start)}${value}${body.slice(end)}`;
    setBody(nextBody);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const formatPayload = () => {
    try {
      setBody(JSON.stringify(JSON.parse(body), null, 2));
      setError(null);
    } catch {
      setError("Fix the JSON syntax before formatting the payload.");
    }
  };

  const restoreExample = () => {
    setBody(JSON.stringify(copy.example, null, 2));
    setError(null);
  };

  const save = async () => {
    setError(null);
    setNotice(null);
    let parsedBody: Record<string, unknown>;
    try {
      const parsed = JSON.parse(body) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      parsedBody = parsed as Record<string, unknown>;
    } catch {
      setError("Payload must be a valid JSON object.");
      return;
    }
    if (!url.trim() && !(serviceId && routingMode === "inherit")) {
      setError("Enter the webhook URL before saving this integration.");
      return;
    }
    if (eventActions.length === 0) {
      setError("Select at least one incident event.");
      return;
    }
    try {
      const input = {
        enabled,
        url: url.trim() || null,
        default_body: parsedBody,
        event_actions: eventActions,
        ...(serviceId ? { routing_mode: routingMode } : {}),
      };
      if (serviceId) await serviceMutation.mutateAsync({ type, input });
      else await mutation.mutateAsync({
        type,
        input,
      });
      setNotice(`${copy.label} webhook saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the webhook integration.");
    }
  };

  const disconnect = async () => {
    setError(null);
    setNotice(null);
    try {
      if (serviceId) await serviceMutation.mutateAsync({ type, input: { enabled: false, url: null, default_body: null, routing_mode: "inherit" } });
      else await mutation.mutateAsync({ type, input: { enabled: false, url: null, default_body: null } });
      setBody(JSON.stringify(copy.example, null, 2));
      setNotice(`${copy.label} webhook disconnected.`);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Could not disconnect the webhook integration.");
    }
  };

  return (
    <Panel aria-labelledby={`integration-heading-${type}`} className="grid gap-4" id={`integration-panel-${type}`} padding="md" role="tabpanel">
      <div className="grid gap-1">
        <h3 className="m-0 text-ink text-[17px] font-[650]" id={`integration-heading-${type}`}>{copy.label} webhook</h3>
        <p className="m-0 text-ink-muted text-[13px] leading-[1.45]">{copy.description}</p>
      </div>
      <CheckboxField
        checked={enabled}
        disabled={isPending}
        label="Enable this destination"
        onChange={(event) => setEnabled(event.target.checked)}
      />
      {serviceId ? (
        <Field hint="Inherit uses the project destination, override uses only this service destination, and both sends to each." label="Routing">
          <Select disabled={isPending} onChange={(event) => setRoutingMode(event.target.value as ServiceWebhookRoutingMode)} value={routingMode}>
            <option value="inherit">Use project default</option>
            <option value="override">Use service integration instead</option>
            <option value="both">Send to both</option>
          </Select>
        </Field>
      ) : null}
      <Field
        hint="Anyone with this URL can post to the destination. Only users with integration management access can view it here."
        label="Webhook URL"
        required={!integration?.configured && !(serviceId && routingMode === "inherit")}
      >
        <TextInput
          autoComplete="url"
          disabled={isPending}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={copy.placeholder}
          type="url"
          value={url}
        />
      </Field>
      <fieldset className="grid gap-2 rounded-lg border border-hairline-soft p-3">
        <legend className="px-1 text-ink-muted text-[13px] font-semibold">Send notifications for</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {integrationEventOptions.map((option) => (
            <CheckboxField
              checked={eventActions.includes(option.value)}
              disabled={isPending}
              key={option.value}
              label={option.label}
              onChange={(event) => setEventActions((current) => event.target.checked
                ? [...current, option.value]
                : current.filter((value) => value !== option.value))}
            />
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)] xl:items-start">
        <div className="grid gap-2 min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="grid gap-1">
              <span className="text-ink-muted text-[13px] font-semibold leading-[1.2]">Default payload <span aria-hidden="true">*</span></span>
              <span className="text-ink-subtle text-xs leading-[1.35]">Sent for each selected incident lifecycle event. Workflow actions can provide a payload override.</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button disabled={isPending} onClick={restoreExample} size="sm" variant="ghost">Insert example</Button>
              <Button disabled={isPending} onClick={formatPayload} size="sm" variant="secondary">Format JSON</Button>
            </div>
          </div>
          <TextArea
            aria-label="Default payload JSON"
            className="font-mono text-xs min-h-72"
            disabled={isPending}
            onChange={(event) => setBody(event.target.value)}
            ref={bodyRef}
            spellCheck={false}
            value={body}
          />
          {payloadPreview.error ? <span className="text-danger text-xs leading-[1.35]">{payloadPreview.error}</span> : null}
        </div>

        <section aria-labelledby={`integration-variables-${type}`} className="grid gap-3 rounded-lg border border-hairline-soft bg-surface-2/45 p-3 min-w-0">
          <div className="grid gap-1">
            <h4 className="m-0 text-ink text-[13px] font-[750]" id={`integration-variables-${type}`}>Available variables</h4>
            <p className="m-0 text-ink-subtle text-xs leading-[1.4]">Select a variable to insert it at the cursor.</p>
          </div>
          <TextInput
            aria-label="Search payload variables"
            onChange={(event) => setVariableSearch(event.target.value)}
            placeholder="Search title, severity, ID..."
            type="search"
            value={variableSearch}
          />
          <div className="grid gap-3 max-h-72 overflow-y-auto pr-1">
            {groupVariables(filteredVariables).map(([group, variables]) => (
              <div className="grid gap-1" key={group}>
                <span className="text-ink-subtle text-[11px] font-[750] uppercase tracking-[0.04em]">{group}</span>
                {variables.map((variable) => (
                  <button
                    className="grid gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                    key={variable.value}
                    onClick={() => insertVariable(variable.value)}
                    type="button"
                  >
                    <span className="text-ink text-[13px] font-semibold">{variable.label}</span>
                    <code className="break-all text-accent text-xs">{variable.value}</code>
                    <span className="text-ink-subtle text-xs leading-[1.35]">{variable.description}</span>
                  </button>
                ))}
              </div>
            ))}
            {filteredVariables.length === 0 ? <p className="m-0 text-ink-muted text-xs">No variables match this search.</p> : null}
          </div>
          <p className="m-0 border-t border-hairline-soft pt-2 text-ink-subtle text-xs leading-[1.4]">
            Incident metadata depends on the event type. Use the preview to check the payload with sample values.
          </p>
        </section>
      </div>

      <section aria-labelledby={`integration-preview-${type}`} className="grid gap-2 rounded-lg border border-hairline-soft bg-surface-2/45 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-0.5">
            <h4 className="m-0 text-ink text-[13px] font-[750]" id={`integration-preview-${type}`}>Resolved preview</h4>
            <p className="m-0 text-ink-subtle text-xs">Sample incident.created event · values are illustrative</p>
          </div>
          {payloadPreview.unresolved.length > 0 ? <span className="text-warning text-xs">{payloadPreview.unresolved.length} unresolved</span> : null}
        </div>
        <pre className="m-0 max-h-72 overflow-auto rounded-md bg-canvas px-3 py-2.5 text-ink-muted text-xs leading-[1.5]"><code>{payloadPreview.output}</code></pre>
        {payloadPreview.unresolved.length > 0 ? (
          <p className="m-0 text-warning text-xs leading-[1.4]">Unknown in this sample: {payloadPreview.unresolved.join(", ")}</p>
        ) : null}
      </section>
      {error ? <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-danger text-xs" role="alert">{error}</div> : null}
      {notice ? <div className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-success text-xs" role="status">{notice}</div> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button disabled={!integration?.configured || isPending} onClick={() => void disconnect()} variant="danger">Disconnect</Button>
        <Button disabled={isPending} isLoading={isPending} onClick={() => void save()}>Save integration</Button>
      </div>
    </Panel>
  );
}

function groupVariables(variables: readonly (typeof templateVariables)[number][]) {
  const groups = new Map<string, Array<(typeof templateVariables)[number]>>();
  for (const variable of variables) {
    const entries = groups.get(variable.group) ?? [];
    entries.push(variable);
    groups.set(variable.group, entries);
  }
  return [...groups.entries()];
}

function buildPayloadPreview(body: string): { error: string | null; output: string; unresolved: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { error: "Payload must be valid JSON before it can be previewed.", output: "Invalid JSON", unresolved: [] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Payload must be a JSON object.", output: "Payload preview unavailable", unresolved: [] };
  }

  const unresolved = new Set<string>();
  const resolved = resolvePreviewValue(parsed, { event: previewEvent }, unresolved);
  return {
    error: null,
    output: JSON.stringify(resolved, null, 2),
    unresolved: [...unresolved],
  };
}

function resolvePreviewValue(value: unknown, context: Record<string, unknown>, unresolved: Set<string>): unknown {
  if (typeof value === "string") return resolvePreviewString(value, context, unresolved);
  if (Array.isArray(value)) return value.map((entry) => resolvePreviewValue(entry, context, unresolved));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolvePreviewValue(entry, context, unresolved)]),
    );
  }
  return value;
}

function resolvePreviewString(value: string, context: Record<string, unknown>, unresolved: Set<string>): unknown {
  const wholeMatch = value.match(/^{{\s*([^}]+?)\s*}}$/);
  if (wholeMatch?.[1]) {
    const resolved = readPreviewPath(context, wholeMatch[1]);
    if (resolved !== undefined) return resolved;
    unresolved.add(wholeMatch[1]);
    return value;
  }

  return value.replace(/{{\s*([^}]+?)\s*}}/g, (match, path: string) => {
    const resolved = readPreviewPath(context, path);
    if (resolved === undefined || resolved === null) {
      unresolved.add(path.trim());
      return match;
    }
    return typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved);
  });
}

function readPreviewPath(context: Record<string, unknown>, path: string): unknown {
  return path.trim().split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, context);
}
