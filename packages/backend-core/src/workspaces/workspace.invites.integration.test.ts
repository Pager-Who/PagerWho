import { randomUUID } from "node:crypto";

import { prisma } from "@im/db";
import { afterEach, beforeAll, expect, it } from "vitest";

import { assertIntegrationDatabaseReady, cleanupTestRecords, describeIfDatabase } from "../test-utils/db-fixtures";
import { WorkspaceService } from "./workspace.service";

describeIfDatabase("WorkspaceService invitations", () => {
  const workspaceService = new WorkspaceService(prisma);
  const fixtures: InviteFixture[] = [];

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
  });

  afterEach(async () => {
    for (const fixture of fixtures.splice(0).reverse()) {
      await cleanupTestRecords({
        userIds: [fixture.owner, fixture.invitee, fixture.otherUser],
        workspaceIds: [fixture.workspace],
      });
    }
  });

  it("shows a created email invitation to its intended user", async () => {
    const fixture = await createFixture();
    const invite = await createInvite(fixture);

    const pending = await workspaceService.listUserInvites(fixture.invitee);

    expect(invite.status).toBe("pending");
    expect(invite.workspace_name).toBe("Invite Integration Workspace");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(invite.id);
    expect(pending[0]?.workspace_name).toBe("Invite Integration Workspace");
  });

  it("accepts an invitation and creates exactly one membership", async () => {
    const fixture = await createFixture();
    const invite = await createInvite(fixture);

    await workspaceService.acceptInvite(invite.id, fixture.invitee);

    await expect(prisma.workspaceMember.count({
      where: { userId: fixture.invitee, workspaceId: fixture.workspace },
    })).resolves.toBe(1);
    await expect(prisma.workspaceInvite.findUniqueOrThrow({ where: { id: invite.id } }))
      .resolves.toMatchObject({ status: "accepted" });
  });

  it("declines a pending invitation without creating membership", async () => {
    const fixture = await createFixture();
    const invite = await createInvite(fixture);

    await workspaceService.declineInvite(invite.id, fixture.invitee);

    await expect(prisma.workspaceMember.count({
      where: { userId: fixture.invitee, workspaceId: fixture.workspace },
    })).resolves.toBe(0);
    await expect(prisma.workspaceInvite.findUniqueOrThrow({ where: { id: invite.id } }))
      .resolves.toMatchObject({ status: "declined" });
  });

  it("allows a project manager to revoke a pending invitation", async () => {
    const fixture = await createFixture();
    const invite = await createInvite(fixture);

    const revoked = await workspaceService.revokeInvite(fixture.workspace, invite.id, fixture.owner);

    expect(revoked.status).toBe("revoked");
    expect(revoked.revoked_at).not.toBeNull();
    await expect(workspaceService.listUserInvites(fixture.invitee)).resolves.toEqual([]);
  });

  it("does not allow a user without project management permission to revoke an invitation", async () => {
    const fixture = await createFixture();
    const invite = await createInvite(fixture);

    await expect(workspaceService.revokeInvite(fixture.workspace, invite.id, fixture.otherUser))
      .rejects.toMatchObject({ code: "workspace_access_denied" });
    await expect(prisma.workspaceInvite.findUniqueOrThrow({ where: { id: invite.id } }))
      .resolves.toMatchObject({ status: "pending", revokedAt: null });
  });

  it("rejects an expired invitation", async () => {
    const fixture = await createFixture();
    const invite = await createInvite(fixture);
    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") },
    });

    await expect(workspaceService.acceptInvite(invite.id, fixture.invitee))
      .rejects.toMatchObject({ code: "workspace_invite_expired" });
    await expect(prisma.workspaceMember.count({
      where: { userId: fixture.invitee, workspaceId: fixture.workspace },
    })).resolves.toBe(0);
  });

  it("does not duplicate membership when an accepted invitation is accepted again", async () => {
    const fixture = await createFixture();
    const invite = await createInvite(fixture);
    await workspaceService.acceptInvite(invite.id, fixture.invitee);

    await expect(workspaceService.acceptInvite(invite.id, fixture.invitee))
      .rejects.toMatchObject({ code: "workspace_invite_not_pending" });
    await expect(prisma.workspaceMember.count({
      where: { userId: fixture.invitee, workspaceId: fixture.workspace },
    })).resolves.toBe(1);
  });

  it("does not allow another account to accept the invitation", async () => {
    const fixture = await createFixture();
    const invite = await createInvite(fixture);

    await expect(workspaceService.acceptInvite(invite.id, fixture.otherUser))
      .rejects.toMatchObject({ code: "workspace_invite_not_found" });
    await expect(prisma.workspaceMember.count({
      where: { userId: fixture.otherUser, workspaceId: fixture.workspace },
    })).resolves.toBe(0);
  });

  it("prevents inviting an existing member", async () => {
    const fixture = await createFixture();
    await prisma.workspaceMember.create({
      data: { role: "responder", userId: fixture.invitee, workspaceId: fixture.workspace },
    });

    await expect(createInvite(fixture))
      .rejects.toMatchObject({ code: "workspace_member_exists" });
  });

  it("keeps only the newest invitation pending after consecutive invitations", async () => {
    const fixture = await createFixture();
    const first = await createInvite(fixture);
    const second = await createInvite(fixture);
    const invites = await prisma.workspaceInvite.findMany({
      where: { invitedEmail: fixture.inviteeEmail, workspaceId: fixture.workspace },
      orderBy: { createdAt: "asc" },
    });

    expect(second.id).not.toBe(first.id);
    expect(invites.map((invite) => invite.status)).toEqual(["revoked", "pending"]);
  });

  async function createFixture(): Promise<InviteFixture> {
    const fixture: InviteFixture = {
      invitee: randomUUID(),
      inviteeEmail: `${randomUUID()}@example.com`,
      otherUser: randomUUID(),
      owner: randomUUID(),
      workspace: randomUUID(),
    };
    fixtures.push(fixture);

    await prisma.user.createMany({
      data: [
        { email: `${fixture.owner}@example.com`, id: fixture.owner, name: "Invite owner" },
        { email: fixture.inviteeEmail, id: fixture.invitee, name: "Invite recipient" },
        { email: `${fixture.otherUser}@example.com`, id: fixture.otherUser, name: "Different account" },
      ],
    });
    await prisma.workspace.create({
      data: {
        id: fixture.workspace,
        name: "Invite Integration Workspace",
        slug: `invite-integration-${fixture.workspace}`,
      },
    });
    await prisma.workspaceMember.create({
      data: { role: "owner", userId: fixture.owner, workspaceId: fixture.workspace },
    });
    await prisma.workspaceMemberRole.create({
      data: {
        assignedByUserId: fixture.owner,
        roleKey: "project_owner",
        userId: fixture.owner,
        workspaceId: fixture.workspace,
      },
    });

    return fixture;
  }

  function createInvite(fixture: InviteFixture) {
    return workspaceService.createInvite(fixture.workspace, {
      expires_in_days: 14,
      invited_user_email: fixture.inviteeEmail,
      roles: ["incident_responder", "notification_recipient"],
    }, fixture.owner);
  }
});

type InviteFixture = {
  invitee: string;
  inviteeEmail: string;
  otherUser: string;
  owner: string;
  workspace: string;
};
