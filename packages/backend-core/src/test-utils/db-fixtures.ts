import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@im/db";
import { describe } from "vitest";

export const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

export type TestServiceFixture = {
  service: string;
  team: string;
  workspace: string;
};

export type TestIncidentFixture = TestServiceFixture & {
  incident: string;
};

type CreateTestServiceFixtureInput = {
  service?: {
    escalationPolicyId?: string | null;
    id?: string;
    name?: string;
  };
  team?: {
    id?: string;
    name?: string;
  };
  workspace?: {
    id?: string;
    name?: string;
    slug?: string;
  };
};

type CreateTestIncidentFixtureInput = CreateTestServiceFixtureInput & {
  incident?: {
    fingerprint?: string;
    id?: string;
    priority?: "P1" | "P2" | "P3" | "P4" | "P5";
    severity?: "critical" | "high" | "medium" | "low";
    source?: string;
    status?: "triggered" | "acknowledged" | "resolved";
    title?: string;
  };
};

type CleanupTestRecordsInput = {
  incidentIds?: string[];
  policyIds?: string[];
  resourceIds?: string[];
  scheduleIds?: string[];
  serviceIds?: string[];
  teamIds?: string[];
  userIds?: string[];
  webhookEndpointIds?: string[];
  workspaceIds?: string[];
};

export async function createTestServiceFixture(
  input: CreateTestServiceFixtureInput = {},
  db: PrismaClient = prisma,
): Promise<TestServiceFixture> {
  const workspace = input.workspace?.id ?? randomUUID();
  const team = input.team?.id ?? randomUUID();
  const service = input.service?.id ?? randomUUID();

  await db.workspace.create({
    data: {
      id: workspace,
      name: input.workspace?.name ?? "Test Workspace",
      slug: input.workspace?.slug ?? `test-workspace-${workspace}`,
    },
  });
  await db.team.create({
    data: {
      id: team,
      workspaceId: workspace,
      name: input.team?.name ?? "Test Team",
    },
  });
  await db.service.create({
    data: {
      id: service,
      workspaceId: workspace,
      name: input.service?.name ?? "Test Service",
      teamId: team,
      ...(input.service?.escalationPolicyId !== undefined
        ? { escalationPolicyId: input.service.escalationPolicyId }
        : {}),
    },
  });

  return {
    service,
    team,
    workspace,
  };
}

