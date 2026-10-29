import { randomUUID } from "node:crypto";

import { prisma } from "@im/db";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";

import {
  assertIntegrationDatabaseReady,
  cleanupTestRecords,
  createTestServiceFixture,
  describeIfDatabase,
} from "../test-utils/db-fixtures";
import { WebhookIngestionService } from "./webhook-ingestion.service";
import { hashWebhookSecret } from "./webhook-secret";

describeIfDatabase("WebhookIngestionService idempotency", () => {
  const secret = "webhook-concurrency-test-secret";
  const ids = {
    endpoint: randomUUID(),
    service: randomUUID(),
    team: randomUUID(),
    workspace: randomUUID(),
  };
  const service = new WebhookIngestionService(prisma);

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
  });

  beforeEach(async () => {
    await cleanup();
    await createTestServiceFixture({
      workspace: {
        id: ids.workspace,
        name: "Webhook Concurrency Test Workspace",
        slug: `webhook-concurrency-${ids.workspace}`,
      },
      team: {
        id: ids.team,
        name: "Webhook Concurrency Test Team",
      },
      service: {
        id: ids.service,
        name: "Webhook Concurrency Test Service",
      },
    });
    await prisma.webhookEndpoint.create({
      data: {
        id: ids.endpoint,
        serviceId: ids.service,
        name: "Webhook Concurrency Test Endpoint",
        secretHash: await hashWebhookSecret(secret),
      },
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("rejects webhook payloads that cannot produce an incident title", async () => {
    await expect(service.receive(ids.endpoint, {
      details: {
        metric: "http.server.duration.p95",
        threshold: "3s",
      },
      event_key: `missing-title-${randomUUID()}`,
      severity: "critical",
    }, { token: secret })).rejects.toMatchObject({
      code: "webhook_payload_invalid",
    });
  });

  it("creates an incident from the minimum generic webhook payload", async () => {
    const result = await service.receive(ids.endpoint, {
      title: "Minimum webhook incident",
    }, { token: secret });

    expect(result.action).toBe("created");
    expect(result.incident.title).toBe("Minimum webhook incident");
    expect(result.incident.description).toBeNull();
    expect(result.incident.severity).toBe("medium");
    expect(result.incident.priority).toBe("P3");
    expect(result.incident.source).toBe("webhook");
    expect(result.incident.fingerprint).toMatch(/^wh_/);
    expect(result.incident.dedup_key).toMatch(/^wh_/);
  });

  it("uses structured details as the incident description", async () => {
    const result = await service.receive(ids.endpoint, {
      details: {
        metric: "http.server.duration.p95",
        threshold: "3s",
        value: "3.4s",
      },
      event_key: `structured-details-${randomUUID()}`,
      fingerprint: `structured-details-${randomUUID()}`,
      priority: "P1",
      severity: "critical",
      title: "Structured details webhook event",
    }, { token: secret });

    expect(result.action).toBe("created");
    expect(result.incident.title).toBe("Structured details webhook event");
    expect(result.incident.priority).toBe("P1");
    expect(result.incident.description).toContain("\"metric\":\"http.server.duration.p95\"");
    expect(result.incident.description).toContain("\"threshold\":\"3s\"");
  });

  it("resolves the matching open incident when the same event key reports recovery", async () => {
    const fingerprint = `resolved-fingerprint-${randomUUID()}`;
    const eventKey = `lifecycle-${randomUUID()}`;
    const created = await service.receive(ids.endpoint, {
      event_key: eventKey,
      fingerprint,
      severity: "high",
      status: "triggered",
      title: "Checkout latency",
    }, { token: secret });

    const resolved = await service.receive(ids.endpoint, {
      event_key: eventKey,
      fingerprint,
      severity: "high",
      status: "resolved",
      title: "Checkout latency",
    }, { token: secret });

    expect(resolved.action).toBe("resolved");
    expect(resolved.incident.id).toBe(created.incident.id);
    expect(resolved.incident.status).toBe("resolved");
    const repeatedResolve = await service.receive(ids.endpoint, {
      event_key: eventKey,
      fingerprint,
      severity: "high",
      status: "resolved",
      title: "Checkout latency",
    }, { token: secret });
    expect(repeatedResolve.action).toBe("duplicate");
    await expect(prisma.incidentEvent.count({
      where: { serviceId: ids.service, eventKey },
    })).resolves.toBe(1);
    await expect(prisma.workflowEvent.count({
      where: { action: "incident.resolved", resourceId: created.incident.id },
    })).resolves.toBe(1);
  });

  it("returns duplicate for concurrent deliveries with the same event key", async () => {
    const eventKey = `same-event-${randomUUID()}`;
    const payload = {
      event_key: eventKey,
      fingerprint: `same-fingerprint-${randomUUID()}`,
      title: "Concurrent duplicate webhook event",
      severity: "critical",
      source: "test",
    };

    const results = await Promise.all([
      service.receive(ids.endpoint, payload, { token: secret }),
      service.receive(ids.endpoint, payload, { token: secret }),
    ]);

    expect(results.map((result) => result.action).sort()).toEqual(["created", "duplicate"]);
    expect(new Set(results.map((result) => result.incident.id)).size).toBe(1);

    await expect(prisma.incidentEvent.count({
      where: {
        serviceId: ids.service,
        eventKey,
      },
    })).resolves.toBe(1);
  });

  it("merges concurrent deliveries with different event keys and the same fingerprint", async () => {
    const fingerprint = `shared-fingerprint-${randomUUID()}`;
    const firstPayload = {
      event_key: `first-event-${randomUUID()}`,
      fingerprint,
      title: "Concurrent fingerprint webhook event",
      severity: "critical",
      source: "test",
    };
    const secondPayload = {
      event_key: `second-event-${randomUUID()}`,
      fingerprint,
      title: "Concurrent fingerprint webhook event",
      severity: "critical",
      source: "test",
    };

    const results = await Promise.all([
      service.receive(ids.endpoint, firstPayload, { token: secret }),
      service.receive(ids.endpoint, secondPayload, { token: secret }),
    ]);

    expect(results.map((result) => result.action).sort()).toEqual(["created", "merged"]);
    expect(new Set(results.map((result) => result.incident.id)).size).toBe(1);

    await expect(prisma.incident.count({
      where: {
        serviceId: ids.service,
        fingerprint,
      },
    })).resolves.toBe(1);
    await expect(prisma.incidentEvent.count({
      where: {
        serviceId: ids.service,
        eventKey: {
          in: [firstPayload.event_key, secondPayload.event_key],
        },
      },
    })).resolves.toBe(2);
  });

  async function cleanup() {
    await cleanupTestRecords({
      serviceIds: [ids.service],
      teamIds: [ids.team],
      webhookEndpointIds: [ids.endpoint],
      workspaceIds: [ids.workspace],
    });
  }
});
