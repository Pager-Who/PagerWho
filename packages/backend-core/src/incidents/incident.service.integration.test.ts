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
});

