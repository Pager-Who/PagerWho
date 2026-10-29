import { randomUUID } from "node:crypto";

import type { WorkspacePermission, WorkspaceRoleKey } from "@im/contracts";
import { prisma } from "@im/db";
import { afterEach, beforeAll, expect, it } from "vitest";

import { assertIntegrationDatabaseReady, cleanupTestRecords, describeIfDatabase } from "../test-utils/db-fixtures";
import { WorkspaceService } from "./workspace.service";

describeIfDatabase("Workspace authorization", () => {
  const workspaceService = new WorkspaceService(prisma);
  const fixtures: AuthorizationFixture[] = [];

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
  });

  afterEach(async () => {
    for (const fixture of fixtures.splice(0).reverse()) {
      await cleanupTestRecords({
        userIds: Object.values(fixture.users),
        workspaceIds: [fixture.workspaceId],
      });
    }
  });

  it("enforces the project role permission matrix", async () => {
    const fixture = await createFixture();

    await expectPermissions(fixture.workspaceId, fixture.users.owner, [
      "project.manage",
      "incident.respond",
      "notification.manage",
    ]);
    await expectPermissions(fixture.workspaceId, fixture.users.admin, [
      "project.manage",
      "incident.respond",
      "notification.manage",
    ]);
    await expectPermissions(fixture.workspaceId, fixture.users.viewer, ["project.read"]);
    await expectDeniedPermissions(fixture.workspaceId, fixture.users.viewer, [
      "project.manage",
      "incident.respond",
      "notification.manage",
    ]);
    await expectPermissions(fixture.workspaceId, fixture.users.responder, ["incident.respond"]);
    await expectDeniedPermissions(fixture.workspaceId, fixture.users.responder, ["project.manage"]);
    await expectPermissions(fixture.workspaceId, fixture.users.recipient, ["notification.receive"]);
    await expectPermissions(fixture.workspaceId, fixture.users.participant, ["on_call.participate"]);
  });

  it("uses updated roles on the next request without requiring a new session", async () => {
    const fixture = await createFixture();

    await expect(workspaceService.assertWorkspacePermission(
      fixture.workspaceId,
      fixture.users.viewer,
      "incident.respond",
    )).rejects.toMatchObject({ code: "workspace_permission_required" });

    await workspaceService.updateMemberRoles(
      fixture.workspaceId,
      fixture.users.viewer,
      { roles: ["incident_responder"] },
      fixture.users.owner,
    );

    await expect(workspaceService.assertWorkspacePermission(
      fixture.workspaceId,
      fixture.users.viewer,
      "incident.respond",
    )).resolves.toEqual(["incident_responder"]);
  });

  it("prevents removing the project_owner role from the final owner", async () => {
    const fixture = await createFixture();

    await expect(workspaceService.updateMemberRoles(
      fixture.workspaceId,
      fixture.users.owner,
      { roles: ["project_admin"] },
      fixture.users.owner,
    )).rejects.toMatchObject({ code: "workspace_owner_required" });
  });

  it("creates and disables the managed incident webhook workflow with the integration", async () => {
    const fixture = await createFixture();
    const originalEncryptionKey = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = "test-provider-key-with-at-least-32-characters";

    try {
      await workspaceService.updateWebhookIntegration(
        fixture.workspaceId,
        "discord",
        {
          default_body: { content: "Incident: {{event.metadata.title}}" },
          enabled: true,
          event_actions: ["incident.created", "incident.acknowledged", "incident.resolved", "incident.priority_updated"],
          url: "https://discord.com/api/webhooks/test/token",
        },
        fixture.users.owner,
      );

      const created = await prisma.workflow.findMany({
        where: { workspaceId: fixture.workspaceId },
        include: { actions: true, triggers: true },
      });
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ enabled: true, name: "Discord incident notifications" });
      expect(created[0]?.triggers.map((trigger) => trigger.eventAction).sort()).toEqual([
        "incident.created",
        "incident.acknowledged",
        "incident.priority_updated",
        "incident.resolved",
      ].sort());
      expect(created[0]?.actions[0]).toMatchObject({ type: "integration_webhook" });

      await workspaceService.updateWebhookIntegration(
        fixture.workspaceId,
        "discord",
        { enabled: false },
        fixture.users.owner,
      );

      const disabled = await prisma.workflow.findMany({ where: { workspaceId: fixture.workspaceId } });
      expect(disabled).toHaveLength(1);
      expect(disabled[0]?.enabled).toBe(false);
    } finally {
      if (originalEncryptionKey === undefined) delete process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
      else process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = originalEncryptionKey;
    }
  });

  it("creates a service-scoped webhook workflow with routing mode and service filters", async () => {
    const fixture = await createFixture();
    const team = await prisma.team.create({ data: { workspaceId: fixture.workspaceId, name: `Service hooks ${randomUUID()}` } });
    const service = await prisma.service.create({ data: { workspaceId: fixture.workspaceId, teamId: team.id, name: "Checkout API" } });
    const originalEncryptionKey = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = "test-provider-key-with-at-least-32-characters";
    try {
      const updated = await workspaceService.updateServiceWebhookIntegration(service.id, "discord", {
        enabled: true,
        routing_mode: "override",
        event_actions: ["incident.created", "incident.resolved"],
        url: "https://discord.com/api/webhooks/service/token",
        default_body: { content: "{{event.metadata.title}}" },
      }, fixture.users.owner);
      expect(updated).toMatchObject({ service_id: service.id, routing_mode: "override", configured: true });
      const workflow = await prisma.workflow.findFirstOrThrow({
        where: { workspaceId: fixture.workspaceId, graphMetadata: { path: ["service_id"], equals: service.id } },
        include: { triggers: true, actions: true },
      });
      expect(workflow.enabled).toBe(true);
      expect(workflow.triggers).toHaveLength(2);
      expect(workflow.triggers.every((trigger) => JSON.stringify(trigger.filters).includes(service.id))).toBe(true);
      expect(workflow.actions[0]?.config).toMatchObject({ target: { integration_type: "discord", service_id: service.id } });
    } finally {
      if (originalEncryptionKey === undefined) delete process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
      else process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = originalEncryptionKey;
    }
  });

  async function createFixture(): Promise<AuthorizationFixture> {
    const workspaceId = randomUUID();
    const users = {
      admin: randomUUID(),
      owner: randomUUID(),
      participant: randomUUID(),
      recipient: randomUUID(),
      responder: randomUUID(),
      viewer: randomUUID(),
    };
    const fixture = { users, workspaceId };
    fixtures.push(fixture);

    await prisma.user.createMany({
      data: Object.entries(users).map(([name, id]) => ({
        email: `${id}@example.com`,
        id,
        name: `Authorization ${name}`,
      })),
    });
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Authorization Integration Workspace",
        slug: `authorization-${workspaceId}`,
      },
    });

    const assignments: Array<[string, WorkspaceRoleKey]> = [
      [users.owner, "project_owner"],
      [users.admin, "project_admin"],
      [users.viewer, "project_viewer"],
      [users.responder, "incident_responder"],
      [users.recipient, "notification_recipient"],
      [users.participant, "on_call_participant"],
    ];

    for (const [userId, roleKey] of assignments) {
      await prisma.workspaceMember.create({
        data: { role: roleKey === "project_owner" ? "owner" : "viewer", userId, workspaceId },
      });
      await prisma.workspaceMemberRole.create({
        data: { assignedByUserId: users.owner, roleKey, userId, workspaceId },
      });
    }

    return fixture;
  }

  async function expectPermissions(workspaceId: string, userId: string, permissions: WorkspacePermission[]) {
    for (const permission of permissions) {
      await expect(workspaceService.assertWorkspacePermission(workspaceId, userId, permission)).resolves.toBeDefined();
    }
  }

  async function expectDeniedPermissions(workspaceId: string, userId: string, permissions: WorkspacePermission[]) {
    for (const permission of permissions) {
      await expect(workspaceService.assertWorkspacePermission(workspaceId, userId, permission))
        .rejects.toMatchObject({ code: "workspace_permission_required" });
    }
  }
});

type AuthorizationFixture = {
  users: {
    admin: string;
    owner: string;
    participant: string;
    recipient: string;
    responder: string;
    viewer: string;
  };
  workspaceId: string;
};
