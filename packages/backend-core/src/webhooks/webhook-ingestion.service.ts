import type {
  Incident,
  IncidentPriority,
  IncidentSeverity,
  NormalizedWebhookEvent,
  WebhookIngestionResult,
} from "@im/contracts";
import { Prisma, type PrismaClient, type TransactionClient } from "@im/db";

import { IncidentService } from "../incidents";
import { recordActivityLog } from "../activity";
import { WebhookIngestionError } from "./webhook.errors";
import { type WebhookSecretOptions, verifyWebhookSecret } from "./webhook-secret";

type IncidentRecord = {
  id: string;
  workspaceId: string;
  serviceId: string;
  title: string;
  description: string | null;
  severity: string;
  priority: string;
  status: string;
  source: string;
  fingerprint: string;
  dedupKey: string | null;
  acknowledgedById: string | null;
  acknowledgedAt: Date | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PayloadObject = Record<string, unknown>;
type WebhookReceiveOptions = {
  skipSecretVerification?: boolean;
  token?: string;
};
type WebhookIngestionTransactionResult = {
  action: "created" | "merged" | "resolved" | "duplicate";
  eventId: string;
  incident: IncidentRecord;
};
type WebhookEndpointRecord = Prisma.WebhookEndpointGetPayload<{
  include: {
    service: {
      include: {
        escalationPolicy: {
          include: {
            steps: true;
          };
        };
      };
    };
  };
}>;

const webhookFingerprintLockNamespace = "pagerwho:webhook:fingerprint";

export class WebhookIngestionService {
  private readonly incidentService: IncidentService;

  constructor(
    private readonly db: PrismaClient,
    private readonly options: WebhookSecretOptions = {},
  ) {
    this.incidentService = new IncidentService(db);
  }

  async receive(
    endpointId: string,
    payload: unknown,
    receiveOptions: WebhookReceiveOptions = {},
  ): Promise<WebhookIngestionResult> {
    const endpoint = await this.findWebhookEndpoint(endpointId);

    if (!endpoint) {
      throw new WebhookIngestionError("webhook_endpoint_not_found", "Webhook endpoint not found");
    }

    if (endpoint.disabledAt) {
      throw new WebhookIngestionError("webhook_endpoint_disabled", "Webhook endpoint is disabled");
    }

    if (!receiveOptions.skipSecretVerification && !await verifyWebhookSecret(receiveOptions.token, endpoint.secretHash, this.options)) {
      throw new WebhookIngestionError("webhook_secret_invalid", "Invalid webhook secret");
    }

    const normalizedEvent = this.normalizePayload(payload);

    const result = await this.receiveNormalizedEvent(endpoint, normalizedEvent);

    return {
      event_id: result.eventId,
      incident: this.mapIncident(result.incident),
      normalized_event: normalizedEvent,
      action: result.action,
    };
  }

  private async receiveNormalizedEvent(
    endpoint: WebhookEndpointRecord | null,
    normalizedEvent: NormalizedWebhookEvent,
  ): Promise<WebhookIngestionTransactionResult> {
    if (!endpoint) {
      throw new WebhookIngestionError("webhook_endpoint_not_found", "Webhook endpoint not found");
    }

    try {
      return await this.db.$transaction(async (tx) => {
        await this.lockIncidentFingerprint(tx, endpoint.serviceId, normalizedEvent.fingerprint);

        return this.upsertIncidentEventInTransaction(tx, endpoint, normalizedEvent);
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const duplicateEvent = await this.findExistingIncidentEvent(endpoint.serviceId, normalizedEvent.event_key);

      if (!duplicateEvent?.incident) {
        throw error;
      }

      return {
        action: "duplicate",
        eventId: duplicateEvent.id,
        incident: duplicateEvent.incident,
      };
    }
  }

  private async upsertIncidentEventInTransaction(
    tx: TransactionClient,
    endpoint: WebhookEndpointRecord,
    normalizedEvent: NormalizedWebhookEvent,
  ): Promise<WebhookIngestionTransactionResult> {
    const existingEvent = await tx.incidentEvent.findUnique({
      where: {
        serviceId_eventKey: {
          serviceId: endpoint.serviceId,
          eventKey: normalizedEvent.event_key,
        },
      },
      include: {
        incident: true,
      },
    });

    if (existingEvent?.incident && normalizedEvent.status === "resolved" && existingEvent.incident.status !== "resolved") {
      const incident = await this.resolveIncidentFromWebhookInTransaction(
        tx,
        endpoint,
        normalizedEvent,
        existingEvent.incident,
        existingEvent.id,
        true,
      );
      await tx.incidentEvent.update({
        where: { id: existingEvent.id },
        data: {
          rawPayload: this.toJsonPayload(normalizedEvent.raw_payload),
          normalizedPayload: this.toJsonPayload(normalizedEvent),
        },
      });
      return { action: "resolved", eventId: existingEvent.id, incident };
    }

    if (existingEvent?.incident) {
      return {
        action: "duplicate" as const,
        eventId: existingEvent.id,
        incident: existingEvent.incident,
      };
    }

    const openIncident = await tx.incident.findFirst({
      where: {
        serviceId: endpoint.serviceId,
        fingerprint: normalizedEvent.fingerprint,
        status: {
          in: ["triggered", "acknowledged"],
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (normalizedEvent.status === "resolved") {
      const current = openIncident ?? await tx.incident.findFirst({
        where: { serviceId: endpoint.serviceId, fingerprint: normalizedEvent.fingerprint },
        orderBy: { createdAt: "desc" },
      });
      const resolvedAt = new Date();
      const incident = current
        ? await tx.incident.update({
            where: { id: current.id },
            data: { status: "resolved", resolvedAt },
          })
        : await tx.incident.create({
            data: {
              workspaceId: endpoint.service.workspaceId,
              serviceId: endpoint.serviceId,
              title: normalizedEvent.title,
              description: normalizedEvent.description,
              severity: normalizedEvent.severity,
              priority: normalizedEvent.priority,
              status: "resolved",
              resolvedAt,
              source: normalizedEvent.source,
              fingerprint: normalizedEvent.fingerprint,
              dedupKey: normalizedEvent.event_key,
            },
          });
      const event = await tx.incidentEvent.create({
        data: {
          serviceId: endpoint.serviceId,
          incidentId: incident.id,
          webhookEndpointId: endpoint.id,
          eventKey: normalizedEvent.event_key,
          rawPayload: this.toJsonPayload(normalizedEvent.raw_payload),
          normalizedPayload: this.toJsonPayload(normalizedEvent),
        },
      });
      const resolvedIncident = await this.resolveIncidentFromWebhookInTransaction(
        tx,
        endpoint,
        normalizedEvent,
        incident,
        event.id,
        current?.status !== "resolved",
      );
      return { action: "resolved", eventId: event.id, incident: resolvedIncident };
    }

    const incident = openIncident
      ?? await tx.incident.create({
        data: {
          workspaceId: endpoint.service.workspaceId,
          serviceId: endpoint.serviceId,
          title: normalizedEvent.title,
          description: normalizedEvent.description,
          severity: normalizedEvent.severity,
          priority: normalizedEvent.priority,
          source: normalizedEvent.source,
          fingerprint: normalizedEvent.fingerprint,
          status: normalizedEvent.status,
          dedupKey: normalizedEvent.event_key,
        },
      });
    const action = openIncident ? "merged" as const : "created" as const;

    const event = await tx.incidentEvent.create({
      data: {
        serviceId: endpoint.serviceId,
        incidentId: incident.id,
        webhookEndpointId: endpoint.id,
        eventKey: normalizedEvent.event_key,
        rawPayload: this.toJsonPayload(normalizedEvent.raw_payload),
        normalizedPayload: this.toJsonPayload({
          title: normalizedEvent.title,
          description: normalizedEvent.description,
          severity: normalizedEvent.severity,
          priority: normalizedEvent.priority,
          source: normalizedEvent.source,
          event_key: normalizedEvent.event_key,
          fingerprint: normalizedEvent.fingerprint,
        }),
      },
    });

    await tx.incidentTimelineEntry.create({
      data: {
        incidentId: incident.id,
        type: action === "created" ? "incident.created" : "incident.event_attached",
        message: action === "created"
          ? `Incident created from webhook: ${normalizedEvent.title}`
          : `Webhook event attached: ${normalizedEvent.title}`,
        metadata: {
          event_id: event.id,
          event_key: normalizedEvent.event_key,
          endpoint_id: endpoint.id,
          priority: normalizedEvent.priority,
        },
      },
    });

    if (action === "created") {
      await this.incidentService.startEscalationForIncidentInTransaction(tx, {
        incidentId: incident.id,
        policy: endpoint.service.escalationPolicy,
      });
      await recordActivityLog(tx, {
        workspaceId: incident.workspaceId,
        resourceType: "incident",
        resourceId: incident.id,
        action: "incident.created",
        message: `Incident created from webhook: ${incident.title}`,
        metadata: {
          incident_id: incident.id,
          service_id: incident.serviceId,
          priority: incident.priority,
          severity: incident.severity,
          source: incident.source,
          status: incident.status,
          title: incident.title,
        },
      });
    }

    return {
      action,
      eventId: event.id,
      incident,
    };
  }

  private async resolveIncidentFromWebhookInTransaction(
    tx: TransactionClient,
    endpoint: WebhookEndpointRecord,
    normalizedEvent: NormalizedWebhookEvent,
    incident: IncidentRecord,
    eventId: string,
    recordTransition: boolean,
  ): Promise<IncidentRecord> {
    const resolvedIncident = incident.status === "resolved"
      ? incident
      : await tx.incident.update({
          where: { id: incident.id },
          data: { status: "resolved", resolvedAt: new Date() },
        });

    if (!recordTransition) return resolvedIncident;

    await tx.incidentTimelineEntry.create({
      data: {
        incidentId: resolvedIncident.id,
        type: "incident.resolved",
        message: "Incident resolved by service webhook",
        metadata: { endpoint_id: endpoint.id, event_id: eventId, event_key: normalizedEvent.event_key },
      },
    });
    await tx.incidentEscalationState.updateMany({
      where: { incidentId: resolvedIncident.id, status: { in: ["active", "paused"] } },
      data: { status: "stopped", nextRunAt: null },
    });
    await this.incidentService.skipOpenNotificationsInTransaction(
      tx,
      resolvedIncident.id,
      resolvedIncident.workspaceId,
      "Incident is resolved",
    );
    await recordActivityLog(tx, {
      workspaceId: resolvedIncident.workspaceId,
      resourceType: "incident",
      resourceId: resolvedIncident.id,
      action: "incident.resolved",
      message: "Incident resolved by service webhook",
      metadata: {
        incident_id: resolvedIncident.id,
        service_id: resolvedIncident.serviceId,
        priority: resolvedIncident.priority,
        severity: resolvedIncident.severity,
        status: resolvedIncident.status,
        title: resolvedIncident.title,
      },
    });
    await this.incidentService.queueLifecycleNotificationsInTransaction(
      tx,
      resolvedIncident,
      "incident.resolved",
    );
    return resolvedIncident;
  }

  private findWebhookEndpoint(endpointId: string) {
    return this.db.webhookEndpoint.findUnique({
      where: {
        id: endpointId,
      },
      include: {
        service: {
          include: {
            escalationPolicy: {
              include: {
                steps: {
                  orderBy: {
                    stepOrder: "asc",
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private findExistingIncidentEvent(serviceId: string, eventKey: string) {
    return this.db.incidentEvent.findUnique({
      where: {
        serviceId_eventKey: {
          serviceId,
          eventKey,
        },
      },
      include: {
        incident: true,
      },
    });
  }

  private async lockIncidentFingerprint(
    tx: TransactionClient,
    serviceId: string,
    fingerprint: string,
  ): Promise<void> {
    const lockKey = `${serviceId}:${fingerprint}`;

    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${webhookFingerprintLockNamespace}), hashtext(${lockKey}))
    `;
  }

  private normalizePayload(payload: unknown): NormalizedWebhookEvent {
    const object = this.asObject(payload);

    if (this.isGrafanaPayload(object)) {
      return this.normalizeGrafanaPayload(object, payload);
    }

    if (this.isSentryPayload(object)) {
      return this.normalizeSentryPayload(object, payload);
    }

    if (this.isDatadogPayload(object)) {
      return this.normalizeDatadogPayload(object, payload);
    }

    return this.normalizeGenericPayload(object, payload);
  }

  private normalizeDatadogPayload(object: PayloadObject, payload: unknown): NormalizedWebhookEvent {
    const rawText = this.stableStringify(payload);
    const title = this.requireTitle(
      this.firstString(object, ["alert_title", "title", "event_title", "monitor_name", "summary", "message"]),
    );
    const description = this.firstDescription(object, ["alert_body", "body", "message", "description", "details", "detail"]);
    const eventKey = this.firstString(object, ["event_key", "eventKey", "alert_id", "id", "event_id"])
      ?? this.hashString(rawText);
    const fingerprint = this.firstString(object, ["aggregation_key", "alert_id", "monitor_id", "fingerprint"])
      ?? this.hashString(`datadog:${title}`);

    const severity = this.normalizeSeverity(this.firstString(object, ["alert_priority", "priority", "severity", "status"]));

    return {
      title,
      description,
      severity,
      priority: this.normalizePriority(this.firstString(object, ["alert_priority", "priority"]), severity),
      source: "datadog",
      event_key: eventKey,
      fingerprint,
      status: this.normalizeIncidentStatus(this.firstString(object, ["alert_transition", "status", "state"])),
      raw_payload: payload,
    };
  }

  private normalizeGrafanaPayload(object: PayloadObject, payload: unknown): NormalizedWebhookEvent {
    const rawText = this.stableStringify(payload);
    const alerts = Array.isArray(object.alerts) ? object.alerts.filter((alert): alert is PayloadObject => this.isPayloadObject(alert)) : [];
    const firstAlert = alerts[0] ?? {};
    const commonLabels = this.asObject(object.commonLabels);
    const commonAnnotations = this.asObject(object.commonAnnotations);
    const labels = this.asObject(firstAlert.labels);
    const annotations = this.asObject(firstAlert.annotations);
    const title = this.requireTitle(this.firstString(commonAnnotations, ["summary", "title"])
      ?? this.firstString(annotations, ["summary", "title"])
      ?? this.firstString(commonLabels, ["alertname"])
      ?? this.firstString(labels, ["alertname"]));
    const description = this.firstDescription(commonAnnotations, ["description", "details", "detail"])
      ?? this.firstString(annotations, ["description"])
      ?? this.firstStructuredDescription(annotations, ["details", "detail"])
      ?? null;
    const fingerprint = this.firstString(firstAlert, ["fingerprint"])
      ?? this.firstString(commonLabels, ["alertname"])
      ?? this.hashString(`grafana:${title}`);
    const eventKey = [
      fingerprint,
      this.firstString(object, ["status"]) ?? "unknown",
      this.firstString(firstAlert, ["startsAt"]) ?? this.hashString(rawText),
    ].join(":");

    const severity = this.normalizeSeverity(this.firstString(labels, ["severity", "priority"]) ?? this.firstString(object, ["status"]));

    return {
      title,
      description,
      severity,
      priority: this.normalizePriority(this.firstString(labels, ["priority"]) ?? this.firstString(commonLabels, ["priority"]), severity),
      source: "grafana",
      event_key: eventKey,
      fingerprint,
      status: this.normalizeIncidentStatus(this.firstString(object, ["status"]) ?? this.firstString(firstAlert, ["status", "state"])),
      raw_payload: payload,
    };
  }

  private normalizeSentryPayload(object: PayloadObject, payload: unknown): NormalizedWebhookEvent {
    const rawText = this.stableStringify(payload);
    const event = this.asObject(object.event);
    const issue = this.asObject(object.issue);
    const project = this.asObject(object.project);
    const title = this.requireTitle(this.firstString(issue, ["title"])
      ?? this.firstString(event, ["title", "message"])
      ?? this.firstString(object, ["title", "message", "culprit"])
      ?? this.firstString(project, ["name", "slug"]));
    const description = this.firstString(event, ["message"])
      ?? this.firstDescription(object, ["description", "details", "detail", "culprit", "url"])
      ?? null;
    const eventKey = this.firstString(object, ["event_id", "id"])
      ?? this.firstString(event, ["event_id", "id"])
      ?? this.hashString(rawText);
    const fingerprint = this.firstString(issue, ["id", "shortId"])
      ?? this.firstString(object, ["issue_id"])
      ?? this.hashString(`sentry:${this.firstString(project, ["slug", "name"]) ?? "project"}:${title}`);

    const severity = this.normalizeSeverity(this.firstString(event, ["level"]) ?? this.firstString(object, ["level"]));

    return {
      title,
      description,
      severity,
      priority: this.normalizePriority(this.firstString(event, ["priority"]) ?? this.firstString(object, ["priority"]), severity),
      source: "sentry",
      event_key: eventKey,
      fingerprint,
      status: this.normalizeIncidentStatus(this.firstString(object, ["action", "status", "state"])),
      raw_payload: payload,
    };
  }

  private normalizeGenericPayload(object: PayloadObject, payload: unknown): NormalizedWebhookEvent {
    const rawText = this.stableStringify(payload);
    const title = this.requireTitle(this.firstString(object, ["title"]));
    const description = this.firstDescription(object, ["description", "details", "detail", "body"]);
    const severity = this.normalizeSeverity(this.firstString(object, ["severity", "level", "status", "priority"]));
    const source = this.firstString(object, ["source", "provider", "monitor", "service"]) ?? "webhook";
    const eventKey = this.firstString(object, ["event_key", "eventKey", "event_id", "eventId", "dedup_key", "dedupKey", "id"])
      ?? this.hashString(rawText);
    const fingerprint = this.firstString(object, ["fingerprint", "dedup_key", "dedupKey", "alert_key", "alertKey"])
      ?? this.hashString(`${source}:${title}`);

    return {
      title,
      description,
      severity,
      priority: this.normalizePriority(this.firstString(object, ["priority", "incident_priority"]), severity),
      source,
      event_key: eventKey,
      fingerprint,
      status: this.normalizeIncidentStatus(this.firstString(object, ["status", "state", "action", "event_type", "eventType"])),
      raw_payload: payload,
    };
  }

  private isDatadogPayload(object: PayloadObject) {
    return this.hasAnyKey(object, ["alert_id", "alert_title", "alert_transition", "alert_priority", "aggregation_key"])
      || this.firstString(object, ["source", "provider"])?.toLowerCase() === "datadog";
  }

  private isGrafanaPayload(object: PayloadObject) {
    return Array.isArray(object.alerts)
      || this.hasAnyKey(object, ["receiver", "commonLabels", "commonAnnotations"])
      || this.firstString(object, ["source", "provider"])?.toLowerCase() === "grafana";
  }

  private isSentryPayload(object: PayloadObject) {
    return this.hasAnyKey(object, ["event", "issue", "project", "event_id", "culprit"])
      || this.firstString(object, ["source", "provider"])?.toLowerCase() === "sentry";
  }

  private hasAnyKey(object: PayloadObject, keys: string[]) {
    return keys.some((key) => Object.prototype.hasOwnProperty.call(object, key));
  }

  private normalizeSeverity(value: string | undefined): IncidentSeverity {
    const normalized = value?.toLowerCase();

    if (!normalized) {
      return "medium";
    }

    if (["critical", "crit", "p1", "sev1", "down"].includes(normalized)) {
      return "critical";
    }

    if (["high", "p2", "sev2", "error"].includes(normalized)) {
      return "high";
    }

    if (["medium", "warning", "warn", "p3", "sev3", "degraded"].includes(normalized)) {
      return "medium";
    }

    return "low";
  }

  private normalizeIncidentStatus(value: string | undefined): "triggered" | "resolved" {
    const normalized = value?.trim().toLowerCase();
    return normalized && ["resolved", "resolve", "recovered", "recovery", "ok", "closed", "fixed"].includes(normalized)
      ? "resolved"
      : "triggered";
  }

  private normalizePriority(value: string | undefined, severity: IncidentSeverity): IncidentPriority {
    const normalized = value?.toLowerCase();

    if (normalized) {
      if (["p1", "priority1", "priority_1", "sev1", "severity1"].includes(normalized)) {
        return "P1";
      }

      if (["p2", "priority2", "priority_2", "sev2", "severity2"].includes(normalized)) {
        return "P2";
      }

      if (["p3", "priority3", "priority_3", "sev3", "severity3"].includes(normalized)) {
        return "P3";
      }

      if (["p4", "priority4", "priority_4", "sev4", "severity4"].includes(normalized)) {
        return "P4";
      }

      if (["p5", "priority5", "priority_5", "sev5", "severity5"].includes(normalized)) {
        return "P5";
      }
    }

    return priorityFromSeverity(severity);
  }

  private asObject(value: unknown): PayloadObject {
    return this.isPayloadObject(value)
      ? value as PayloadObject
      : {};
  }

  private isPayloadObject(value: unknown): value is PayloadObject {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private firstString(object: PayloadObject, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = object[key];

      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }

      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
    }

    return undefined;
  }

  private requireTitle(value: string | undefined): string {
    if (value) {
      return value;
    }

    throw new WebhookIngestionError(
      "webhook_payload_invalid",
      "Webhook payload must include title, or a supported provider-specific title field.",
    );
  }

  private firstDescription(object: PayloadObject, keys: string[]): string | null {
    return this.firstString(object, keys) ?? this.firstStructuredDescription(object, keys);
  }

  private firstStructuredDescription(object: PayloadObject, keys: string[]): string | null {
    for (const key of keys) {
      const value = object[key];

      if (value && typeof value === "object") {
        return this.truncateDescription(this.stableStringify(value));
      }
    }

    return null;
  }

  private truncateDescription(value: string): string {
    return value.length > 4_000 ? `${value.slice(0, 4_000)}...` : value;
  }

  private stableStringify(value: unknown): string {
    return JSON.stringify(value, Object.keys(this.flattenKeys(value)).sort());
  }

  private flattenKeys(value: unknown, keys: Record<string, true> = {}): Record<string, true> {
    if (!value || typeof value !== "object") {
      return keys;
    }

    for (const key of Object.keys(value)) {
      keys[key] = true;
      this.flattenKeys((value as Record<string, unknown>)[key], keys);
    }

    return keys;
  }

  private toJsonPayload(value: unknown) {
    return JSON.parse(JSON.stringify(value ?? null)) as object;
  }

  private hashString(value: string): string {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
    }

    return `wh_${Math.abs(hash).toString(16)}`;
  }

  private mapIncident(incident: IncidentRecord): Incident {
    return {
      id: incident.id,
      workspace_id: incident.workspaceId,
      service_id: incident.serviceId,
      title: incident.title,
      description: incident.description,
      severity: incident.severity as Incident["severity"],
      priority: incident.priority as Incident["priority"],
      status: incident.status as Incident["status"],
      source: incident.source,
      fingerprint: incident.fingerprint,
      dedup_key: incident.dedupKey,
      acknowledged_by: incident.acknowledgedById,
      acknowledged_at: incident.acknowledgedAt?.toISOString() ?? null,
      resolved_by: incident.resolvedById,
      resolved_at: incident.resolvedAt?.toISOString() ?? null,
      created_at: incident.createdAt.toISOString(),
      updated_at: incident.updatedAt.toISOString(),
    };
  }
}

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function priorityFromSeverity(severity: IncidentSeverity): IncidentPriority {
  if (severity === "critical") {
    return "P1";
  }

  if (severity === "high") {
    return "P2";
  }

  if (severity === "medium") {
    return "P3";
  }

  return "P4";
}
