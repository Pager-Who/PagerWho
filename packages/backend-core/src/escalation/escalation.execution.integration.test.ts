import { randomUUID } from "node:crypto";

import { prisma } from "@im/db";
import { afterEach, beforeAll, expect, it } from "vitest";

import { IncidentService } from "../incidents";
import { assertIntegrationDatabaseReady, cleanupTestRecords, describeIfDatabase } from "../test-utils/db-fixtures";
import { EscalationService } from "./escalation.service";

type StepInput = {
  id: string;
  stepOrder: number;
  delaySeconds: number;
};

describeIfDatabase("EscalationService execution loop", () => {
  const escalationService = new EscalationService(prisma);
  const incidentService = new IncidentService(prisma);
  const createdFixtures: EscalationFixture[] = [];

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
  });

  afterEach(async () => {
    for (const fixture of createdFixtures.splice(0).reverse()) {
      await cleanup(fixture);
    }
  });

  it("executes a due state once across concurrent workers", async () => {
    const fixture = await createFixture({
      steps: [
        {
          id: randomUUID(),
          stepOrder: 1,
          delaySeconds: 0,
        },
      ],
    });
    await makeStateDue(fixture.incident);

    const [firstState, secondState] = await Promise.all([
      escalationService.executeNextDueState(),
      escalationService.executeNextDueState(),
    ]);
    const executedStates = [firstState, secondState].filter((state) => state?.incident_id === fixture.incident);

    expect(executedStates).toHaveLength(1);

    const [notificationCount, stepTimelineCount] = await Promise.all([
      prisma.notificationLog.count({
        where: {
          incidentId: fixture.incident,
        },
      }),
      prisma.incidentTimelineEntry.count({
        where: {
          incidentId: fixture.incident,
          type: "escalation.step_executed",
        },
      }),
    ]);

    expect(notificationCount).toBe(1);
    expect(stepTimelineCount).toBe(1);
  });

  it("stops future escalation and skips queued notifications when acknowledged", async () => {
    const fixture = await createFixture({
      steps: [
        {
          id: randomUUID(),
          stepOrder: 1,
          delaySeconds: 0,
        },
        {
          id: randomUUID(),
          stepOrder: 2,
          delaySeconds: 300,
        },
      ],
    });

    await escalationService.executeDueStep(fixture.incident);
    await incidentService.acknowledgeIncident(fixture.incident, fixture.user);

    const [state, notifications, skippedTimelineCount] = await Promise.all([
      prisma.incidentEscalationState.findUniqueOrThrow({
        where: {
          incidentId: fixture.incident,
        },
      }),
      prisma.notificationLog.findMany({
        where: {
          incidentId: fixture.incident,
        },
      }),
      prisma.incidentTimelineEntry.count({
        where: {
          incidentId: fixture.incident,
          type: "notification.skipped",
        },
      }),
    ]);

    expect(state.status).toBe("stopped");
    expect(state.nextRunAt).toBeNull();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.status).toBe("skipped");
    expect(skippedTimelineCount).toBe(1);

    const nextState = await escalationService.executeNextDueState();
    const secondStepId = fixture.steps[1]?.id;

    if (!secondStepId) {
      throw new Error("Second escalation step was not created");
    }

    const secondStepLogs = await prisma.notificationLog.count({
      where: {
        incidentId: fixture.incident,
        policyStepId: secondStepId,
      },
    });

    expect(nextState?.incident_id).not.toBe(fixture.incident);
    expect(secondStepLogs).toBe(0);
  });

  it("repeats until repeat limit and then completes", async () => {
    const fixture = await createFixture({
      repeatEnabled: true,
      repeatIntervalSeconds: 0,
      repeatLimit: 2,
      steps: [
        {
          id: randomUUID(),
          stepOrder: 1,
          delaySeconds: 0,
        },
      ],
    });

    const firstPass = await escalationService.executeDueStep(fixture.incident);
    const secondPass = await escalationService.executeDueStep(fixture.incident);

    const logs = await prisma.notificationLog.findMany({
      where: {
        incidentId: fixture.incident,
      },
      orderBy: {
        repeatIteration: "asc",
      },
    });

    expect(firstPass.status).toBe("active");
    expect(firstPass.repeat_iteration).toBe(1);
    expect(secondPass.status).toBe("completed");
    expect(secondPass.next_run_at).toBeNull();
    expect(logs.map((log) => log.repeatIteration)).toEqual([0, 1]);
  });

  it("returns incident detail with escalation and history summaries", async () => {
    const fixture = await createFixture({
      steps: [
        {
          id: randomUUID(),
          stepOrder: 1,
          delaySeconds: 0,
        },
      ],
    });

    await escalationService.executeDueStep(fixture.incident);

    const detail = await incidentService.getIncidentDetail(fixture.incident);

    expect(detail?.incident.id).toBe(fixture.incident);
    expect(detail?.escalation?.incident_id).toBe(fixture.incident);
    expect(detail?.timeline_summary.total).toBeGreaterThan(0);
    expect(detail?.timeline_summary.latest_created_at).not.toBeNull();
    expect(detail?.notification_summary.total).toBe(1);
    expect(detail?.notification_summary.by_status).toContainEqual({
      status: "pending",
      count: 1,
    });
  });

  it("manually re-runs the current escalation step with a fresh notification log", async () => {
    const fixture = await createFixture({
      steps: [
        {
          id: randomUUID(),
          stepOrder: 1,
          delaySeconds: 0,
        },
      ],
    });

    await escalationService.executeDueStep(fixture.incident);
    const state = await escalationService.triggerManualEscalation(fixture.incident, {
      action: "trigger_current_step",
      force: false,
      reason: "Operator requested another notification",
      update_current_step: false,
    }, fixture.user);

    const [notifications, manualTimelineCount] = await Promise.all([
      prisma.notificationLog.findMany({
        where: {
          incidentId: fixture.incident,
        },
      }),
      prisma.incidentTimelineEntry.count({
        where: {
          incidentId: fixture.incident,
          type: "escalation.manual_triggered",
        },
      }),
    ]);

    expect(state.status).toBe("completed");
    expect(notifications).toHaveLength(2);
    expect(new Set(notifications.map((notification) => notification.idempotencyKey)).size).toBe(2);
    expect(manualTimelineCount).toBe(1);
  });

  it("manually advances to the next escalation step", async () => {
    const secondStepId = randomUUID();
    const fixture = await createFixture({
      steps: [
        {
          id: randomUUID(),
          stepOrder: 1,
          delaySeconds: 0,
        },
        {
          id: secondStepId,
          stepOrder: 2,
          delaySeconds: 300,
        },
      ],
    });

    const state = await escalationService.triggerManualEscalation(fixture.incident, {
      action: "advance_to_next_step",
      force: false,
      reason: "Customer impact increased",
      update_current_step: false,
    }, fixture.user);

    const secondStepLogs = await prisma.notificationLog.count({
      where: {
        incidentId: fixture.incident,
        policyStepId: secondStepId,
      },
    });

    expect(state.status).toBe("completed");
    expect(state.current_step).toBe(2);
    expect(secondStepLogs).toBe(1);
  });

  async function createFixture(input: {
    repeatEnabled?: boolean;
    repeatIntervalSeconds?: number | null;
    repeatLimit?: number | null;
    steps: StepInput[];
  }): Promise<EscalationFixture> {
    const fixture = {
      incident: randomUUID(),
      policy: randomUUID(),
      service: randomUUID(),
      steps: input.steps,
      team: randomUUID(),
      user: randomUUID(),
      workspace: randomUUID(),
    };
    createdFixtures.push(fixture);

    await prisma.workspace.create({
      data: {
        id: fixture.workspace,
        name: "Escalation Execution Test Workspace",
        slug: `escalation-execution-${fixture.workspace}`,
      },
    });
    await prisma.user.create({
      data: {
        id: fixture.user,
        email: `${fixture.user}@example.com`,
        name: "Escalation Execution Test User",
        notificationContacts: {
          create: {
            type: "slack_webhook",
            address: "https://hooks.slack.com/services/T00000000/B00000000/EXECUTIONTEST",
          },
        },
        notificationPreferences: {
          create: {
            channel: "slack",
            enabled: true,
            delaySeconds: 0,
          },
        },
      },
    });
    await prisma.team.create({
      data: {
        id: fixture.team,
        workspaceId: fixture.workspace,
        name: "Escalation Execution Test Team",
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: fixture.workspace,
        userId: fixture.user,
        role: "responder",
      },
    });
    await prisma.escalationPolicy.create({
      data: {
        id: fixture.policy,
        workspaceId: fixture.workspace,
        name: "Escalation Execution Test Policy",
        repeatEnabled: input.repeatEnabled ?? false,
        repeatIntervalSeconds: input.repeatIntervalSeconds ?? null,
        repeatLimit: input.repeatLimit ?? null,
        steps: {
          create: input.steps.map((step) => ({
            id: step.id,
            stepOrder: step.stepOrder,
            delaySeconds: step.delaySeconds,
            targetType: "user",
            targetId: fixture.user,
          })),
        },
      },
    });
    await prisma.service.create({
      data: {
        id: fixture.service,
        workspaceId: fixture.workspace,
        name: "Escalation Execution Test Service",
        teamId: fixture.team,
        escalationPolicyId: fixture.policy,
      },
    });
    await prisma.incident.create({
      data: {
        id: fixture.incident,
        workspaceId: fixture.workspace,
        serviceId: fixture.service,
        title: "Escalation execution test incident",
        severity: "critical",
        status: "triggered",
        source: "test",
        fingerprint: `escalation-execution-${fixture.incident}`,
      },
    });
    await escalationService.start(fixture.incident);

    return fixture;
  }

  async function makeStateDue(incidentId: string) {
    await prisma.incidentEscalationState.update({
      where: {
        incidentId,
      },
      data: {
        nextRunAt: new Date("2000-01-01T00:00:00.000Z"),
      },
    });
  }

  async function cleanup(fixture: EscalationFixture) {
    await cleanupTestRecords({
      incidentIds: [fixture.incident],
      policyIds: [fixture.policy],
      serviceIds: [fixture.service],
      teamIds: [fixture.team],
      userIds: [fixture.user],
      workspaceIds: [fixture.workspace],
    });
  }
});

type EscalationFixture = {
  incident: string;
  policy: string;
  service: string;
  steps: StepInput[];
  team: string;
  user: string;
  workspace: string;
};
