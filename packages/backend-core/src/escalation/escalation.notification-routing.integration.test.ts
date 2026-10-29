import { randomUUID } from "node:crypto";

import { prisma } from "@im/db";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";

import { assertIntegrationDatabaseReady, cleanupTestRecords, describeIfDatabase } from "../test-utils/db-fixtures";
import { EscalationService } from "./escalation.service";

describeIfDatabase("EscalationService notification routing", () => {
  const ids = {
    workspace: randomUUID(),
    user: randomUUID(),
    team: randomUUID(),
    policy: randomUUID(),
    step: randomUUID(),
    service: randomUUID(),
    schedule: randomUUID(),
    rotation: randomUUID(),
    incident: randomUUID(),
  };
  const escalationService = new EscalationService(prisma);

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.workspace.create({
      data: {
        id: ids.workspace,
        name: "Routing Test Workspace",
        slug: `routing-test-${ids.workspace}`,
      },
    });
    await prisma.user.create({
      data: {
        id: ids.user,
        email: "routing-test@example.com",
        name: "Routing Test User",
        notificationContacts: {
          create: [
            {
              type: "slack_webhook",
              address: "https://hooks.slack.com/services/T00000000/B00000000/ROUTINGTEST",
            },
            {
              type: "email_webhook",
              address: "https://email-relay.example.com/routing-test",
            },
            {
              type: "phone_number",
              address: "+15551230000",
            },
            {
              type: "phone_sms",
              address: "+15551230000",
              verifiedAt: new Date(),
              verificationProvider: "test",
            },
            {
              type: "phone_voice",
              address: "+15551230000",
              verifiedAt: new Date(),
              verificationProvider: "test",
            },
          ],
        },
        notificationPreferences: {
          create: [
            { channel: "slack", enabled: true, delaySeconds: 0 },
            { channel: "email", enabled: true, delaySeconds: 0 },
            { channel: "sms", enabled: true, delaySeconds: 300 },
            { channel: "phone", enabled: true, delaySeconds: 600 },
          ],
        },
      },
    });
    await prisma.team.create({
      data: {
        id: ids.team,
        workspaceId: ids.workspace,
        name: "Routing Test Team",
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ids.workspace,
        userId: ids.user,
        role: "responder",
      },
    });
    await prisma.teamMember.create({
      data: {
        teamId: ids.team,
        userId: ids.user,
        role: "primary",
      },
    });
    await prisma.escalationPolicy.create({
      data: {
        id: ids.policy,
        workspaceId: ids.workspace,
        name: "Routing Test Policy",
        repeatEnabled: false,
        steps: {
          create: {
            id: ids.step,
            stepOrder: 1,
            delaySeconds: 0,
            targetType: "primary_on_call",
            targetId: ids.schedule,
          },
        },
      },
    });
    await prisma.service.create({
      data: {
        id: ids.service,
        workspaceId: ids.workspace,
        name: "Routing Test Service",
        teamId: ids.team,
        escalationPolicyId: ids.policy,
      },
    });
    await prisma.onCallSchedule.create({
      data: {
        id: ids.schedule,
        workspaceId: ids.workspace,
        name: "Routing Test Schedule",
        timezone: "UTC",
        rotations: {
          create: {
            id: ids.rotation,
            layer: "primary",
            rotationType: "daily",
            rotationInterval: 1,
            startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            timezone: "UTC",
            participants: {
              create: {
                userId: ids.user,
                position: 0,
              },
            },
          },
        },
      },
    });
    await prisma.incident.create({
      data: {
        id: ids.incident,
        workspaceId: ids.workspace,
        serviceId: ids.service,
        title: "Routing test incident",
        severity: "critical",
        status: "triggered",
        source: "test",
        fingerprint: `routing-test-${ids.incident}`,
      },
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("creates notification logs for every enabled and routable user channel", async () => {
    const startedAt = Date.now();

    await escalationService.start(ids.incident);
    await escalationService.executeDueStep(ids.incident);

    const logs = await prisma.notificationLog.findMany({
      where: {
        incidentId: ids.incident,
      },
      orderBy: {
        channel: "asc",
      },
    });
    const byChannel = new Map(logs.map((log) => [log.channel, log]));

    expect(logs.map((log) => log.channel).sort()).toEqual(["email", "phone", "slack", "sms"]);
    expect(byChannel.get("slack")?.targetAddress).toBe("https://hooks.slack.com/services/T00000000/B00000000/ROUTINGTEST");
    expect(byChannel.get("email")?.targetAddress).toBe("routing-test@example.com");
    expect(byChannel.get("sms")?.targetAddress).toBe("+15551230000");
    expect(byChannel.get("phone")?.targetAddress).toBe("+15551230000");
    expect(byChannel.get("sms")?.nextRetryAt?.getTime()).toBeGreaterThanOrEqual(startedAt + 300_000);
    expect(byChannel.get("phone")?.nextRetryAt?.getTime()).toBeGreaterThanOrEqual(startedAt + 600_000);
  });

  it("does not route personal Slack through the project Slack provider without a user Slack contact", async () => {
    await prisma.userNotificationContact.delete({
      where: {
        userId_type: {
          userId: ids.user,
          type: "slack_webhook",
        },
      },
    });
    await prisma.workspaceNotificationProviderSetting.create({
      data: {
        workspaceId: ids.workspace,
        provider: "slack",
        enabled: true,
        config: {
          webhook_url: "https://hooks.slack.com/services/T00000000/B00000000/PROJECTFALLBACK",
        },
      },
    });

    await escalationService.start(ids.incident);
    await escalationService.executeDueStep(ids.incident);

    const logs = await prisma.notificationLog.findMany({
      where: {
        incidentId: ids.incident,
      },
      orderBy: {
        channel: "asc",
      },
    });

    expect(logs.map((log) => log.channel).sort()).toEqual(["email", "phone", "sms"]);
    expect(logs.some((log) => log.targetAddress === "https://hooks.slack.com/services/T00000000/B00000000/PROJECTFALLBACK")).toBe(false);
  });

  async function cleanup() {
    await cleanupTestRecords({
      incidentIds: [ids.incident],
      policyIds: [ids.policy],
      scheduleIds: [ids.schedule],
      serviceIds: [ids.service],
      teamIds: [ids.team],
      userIds: [ids.user],
      workspaceIds: [ids.workspace],
    });
  }
});
