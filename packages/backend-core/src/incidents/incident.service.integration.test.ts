import { randomUUID } from "node:crypto";

import { prisma } from "@im/db";
import { afterEach, beforeAll, expect, it } from "vitest";

import {
  assertIntegrationDatabaseReady,
  cleanupTestRecords,
  createTestServiceFixture,
  describeIfDatabase,
  type TestServiceFixture,
} from "../test-utils/db-fixtures";
import { IncidentService } from "./incident.service";

describeIfDatabase("IncidentService workflow events", () => {
  const incidentService = new IncidentService(prisma);
  const fixtures: TestServiceFixture[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
  });

  afterEach(async () => {
    for (const fixture of fixtures.splice(0).reverse()) {
      await cleanupTestRecords({
        serviceIds: [fixture.service],
        teamIds: [fixture.team],
        userIds: userIds.splice(0),
        workspaceIds: [fixture.workspace],
      });
    }
  });

  it("queues selected email and Twilio lifecycle notifications for original recipients", async () => {
    const fixture = await createTestServiceFixture();
    fixtures.push(fixture);
    const actorId = randomUUID();
    userIds.push(actorId);
    await prisma.user.create({ data: { id: actorId, email: `${actorId}@example.com`, name: "Lifecycle actor" } });
    await prisma.workspaceNotificationProviderSetting.createMany({
      data: ["email", "twilio"].map((provider) => ({
        workspaceId: fixture.workspace,
        provider,
        enabled: true,
        config: { event_actions: ["incident.created", "incident.acknowledged", "incident.resolved", "incident.priority_updated"] },
      })),
    });
    const incident = await incidentService.createManualIncident({
      priority: "P2", service_id: fixture.service, severity: "medium", source: "manual", title: "Lifecycle routing",
    });
    await prisma.notificationLog.createMany({
      data: [
        { channel: "email" as const, targetAddress: "responder@example.com" },
        { channel: "sms" as const, targetAddress: "+15551230000" },
        { channel: "phone" as const, targetAddress: "+15551230000" },
      ].map((target) => ({
        ...target,
        incidentId: incident.id,
        targetType: "user" as const,
        targetId: actorId,
        idempotencyKey: `${incident.id}:created:${target.channel}`,
      })),
    });

    await incidentService.updateIncidentPriority(incident.id, "P1", actorId);
    await incidentService.acknowledgeIncident(incident.id, actorId);
    await incidentService.resolveIncident(incident.id, actorId);

    const lifecycleLogs = await prisma.notificationLog.findMany({
      where: { incidentId: incident.id, eventAction: { not: "incident.created" } },
    });
    expect(lifecycleLogs).toHaveLength(9);
    expect(new Set(lifecycleLogs.map((log) => log.eventAction))).toEqual(new Set([
      "incident.priority_updated", "incident.acknowledged", "incident.resolved",
    ]));
  });

  it("includes every documented incident template variable in incident.created metadata", async () => {
    const fixture = await createTestServiceFixture();
    fixtures.push(fixture);

    const incident = await incidentService.createManualIncident({
      priority: "P2",
      service_id: fixture.service,
      severity: "medium",
      source: "manual",
      title: "Checkout latency",
    });
    const event = await prisma.workflowEvent.findFirstOrThrow({
      where: { action: "incident.created", resourceId: incident.id },
    });

    expect(event.metadata).toMatchObject({
      incident_id: incident.id,
      priority: "P2",
      service_id: fixture.service,
      severity: "medium",
      source: "manual",
      status: "triggered",
      title: "Checkout latency",
    });
  });

  it("summarizes response times, priorities, services, and notification delivery for the window", async () => {
    const fixture = await createTestServiceFixture();
    fixtures.push(fixture);
    const now = new Date("2026-11-17T12:00:00.000Z");
    const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
    const create = (title: string, priority: "P1" | "P3") => incidentService.createManualIncident({
      priority, service_id: fixture.service, severity: "high", source: "manual", title,
    });
    const [fast, slow, open, outside] = await Promise.all([
      create("Fast", "P1"), create("Slow", "P1"), create("Open", "P3"), create("Outside window", "P3"),
    ]);
    // Acknowledged after 2m / 6m, resolved after 10m / 30m; one still open; one created before the 7-day window.
    await prisma.incident.update({ where: { id: fast.id }, data: { status: "resolved", createdAt: minutesAgo(60), acknowledgedAt: minutesAgo(58), resolvedAt: minutesAgo(50) } });
    await prisma.incident.update({ where: { id: slow.id }, data: { status: "resolved", createdAt: minutesAgo(60), acknowledgedAt: minutesAgo(54), resolvedAt: minutesAgo(30) } });
    await prisma.incident.update({ where: { id: open.id }, data: { createdAt: minutesAgo(5) } });
    await prisma.incident.update({ where: { id: outside.id }, data: { createdAt: minutesAgo(8 * 24 * 60) } });
    await prisma.notificationLog.createMany({
      data: (["sent", "failed", "skipped"] as const).map((status) => ({
        incidentId: fast.id, channel: "email" as const, status, targetType: "user" as const, targetId: randomUUID(),
        targetAddress: "responder@example.com", idempotencyKey: `${fast.id}:metrics:${status}`, createdAt: minutesAgo(59),
      })),
    });

    const metrics = await incidentService.getIncidentMetrics(fixture.workspace, 7, now);

    expect(metrics).toMatchObject({
      incident_count: 3,
      acknowledged_count: 2,
      resolved_count: 2,
      time_to_acknowledge: { average_seconds: 240, median_seconds: 240 },
      time_to_resolve: { average_seconds: 1200, median_seconds: 1200 },
      by_priority: [{ priority: "P1", incident_count: 2 }, { priority: "P3", incident_count: 1 }],
      by_service: [{ service_id: fixture.service, incident_count: 3, open_count: 1, median_resolve_seconds: 1200 }],
      // Skipped deliveries are excluded from the total.
      notifications: { total: 2, delivered: 1, failed: 1 },
    });
  });
});

