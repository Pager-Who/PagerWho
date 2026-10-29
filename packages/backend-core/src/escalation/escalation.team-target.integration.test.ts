import { randomUUID } from "node:crypto";

import { prisma } from "@im/db";
import { afterEach, beforeAll, expect, it } from "vitest";

import { assertIntegrationDatabaseReady, cleanupTestRecords, describeIfDatabase } from "../test-utils/db-fixtures";
import { EscalationService } from "./escalation.service";

describeIfDatabase("EscalationService team targets", () => {
  const escalationService = new EscalationService(prisma);
  const fixtures: TeamEscalationFixture[] = [];

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
  });

  afterEach(async () => {
    for (const fixture of fixtures.splice(0).reverse()) {
      await cleanupTestRecords({
        incidentIds: [fixture.incident],
        policyIds: [fixture.policy],
        serviceIds: [fixture.service],
        teamIds: [fixture.team],
        userIds: fixture.users,
        workspaceIds: [fixture.workspace],
      });
    }
  });

  it("creates a notification for every routable team member", async () => {
    const fixture = await createFixture(2);

    const state = await escalationService.executeDueStep(fixture.incident);
    const notifications = await prisma.notificationLog.findMany({
      where: { incidentId: fixture.incident },
      orderBy: { targetId: "asc" },
    });

    expect(state.status).toBe("completed");
    expect(notifications).toHaveLength(2);
    expect(notifications.map((notification) => notification.targetId).sort()).toEqual([...fixture.users].sort());
    expect(notifications.every((notification) => notification.channel === "email")).toBe(true);
  });

  it("completes an empty-team step without failing the escalation loop", async () => {
    const fixture = await createFixture(0);

    await expect(escalationService.executeDueStep(fixture.incident)).resolves.toMatchObject({
      incident_id: fixture.incident,
      status: "completed",
    });
    await expect(prisma.notificationLog.count({ where: { incidentId: fixture.incident } })).resolves.toBe(0);
  });

  async function createFixture(memberCount: number): Promise<TeamEscalationFixture> {
    const fixture: TeamEscalationFixture = {
      incident: randomUUID(),
      policy: randomUUID(),
      service: randomUUID(),
      step: randomUUID(),
      team: randomUUID(),
      users: Array.from({ length: memberCount }, () => randomUUID()),
      workspace: randomUUID(),
    };
    fixtures.push(fixture);

    await prisma.workspace.create({
      data: { id: fixture.workspace, name: "Team Escalation Test", slug: `team-escalation-${fixture.workspace}` },
    });
    await prisma.team.create({
      data: { id: fixture.team, name: "Team Escalation Target", workspaceId: fixture.workspace },
    });

    for (const [index, userId] of fixture.users.entries()) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@example.com`,
          name: `Team responder ${index + 1}`,
          notificationPreferences: { create: { channel: "email", delaySeconds: 0, enabled: true } },
        },
      });
      await prisma.workspaceMember.create({
        data: { role: "responder", userId, workspaceId: fixture.workspace },
      });
      await prisma.teamMember.create({
        data: { role: "member", teamId: fixture.team, userId },
      });
    }

    await prisma.escalationPolicy.create({
      data: {
        id: fixture.policy,
        name: "Team Escalation Policy",
        repeatEnabled: false,
        workspaceId: fixture.workspace,
        steps: {
          create: {
            delaySeconds: 0,
            id: fixture.step,
            stepOrder: 1,
            targetId: fixture.team,
            targetType: "team",
          },
        },
      },
    });
    await prisma.service.create({
      data: {
        escalationPolicyId: fixture.policy,
        id: fixture.service,
        name: "Team Escalation Service",
        teamId: fixture.team,
        workspaceId: fixture.workspace,
      },
    });
    await prisma.incident.create({
      data: {
        fingerprint: `team-escalation-${fixture.incident}`,
        id: fixture.incident,
        serviceId: fixture.service,
        severity: "critical",
        source: "test",
        status: "triggered",
        title: "Team escalation integration test",
        workspaceId: fixture.workspace,
      },
    });
    await escalationService.start(fixture.incident);

    return fixture;
  }
});

type TeamEscalationFixture = {
  incident: string;
  policy: string;
  service: string;
  step: string;
  team: string;
  users: string[];
  workspace: string;
};