export async function assertIntegrationDatabaseReady(db: PrismaClient = prisma): Promise<void> {
  const rows = await db.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'incidents'
        AND column_name = 'priority'
    ) AS "exists"
  `;

  if (!rows[0]?.exists) {
    throw new Error(
      "Backend integration tests require the local database schema to match packages/db/prisma/schema.prisma. "
      + "The incidents.priority column is missing; apply the database migrations before running test:backend:integration.",
    );
  }
}

export async function createTestIncidentFixture(
  input: CreateTestIncidentFixtureInput = {},
  db: PrismaClient = prisma,
): Promise<TestIncidentFixture> {
  const serviceFixture = await createTestServiceFixture(input, db);
  const incident = input.incident?.id ?? randomUUID();

  await db.incident.create({
    data: {
      id: incident,
      workspaceId: serviceFixture.workspace,
      serviceId: serviceFixture.service,
      title: input.incident?.title ?? "Test incident",
      severity: input.incident?.severity ?? "critical",
      priority: input.incident?.priority ?? "P3",
      status: input.incident?.status ?? "triggered",
      source: input.incident?.source ?? "test",
      fingerprint: input.incident?.fingerprint ?? `test-incident-${incident}`,
    },
  });

  return {
    ...serviceFixture,
    incident,
  };
}

export async function cleanupTestRecords(
  input: CleanupTestRecordsInput,
  db: PrismaClient = prisma,
): Promise<void> {
  const incidentIds = input.incidentIds ?? [];
  const policyIds = input.policyIds ?? [];
  const resourceIds = input.resourceIds ?? [];
  const scheduleIds = input.scheduleIds ?? [];
  const serviceIds = input.serviceIds ?? [];
  const teamIds = input.teamIds ?? [];
  const userIds = input.userIds ?? [];
  const webhookEndpointIds = input.webhookEndpointIds ?? [];
  const workspaceIds = input.workspaceIds ?? [];
  const activityResourceIds = [
    ...resourceIds,
    ...incidentIds,
    ...policyIds,
    ...serviceIds,
    ...teamIds,
    ...userIds,
    ...webhookEndpointIds,
    ...workspaceIds,
  ];

  if (workspaceIds.length || activityResourceIds.length) {
    await db.activityLog.deleteMany({
      where: {
        OR: [
          ...(workspaceIds.length ? [{ workspaceId: { in: workspaceIds } }] : []),
          ...(activityResourceIds.length ? [{ resourceId: { in: activityResourceIds } }] : []),
        ],
      },
    });
  }

  if (incidentIds.length) {
    await db.notificationLog.deleteMany({
      where: {
        incidentId: {
          in: incidentIds,
        },
      },
    });
    await db.incidentEscalationState.deleteMany({
      where: {
        incidentId: {
          in: incidentIds,
        },
      },
    });
    await db.incidentTimelineEntry.deleteMany({
      where: {
        incidentId: {
          in: incidentIds,
        },
      },
    });
    await db.incidentEvent.deleteMany({
      where: {
        incidentId: {
          in: incidentIds,
        },
      },
    });
    await db.incident.deleteMany({
      where: {
        id: {
          in: incidentIds,
        },
      },
    });
  }

  if (serviceIds.length) {
    await db.notificationLog.deleteMany({
      where: {
        incident: {
          serviceId: {
            in: serviceIds,
          },
        },
      },
    });
    await db.incidentTimelineEntry.deleteMany({
      where: {
        incident: {
          serviceId: {
            in: serviceIds,
          },
        },
      },
    });
    await db.incidentEvent.deleteMany({
      where: {
        serviceId: {
          in: serviceIds,
        },
      },
    });
    await db.incidentEscalationState.deleteMany({
      where: {
        incident: {
          serviceId: {
            in: serviceIds,
          },
        },
      },
    });
    await db.incident.deleteMany({
      where: {
        serviceId: {
          in: serviceIds,
        },
      },
    });
    await db.webhookEndpoint.deleteMany({
      where: {
        serviceId: {
          in: serviceIds,
        },
      },
    });
  }

  if (webhookEndpointIds.length) {
    await db.webhookEndpoint.deleteMany({
      where: {
        id: {
          in: webhookEndpointIds,
        },
      },
    });
  }

  if (scheduleIds.length) {
    await db.onCallSchedule.deleteMany({
      where: {
        id: {
          in: scheduleIds,
        },
      },
    });
  }

  if (serviceIds.length) {
    await db.service.deleteMany({
      where: {
        id: {
          in: serviceIds,
        },
      },
    });
  }

  if (policyIds.length) {
    await db.escalationPolicy.deleteMany({
      where: {
        id: {
          in: policyIds,
        },
      },
    });
  }

  if (teamIds.length || userIds.length) {
    await db.teamMember.deleteMany({
      where: {
        OR: [
          ...(teamIds.length ? [{ teamId: { in: teamIds } }] : []),
          ...(userIds.length ? [{ userId: { in: userIds } }] : []),
        ],
      },
    });
  }

  if (teamIds.length) {
    await db.team.deleteMany({
      where: {
        id: {
          in: teamIds,
        },
      },
    });
  }

  if (workspaceIds.length || userIds.length) {
    await db.workspaceMember.deleteMany({
      where: {
        OR: [
          ...(workspaceIds.length ? [{ workspaceId: { in: workspaceIds } }] : []),
          ...(userIds.length ? [{ userId: { in: userIds } }] : []),
        ],
      },
    });
  }

  if (userIds.length) {
    await db.userNotificationPreference.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });
    await db.userNotificationContact.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });
  }

  if (workspaceIds.length) {
    await db.workspace.deleteMany({
      where: {
        id: {
          in: workspaceIds,
        },
      },
    });
  }

  if (userIds.length) {
    await db.user.deleteMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });
  }
}
