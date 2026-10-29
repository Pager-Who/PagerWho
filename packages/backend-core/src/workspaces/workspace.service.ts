import type {
  CreateWorkspaceInviteRequest,
  CreateWorkspaceRequest,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceNotificationProvider,
  WorkspaceNotificationProviderSetting,
  WorkspacePermission,
  WorkspaceRole,
  WorkspaceRoleKey,
  UpdateWorkspaceMemberRolesRequest,
  UpdateWorkspaceNotificationProviderSettingRequest,
  UpdateServiceWebhookIntegrationRequest,
  ServiceWebhookIntegration,
  UpdateWorkspaceWebhookIntegrationRequest,
  WorkspaceWebhookIntegration,
  WorkspaceWebhookIntegrationEventAction,
  WorkspaceWebhookIntegrationType,
} from "@im/contracts";
import type { Prisma, PrismaClient, TransactionClient } from "@im/db";

import { recordActivityLog } from "../activity";
import { QuotaService } from "../quotas";
import { decryptProviderCredential, encryptProviderCredential } from "./provider-credential";
import { WorkspaceError } from "./workspace.errors";
import {
  hasWorkspacePermission,
  normalizeWorkspaceRoleKeys,
  primaryLegacyRoleForRoleKeys,
  workspaceRoleKeys,
} from "./workspace-permissions";

type WorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type WorkspaceMemberRecord = {
  workspaceId: string;
  userId: string;
  role: string;
  roles?: Array<{
    roleKey: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

type WorkspaceInviteRecord = {
  id: string;
  workspaceId: string;
  workspace: {
    name: string;
  };
  invitedEmail: string;
  invitedUserId: string | null;
  invitedByUserId: string;
  role: string;
  roles?: Array<{
    roleKey: string;
  }>;
  status: string;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  invitedUser: {
    email: string;
  } | null;
  updatedAt: Date;
};

type WorkspaceNotificationProviderSettingRecord = {
  workspaceId: string;
  provider: string;
  enabled: boolean;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type WorkspaceWebhookIntegrationRecord = {
  workspaceId: string;
  type: string;
  enabled: boolean;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const notificationProviders = ["slack", "email", "twilio"] as const satisfies readonly WorkspaceNotificationProvider[];
const webhookIntegrationTypes = ["slack", "discord", "teams", "custom"] as const satisfies readonly WorkspaceWebhookIntegrationType[];
const defaultWebhookIntegrationEventActions: WorkspaceWebhookIntegrationEventAction[] = ["incident.created"];
export const MANAGED_WEBHOOK_WORKFLOW_KIND = "webhook_integration_incident_created";
const workspaceInviteInclude = {
  workspace: {
    select: {
      name: true,
    },
  },
  invitedUser: {
    select: {
      email: true,
    },
  },
  roles: {
    orderBy: {
      roleKey: "asc" as const,
    },
  },
} as const satisfies Prisma.WorkspaceInviteInclude;

export class WorkspaceService {
  private readonly quotaService: QuotaService;

  constructor(private readonly db: PrismaClient) {
    this.quotaService = new QuotaService(db);
  }

  async createWorkspace(input: CreateWorkspaceRequest, actorUserId: string): Promise<Workspace> {
    const user = await this.db.user.findUnique({
      where: {
        id: actorUserId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new WorkspaceError("user_not_found", "User not found");
    }

    await this.quotaService.assertCanCreateWorkspace(actorUserId);

    const slug = input.slug ?? slugify(input.name);
    const workspace = await this.db.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: input.name,
          slug,
          createdByUserId: actorUserId,
          members: {
            create: {
              userId: actorUserId,
              role: "owner",
              roles: {
                create: {
                  roleKey: "project_owner",
                  assignedByUserId: actorUserId,
                },
              },
            },
          },
        },
      });

      await tx.workspaceQuotaSettings.create({
        data: {
          updatedByUserId: actorUserId,
          workspaceId: created.id,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: created.id,
        resourceType: "workspace",
        resourceId: created.id,
        action: "workspace.created",
        message: `Workspace created: ${created.name}`,
        actorUserId,
        metadata: {
          slug: created.slug,
        },
      });

      return created;
    });

    return {
      ...this.mapWorkspace(workspace),
      role: "owner",
      roles: ["project_owner"],
    };
  }

  async listUserWorkspaces(userId: string): Promise<Workspace[]> {
    const workspaces = await this.db.workspace.findMany({
      where: {
        suspendedAt: null,
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          where: {
            userId,
          },
          select: {
            role: true,
            roles: {
              select: {
                roleKey: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return workspaces.map((workspace) => ({
      ...this.mapWorkspace(workspace),
      role: workspace.members[0]?.role as WorkspaceRole | undefined,
      roles: workspace.members[0] ? this.roleKeysForMember(workspace.members[0]) : [],
    }));
  }

  async listMembers(workspaceId: string, actorUserId: string): Promise<WorkspaceMember[]> {
    await this.assertMember(workspaceId, actorUserId);

    const members = await this.db.workspaceMember.findMany({
      where: {
        workspaceId,
      },
      include: {
        roles: {
          orderBy: {
            roleKey: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return members.map((member) => this.mapMember(member));
  }

  async listWorkspaceInvites(workspaceId: string, actorUserId: string): Promise<WorkspaceInvite[]> {
    await this.assertWorkspacePermission(workspaceId, actorUserId, "project.manage");

    const invites = await this.db.workspaceInvite.findMany({
      where: {
        workspaceId,
      },
      include: workspaceInviteInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

    return invites.map((invite) => this.mapInvite(invite));
  }

  async listNotificationProviderSettings(
    workspaceId: string,
    actorUserId: string,
  ): Promise<WorkspaceNotificationProviderSetting[]> {
    await this.assertWorkspacePermission(workspaceId, actorUserId, "notification.manage");

    const settings = await this.db.workspaceNotificationProviderSetting.findMany({
      where: {
        workspaceId,
      },
      orderBy: {
        provider: "asc",
      },
    });
    const byProvider = new Map(settings.map((setting) => [setting.provider, setting]));

    return notificationProviders.map((provider) => {
      const setting = byProvider.get(provider);

      return setting
        ? this.mapNotificationProviderSetting(setting)
        : this.defaultNotificationProviderSetting(workspaceId, provider);
    });
  }

  async updateNotificationProviderSetting(
    workspaceId: string,
    provider: WorkspaceNotificationProvider,
    input: UpdateWorkspaceNotificationProviderSettingRequest,
    actorUserId: string,
  ): Promise<WorkspaceNotificationProviderSetting> {
    const setting = await this.db.$transaction(async (tx) => {
      await this.assertWorkspacePermissionInTransaction(tx, workspaceId, actorUserId, "notification.manage");
      const existing = await tx.workspaceNotificationProviderSetting.findUnique({
        where: {
          workspaceId_provider: {
            workspaceId,
            provider,
          },
        },
      });
      const config = mergeProviderConfig(provider, readConfig(existing?.config), input);
      const updated = await tx.workspaceNotificationProviderSetting.upsert({
        where: {
          workspaceId_provider: {
            workspaceId,
            provider,
          },
        },
        create: {
          workspaceId,
          provider,
          enabled: input.enabled ?? false,
          config: config as Prisma.InputJsonObject,
        },
        update: {
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          config: config as Prisma.InputJsonObject,
        },
      });

      await recordActivityLog(tx, {
        workspaceId,
        resourceType: "workspace_notification_provider_setting",
        resourceId: workspaceId,
        action: "workspace_notification_provider_setting.updated",
        message: `Workspace notification provider setting updated: ${provider}`,
        actorUserId,
        metadata: {
          provider,
          enabled: updated.enabled,
          configured: isProviderConfigured(provider, readConfig(updated.config)),
        },
      });

      return updated;
    });

    return this.mapNotificationProviderSetting(setting);
  }

  async listWebhookIntegrations(
    workspaceId: string,
    actorUserId: string,
  ): Promise<WorkspaceWebhookIntegration[]> {
    await this.assertWorkspacePermission(workspaceId, actorUserId, "notification.manage");
    const integrations = await this.db.workspaceWebhookIntegration.findMany({ where: { workspaceId } });
    const byType = new Map(integrations.map((integration) => [integration.type, integration]));

    return webhookIntegrationTypes.map((type) => {
      const integration = byType.get(type);
      return integration
        ? mapWebhookIntegration(integration)
        : defaultWebhookIntegration(workspaceId, type);
    });
  }

  async updateWebhookIntegration(
    workspaceId: string,
    type: WorkspaceWebhookIntegrationType,
    input: UpdateWorkspaceWebhookIntegrationRequest,
    actorUserId: string,
  ): Promise<WorkspaceWebhookIntegration> {
    const integration = await this.db.$transaction(async (tx) => {
      await this.assertWorkspacePermissionInTransaction(tx, workspaceId, actorUserId, "notification.manage");
      const existing = await tx.workspaceWebhookIntegration.findUnique({
        where: { workspaceId_type: { workspaceId, type } },
      });
      const config = readConfig(existing?.config);

      if (input.url !== undefined) {
        if (input.url === null || input.url.trim() === "") delete config.url;
        else {
          assertWebhookIntegrationUrl(type, input.url);
          config.url = encryptProviderCredential(input.url);
        }
      }
      if (input.default_body !== undefined) {
        if (input.default_body === null) delete config.default_body;
        else config.default_body = input.default_body as Prisma.InputJsonValue;
      }
      if (input.event_actions !== undefined) {
        config.event_actions = input.event_actions;
      }

      const updated = await tx.workspaceWebhookIntegration.upsert({
        where: { workspaceId_type: { workspaceId, type } },
        create: {
          workspaceId,
          type,
          enabled: input.enabled ?? true,
          config: config as Prisma.InputJsonObject,
        },
        update: {
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          config: config as Prisma.InputJsonObject,
        },
      });

      await syncManagedWebhookWorkflow(tx, {
        actorUserId,
        enabled: updated.enabled && typeof config.url === "string",
        eventActions: readWebhookIntegrationEventActions(config.event_actions),
        type,
        workspaceId,
      });

      await recordActivityLog(tx, {
        workspaceId,
        resourceType: "workspace_webhook_integration",
        resourceId: workspaceId,
        action: "workspace_webhook_integration.updated",
        message: `Workspace webhook integration updated: ${type}`,
        actorUserId,
        metadata: { type, enabled: updated.enabled, configured: typeof config.url === "string" },
      });
      return updated;
    });

    return mapWebhookIntegration(integration);
  }

  async listServiceWebhookIntegrations(serviceId: string, actorUserId: string): Promise<ServiceWebhookIntegration[]> {
    const service = await this.db.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new WorkspaceError("service_not_found", "Service not found");
    await this.assertWorkspacePermission(service.workspaceId, actorUserId, "service.manage");
    const root = isPlainRecord(service.webhookIntegrationConfig) ? service.webhookIntegrationConfig : {};
    return webhookIntegrationTypes.map((type) => mapServiceWebhookIntegration(serviceId, type, root[type]));
  }

  async updateServiceWebhookIntegration(
    serviceId: string,
    type: WorkspaceWebhookIntegrationType,
    input: UpdateServiceWebhookIntegrationRequest,
    actorUserId: string,
  ): Promise<ServiceWebhookIntegration> {
    const service = await this.db.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new WorkspaceError("service_not_found", "Service not found");
    await this.assertWorkspacePermission(service.workspaceId, actorUserId, "service.manage");
    return this.db.$transaction(async (tx) => {
      const root: Record<string, unknown> = isPlainRecord(service.webhookIntegrationConfig) ? { ...service.webhookIntegrationConfig } : {};
      const config: Record<string, unknown> = isPlainRecord(root[type]) ? { ...root[type] } : {};
      if (input.url !== undefined) {
        if (input.url === null) delete config.url;
        else {
          assertWebhookIntegrationUrl(type, input.url);
          config.url = encryptProviderCredential(input.url);
        }
      }
      if (input.default_body !== undefined) {
        if (input.default_body === null) delete config.default_body;
        else config.default_body = input.default_body;
      }
      if (input.event_actions !== undefined) config.event_actions = input.event_actions;
      if (input.enabled !== undefined) config.enabled = input.enabled;
      if (input.routing_mode !== undefined) config.routing_mode = input.routing_mode;
      root[type] = config;
      await tx.service.update({ where: { id: serviceId }, data: { webhookIntegrationConfig: root as Prisma.InputJsonValue } });
      await syncManagedServiceWebhookWorkflow(tx, {
        actorUserId,
        enabled: config.enabled === true && typeof config.url === "string" && config.routing_mode !== "inherit",
        eventActions: readWebhookIntegrationEventActions(config.event_actions),
        serviceId,
        type,
        workspaceId: service.workspaceId,
      });
      return mapServiceWebhookIntegration(serviceId, type, config);
    });
  }

  async createInvite(
    workspaceId: string,
    input: CreateWorkspaceInviteRequest,
    actorUserId: string,
  ): Promise<WorkspaceInvite> {
    await this.quotaService.assertCanCreateWorkspaceResource({
      actorUserId,
      resource: "members",
      workspaceId,
    });

    const invite = await this.db.$transaction(async (tx) => {
      const actorRoleKeys = await this.assertWorkspacePermissionInTransaction(tx, workspaceId, actorUserId, "project.manage");
      const roleKeys = normalizeWorkspaceRoleKeys(input.roles, input.role ?? "responder");

      if (roleKeys.includes("project_owner") && !actorRoleKeys.includes("project_owner")) {
        throw new WorkspaceError("workspace_owner_required", "Workspace owner role required");
      }
      const legacyRole = primaryLegacyRoleForRoleKeys(roleKeys);

      const invitedUser = await tx.user.findUnique({
        where: {
          email: input.invited_user_email,
        },
        select: {
          email: true,
          id: true,
        },
      });

      if (invitedUser?.id === actorUserId) {
        throw new WorkspaceError("cannot_invite_self", "Cannot invite yourself");
      }

      if (invitedUser) {
        const existingMember = await tx.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId,
              userId: invitedUser.id,
            },
          },
        });

        if (existingMember) {
          throw new WorkspaceError("workspace_member_exists", "User is already a workspace member");
        }
      }

      const invitedEmail = input.invited_user_email.toLowerCase();
      await tx.workspaceInvite.updateMany({
        where: {
          invitedEmail,
          workspaceId,
          status: "pending",
        },
        data: {
          status: "revoked",
          revokedAt: new Date(),
        },
      });

      const created = await tx.workspaceInvite.create({
        data: {
          invitedEmail,
          invitedUserId: invitedUser?.id ?? null,
          workspaceId,
          invitedByUserId: actorUserId,
          role: legacyRole,
          roles: {
            create: roleKeys.map((roleKey) => ({
              roleKey,
            })),
          },
          expiresAt: new Date(Date.now() + input.expires_in_days * 24 * 60 * 60 * 1000),
        },
        include: workspaceInviteInclude,
      });

      await recordActivityLog(tx, {
        workspaceId,
        resourceType: "workspace_invite",
        resourceId: created.id,
        action: "workspace_invite.created",
        message: "Workspace invite created",
        actorUserId,
        metadata: {
          invited_user_id: created.invitedUserId,
          invited_user_email: created.invitedEmail,
          role: created.role,
          roles: roleKeys,
          expires_at: created.expiresAt.toISOString(),
        },
      });

      return created;
    });

    return this.mapInvite(invite);
  }

  async listUserInvites(userId: string): Promise<WorkspaceInvite[]> {
    const user = await this.getUserInviteIdentity(userId);
    await this.expireUserPendingInvites(user);

    const invites = await this.db.workspaceInvite.findMany({
      where: {
        OR: [
          { invitedUserId: user.id },
          { invitedEmail: user.email },
        ],
        status: "pending",
      },
      include: workspaceInviteInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

    return invites.map((invite) => this.mapInvite(invite));
  }

  async acceptInvite(inviteId: string, actorUserId: string): Promise<WorkspaceMember> {
    const member = await this.db.$transaction(async (tx) => {
      const invite = await tx.workspaceInvite.findUnique({
        where: {
          id: inviteId,
        },
        include: {
          roles: true,
        },
      });

      const actor = await tx.user.findUnique({
        where: {
          id: actorUserId,
        },
        select: {
          email: true,
          id: true,
        },
      });

      if (!actor || !invite || (invite.invitedUserId !== actorUserId && invite.invitedEmail !== actor.email)) {
        throw new WorkspaceError("workspace_invite_not_found", "Workspace invite not found");
      }

      if (invite.status !== "pending") {
        throw new WorkspaceError("workspace_invite_not_pending", "Workspace invite is not pending");
      }

      if (invite.expiresAt <= new Date()) {
        await tx.workspaceInvite.update({
          where: {
            id: inviteId,
          },
          data: {
            status: "expired",
          },
        });
        throw new WorkspaceError("workspace_invite_expired", "Workspace invite has expired");
      }

      const roleKeys = this.roleKeysForInvite(invite);
      const legacyRole = primaryLegacyRoleForRoleKeys(roleKeys);
      const createdMember = await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invite.workspaceId,
            userId: actorUserId,
          },
        },
        update: {
          role: legacyRole,
        },
        create: {
          workspaceId: invite.workspaceId,
          userId: actorUserId,
          role: legacyRole,
        },
      });
      await tx.workspaceMemberRole.deleteMany({
        where: {
          workspaceId: invite.workspaceId,
          userId: actorUserId,
        },
      });
      await tx.workspaceMemberRole.createMany({
        data: roleKeys.map((roleKey) => ({
          assignedByUserId: invite.invitedByUserId,
          roleKey,
          workspaceId: invite.workspaceId,
          userId: actorUserId,
        })),
        skipDuplicates: true,
      });

      await tx.workspaceInvite.update({
        where: {
          id: inviteId,
        },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
          invitedUserId: actorUserId,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: invite.workspaceId,
        resourceType: "workspace_invite",
        resourceId: invite.id,
        action: "workspace_invite.accepted",
        message: "Workspace invite accepted",
        actorUserId,
        metadata: {
          role: legacyRole,
          roles: roleKeys,
        },
      });

      return {
        ...createdMember,
        roles: roleKeys.map((roleKey) => ({ roleKey })),
      };
    });

    return this.mapMember(member);
  }

  async declineInvite(inviteId: string, actorUserId: string): Promise<WorkspaceInvite> {
    const invite = await this.db.$transaction(async (tx) => {
      const existing = await tx.workspaceInvite.findUnique({
        where: {
          id: inviteId,
        },
      });

      const actor = await tx.user.findUnique({
        where: {
          id: actorUserId,
        },
        select: {
          email: true,
          id: true,
        },
      });

      if (!actor || !existing || (existing.invitedUserId !== actorUserId && existing.invitedEmail !== actor.email)) {
        throw new WorkspaceError("workspace_invite_not_found", "Workspace invite not found");
      }

      if (existing.status !== "pending") {
        throw new WorkspaceError("workspace_invite_not_pending", "Workspace invite is not pending");
      }

      const updated = await tx.workspaceInvite.update({
        where: {
          id: inviteId,
        },
        data: {
          status: "declined",
          declinedAt: new Date(),
        },
        include: workspaceInviteInclude,
      });

      await recordActivityLog(tx, {
        workspaceId: existing.workspaceId,
        resourceType: "workspace_invite",
        resourceId: existing.id,
        action: "workspace_invite.declined",
        message: "Workspace invite declined",
        actorUserId,
      });

      return updated;
    });

    return this.mapInvite(invite);
  }

  async revokeInvite(workspaceId: string, inviteId: string, actorUserId: string): Promise<WorkspaceInvite> {
    const invite = await this.db.$transaction(async (tx) => {
      await this.assertWorkspacePermissionInTransaction(tx, workspaceId, actorUserId, "project.manage");

      const existing = await tx.workspaceInvite.findFirst({
        where: {
          id: inviteId,
          workspaceId,
        },
      });

      if (!existing) {
        throw new WorkspaceError("workspace_invite_not_found", "Workspace invite not found");
      }

      if (existing.status !== "pending") {
        throw new WorkspaceError("workspace_invite_not_pending", "Workspace invite is not pending");
      }

      const updated = await tx.workspaceInvite.update({
        where: {
          id: inviteId,
        },
        data: {
          status: "revoked",
          revokedAt: new Date(),
        },
        include: workspaceInviteInclude,
      });

      await recordActivityLog(tx, {
        workspaceId,
        resourceType: "workspace_invite",
        resourceId: inviteId,
        action: "workspace_invite.revoked",
        message: "Workspace invite revoked",
        actorUserId,
      });

      return updated;
    });

    return this.mapInvite(invite);
  }

  async updateMemberRoles(
    workspaceId: string,
    targetUserId: string,
    input: UpdateWorkspaceMemberRolesRequest,
    actorUserId: string,
  ): Promise<WorkspaceMember> {
    const member = await this.db.$transaction(async (tx) => {
      const actorRoleKeys = await this.assertWorkspacePermissionInTransaction(tx, workspaceId, actorUserId, "project.manage");
      const roleKeys = normalizeWorkspaceRoleKeys(input.roles, "viewer");

      if (roleKeys.includes("project_owner") && !actorRoleKeys.includes("project_owner")) {
        throw new WorkspaceError("workspace_owner_required", "Workspace owner role required");
      }

      const existing = await tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: targetUserId,
          },
        },
        include: {
          roles: true,
        },
      });

      if (!existing) {
        throw new WorkspaceError("workspace_member_not_found", "Workspace member not found");
      }

      const existingRoleKeys = this.roleKeysForMember(existing);

      if (existingRoleKeys.includes("project_owner") && !actorRoleKeys.includes("project_owner")) {
        throw new WorkspaceError("workspace_owner_required", "Workspace owner role required");
      }

      if (existingRoleKeys.includes("project_owner") && !roleKeys.includes("project_owner")) {
        await this.assertAnotherProjectOwnerInTransaction(tx, workspaceId, targetUserId);
      }

      const legacyRole = primaryLegacyRoleForRoleKeys(roleKeys);
      const updated = await tx.workspaceMember.update({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: targetUserId,
          },
        },
        data: {
          role: legacyRole,
        },
      });

      await tx.workspaceMemberRole.deleteMany({
        where: {
          workspaceId,
          userId: targetUserId,
        },
      });
      await tx.workspaceMemberRole.createMany({
        data: roleKeys.map((roleKey) => ({
          assignedByUserId: actorUserId,
          roleKey,
          workspaceId,
          userId: targetUserId,
        })),
        skipDuplicates: true,
      });

      await recordActivityLog(tx, {
        workspaceId,
        resourceType: "workspace",
        resourceId: workspaceId,
        action: "workspace_member.roles_updated",
        message: "Workspace member roles updated",
        actorUserId,
        metadata: {
          user_id: targetUserId,
          previous_roles: existingRoleKeys,
          roles: roleKeys,
        },
      });

      return {
        ...updated,
        roles: roleKeys.map((roleKey) => ({ roleKey })),
      };
    });

    return this.mapMember(member);
  }

  async assertMember(workspaceId: string, userId: string): Promise<WorkspaceRole> {
    if (await this.isPlatformAdmin(userId)) {
      return "admin";
    }

    const member = await this.db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        workspace: {
          select: {
            suspendedAt: true,
          },
        },
      },
    });

    if (!member) {
      throw new WorkspaceError("workspace_access_denied", "Workspace access denied");
    }

    if (member.workspace.suspendedAt) {
      throw new WorkspaceError("workspace_suspended", "Workspace is suspended");
    }

    return member.role as WorkspaceRole;
  }

  async listMemberRoleKeys(workspaceId: string, userId: string): Promise<WorkspaceRoleKey[]> {
    if (await this.isPlatformAdmin(userId)) {
      return [...workspaceRoleKeys];
    }

    const member = await this.db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        roles: true,
        workspace: {
          select: {
            suspendedAt: true,
          },
        },
      },
    });

    if (!member) {
      throw new WorkspaceError("workspace_access_denied", "Workspace access denied");
    }

    if (member.workspace.suspendedAt) {
      throw new WorkspaceError("workspace_suspended", "Workspace is suspended");
    }

    return this.roleKeysForMember(member);
  }

  async assertWorkspacePermission(
    workspaceId: string,
    userId: string,
    permission: WorkspacePermission,
  ): Promise<WorkspaceRoleKey[]> {
    const roleKeys = await this.listMemberRoleKeys(workspaceId, userId);

    if (!hasWorkspacePermission(roleKeys, permission)) {
      throw new WorkspaceError("workspace_permission_required", `Workspace permission required: ${permission}`);
    }

    return roleKeys;
  }

  async assertWorkspaceAdmin(workspaceId: string, userId: string): Promise<WorkspaceRole> {
    await this.assertWorkspacePermission(workspaceId, userId, "project.manage");
    return this.assertMember(workspaceId, userId);
  }

  private async assertWorkspacePermissionInTransaction(
    tx: Pick<TransactionClient, "platformAdminRole" | "workspaceMember">,
    workspaceId: string,
    userId: string,
    permission: WorkspacePermission,
  ): Promise<WorkspaceRoleKey[]> {
    if (await this.isPlatformAdminInTransaction(tx, userId)) {
      return [...workspaceRoleKeys];
    }

    const member = await tx.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        roles: true,
        workspace: {
          select: {
            suspendedAt: true,
          },
        },
      },
    });

    if (!member) {
      throw new WorkspaceError("workspace_access_denied", "Workspace access denied");
    }

    if (member.workspace.suspendedAt) {
      throw new WorkspaceError("workspace_suspended", "Workspace is suspended");
    }

    const roleKeys = this.roleKeysForMember(member);

    if (!hasWorkspacePermission(roleKeys, permission)) {
      throw new WorkspaceError("workspace_permission_required", `Workspace permission required: ${permission}`);
    }

    return roleKeys;
  }

  private async isPlatformAdmin(userId: string): Promise<boolean> {
    const admin = await this.db.platformAdminRole.findFirst({
      where: {
        role: "platform_admin",
        userId,
        user: {
          suspendedAt: null,
        },
      },
      select: {
        userId: true,
      },
    });

    return Boolean(admin);
  }

  private async isPlatformAdminInTransaction(
    tx: Pick<TransactionClient, "platformAdminRole">,
    userId: string,
  ): Promise<boolean> {
    const admin = await tx.platformAdminRole.findFirst({
      where: {
        role: "platform_admin",
        userId,
        user: {
          suspendedAt: null,
        },
      },
      select: {
        userId: true,
      },
    });

    return Boolean(admin);
  }

  private async assertAnotherProjectOwnerInTransaction(
    tx: Pick<TransactionClient, "workspaceMemberRole">,
    workspaceId: string,
    excludedUserId: string,
  ) {
    const otherOwnerCount = await tx.workspaceMemberRole.count({
      where: {
        workspaceId,
        roleKey: "project_owner",
        userId: {
          not: excludedUserId,
        },
      },
    });

    if (otherOwnerCount === 0) {
      throw new WorkspaceError("workspace_owner_required", "Workspace must have at least one project owner");
    }
  }

  private async getUserInviteIdentity(userId: string) {
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        email: true,
        id: true,
      },
    });

    if (!user) {
      throw new WorkspaceError("user_not_found", "User not found");
    }

    return user;
  }

  private async expireUserPendingInvites(user: { email: string; id: string }) {
    await this.db.workspaceInvite.updateMany({
      where: {
        OR: [
          { invitedUserId: user.id },
          { invitedEmail: user.email },
        ],
        status: "pending",
        expiresAt: {
          lte: new Date(),
        },
      },
      data: {
        status: "expired",
      },
    });
  }

  private mapWorkspace(workspace: WorkspaceRecord): Workspace {
    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      created_by_user_id: workspace.createdByUserId,
      created_at: workspace.createdAt.toISOString(),
      updated_at: workspace.updatedAt.toISOString(),
    };
  }

  private mapMember(member: WorkspaceMemberRecord): WorkspaceMember {
    return {
      workspace_id: member.workspaceId,
      user_id: member.userId,
      role: member.role as WorkspaceRole,
      roles: this.roleKeysForMember(member),
      created_at: member.createdAt.toISOString(),
      updated_at: member.updatedAt.toISOString(),
    };
  }

  private mapInvite(invite: WorkspaceInviteRecord): WorkspaceInvite {
    return {
      id: invite.id,
      workspace_id: invite.workspaceId,
      workspace_name: invite.workspace.name,
      invited_user_id: invite.invitedUserId,
      invited_user_email: invite.invitedEmail,
      invited_by_user_id: invite.invitedByUserId,
      role: invite.role as WorkspaceRole,
      roles: this.roleKeysForInvite(invite),
      status: invite.status as WorkspaceInvite["status"],
      accepted_at: invite.acceptedAt?.toISOString() ?? null,
      declined_at: invite.declinedAt?.toISOString() ?? null,
      revoked_at: invite.revokedAt?.toISOString() ?? null,
      expires_at: invite.expiresAt.toISOString(),
      created_at: invite.createdAt.toISOString(),
      updated_at: invite.updatedAt.toISOString(),
    };
  }

  private roleKeysForMember(member: Pick<WorkspaceMemberRecord, "role" | "roles">): WorkspaceRoleKey[] {
    return normalizeWorkspaceRoleKeys(
      member.roles?.map((role) => role.roleKey),
      member.role as WorkspaceRole,
    );
  }

  private roleKeysForInvite(invite: Pick<WorkspaceInviteRecord, "role" | "roles">): WorkspaceRoleKey[] {
    return normalizeWorkspaceRoleKeys(
      invite.roles?.map((role) => role.roleKey),
      invite.role as WorkspaceRole,
    );
  }

  private defaultNotificationProviderSetting(
    workspaceId: string,
    provider: WorkspaceNotificationProvider,
  ): WorkspaceNotificationProviderSetting {
    return {
      workspace_id: workspaceId,
      provider,
      enabled: false,
      configured: false,
      details: providerDetails(provider, {}),
      created_at: null,
      updated_at: null,
    };
  }

  private mapNotificationProviderSetting(
    setting: WorkspaceNotificationProviderSettingRecord,
  ): WorkspaceNotificationProviderSetting {
    const provider = toNotificationProvider(setting.provider);
    const config = readConfig(setting.config);

    return {
      workspace_id: setting.workspaceId,
      provider,
      enabled: setting.enabled,
      configured: isProviderConfigured(provider, config),
      details: providerDetails(provider, config),
      created_at: setting.createdAt.toISOString(),
      updated_at: setting.updatedAt.toISOString(),
    };
  }
}

function defaultWebhookIntegration(workspaceId: string, type: WorkspaceWebhookIntegrationType): WorkspaceWebhookIntegration {
  return {
    workspace_id: workspaceId,
    type,
    enabled: false,
    configured: false,
    details: { url: null, default_body: null, event_actions: defaultWebhookIntegrationEventActions },
    created_at: null,
    updated_at: null,
  };
}

function mapWebhookIntegration(integration: WorkspaceWebhookIntegrationRecord): WorkspaceWebhookIntegration {
  const type = toWebhookIntegrationType(integration.type);
  const config = readConfig(integration.config);
  return {
    workspace_id: integration.workspaceId,
    type,
    enabled: integration.enabled,
    configured: typeof config.url === "string",
    details: {
      url: typeof config.url === "string" ? decryptProviderCredential(config.url) : null,
      default_body: isPlainRecord(config.default_body) ? config.default_body : null,
      event_actions: readWebhookIntegrationEventActions(config.event_actions),
    },
    created_at: integration.createdAt.toISOString(),
    updated_at: integration.updatedAt.toISOString(),
  };
}

function mapServiceWebhookIntegration(
  serviceId: string,
  type: WorkspaceWebhookIntegrationType,
  value: unknown,
): ServiceWebhookIntegration {
  const config = isPlainRecord(value) ? value : {};
  return {
    service_id: serviceId,
    type,
    routing_mode: config.routing_mode === "override" || config.routing_mode === "both" ? config.routing_mode : "inherit",
    enabled: config.enabled === true,
    configured: typeof config.url === "string" && config.url.length > 0,
    details: {
      url: typeof config.url === "string" ? decryptProviderCredential(config.url) : null,
      default_body: isPlainRecord(config.default_body) ? config.default_body : null,
      event_actions: readWebhookIntegrationEventActions(config.event_actions),
    },
    created_at: null,
    updated_at: null,
  };
}

function toWebhookIntegrationType(value: string): WorkspaceWebhookIntegrationType {
  if (webhookIntegrationTypes.some((type) => type === value)) return value as WorkspaceWebhookIntegrationType;
  throw new WorkspaceError("invalid_webhook_integration", "Invalid webhook integration type");
}

function assertWebhookIntegrationUrl(type: WorkspaceWebhookIntegrationType, value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WorkspaceError("invalid_webhook_integration_url", "Webhook URL must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") {
    throw new WorkspaceError("invalid_webhook_integration_url", "Webhook URL must use HTTPS");
  }
  const hostname = url.hostname.toLowerCase();
  if (type === "slack" && hostname !== "hooks.slack.com") {
    throw new WorkspaceError("invalid_webhook_integration_url", "Slack webhooks must use hooks.slack.com");
  }
  if (type === "discord" && hostname !== "discord.com" && hostname !== "discordapp.com") {
    throw new WorkspaceError("invalid_webhook_integration_url", "Discord webhooks must use an official Discord host");
  }
}

async function syncManagedWebhookWorkflow(
  tx: TransactionClient,
  input: {
    actorUserId: string;
    enabled: boolean;
    eventActions: WorkspaceWebhookIntegrationEventAction[];
    type: WorkspaceWebhookIntegrationType;
    workspaceId: string;
  },
) {
  const workflows = await tx.workflow.findMany({
    where: { workspaceId: input.workspaceId },
    select: { graphMetadata: true, id: true },
  });
  const existing = workflows.find((workflow) => {
    const metadata = readConfig(workflow.graphMetadata);
    return metadata.managed_kind === MANAGED_WEBHOOK_WORKFLOW_KIND
      && metadata.integration_type === input.type;
  });
  const actionKey = `send_${input.type}_incident`;
  const label = input.type === "teams" ? "Microsoft Teams" : `${input.type[0]?.toUpperCase()}${input.type.slice(1)}`;

  if (!existing) {
    await tx.workflow.create({
      data: {
        actions: {
          create: {
            actionKey,
            actionOrder: 0,
            config: { target: { integration_type: input.type } },
            type: "integration_webhook",
          },
        },
        createdByUserId: input.actorUserId,
        description: `Automatically sends newly created incidents to the enabled ${label} webhook integration.`,
        enabled: input.enabled,
        graphMetadata: {
          integration_type: input.type,
          managed_kind: MANAGED_WEBHOOK_WORKFLOW_KIND,
        },
        name: `${label} incident notifications`,
        runAsUserId: input.actorUserId,
        triggers: {
          create: input.eventActions.map((eventAction) => ({
            entryActionKey: actionKey,
            eventAction,
            filters: [],
            resourceType: "incident",
            triggerKey: `${eventAction.replaceAll(".", "_")}_${input.type}`,
          })),
        },
        workspaceId: input.workspaceId,
      },
    });
    return;
  }

  await tx.workflow.update({
    where: { id: existing.id },
    data: {
      enabled: input.enabled,
      triggers: {
        deleteMany: {},
        create: input.eventActions.map((eventAction) => ({
          entryActionKey: actionKey,
          eventAction,
          filters: [],
          resourceType: "incident",
          triggerKey: `${eventAction.replaceAll(".", "_")}_${input.type}`,
        })),
      },
    },
  });
}

async function syncManagedServiceWebhookWorkflow(
  tx: TransactionClient,
  input: {
    actorUserId: string;
    enabled: boolean;
    eventActions: WorkspaceWebhookIntegrationEventAction[];
    serviceId: string;
    type: WorkspaceWebhookIntegrationType;
    workspaceId: string;
  },
) {
  const workflows = await tx.workflow.findMany({ where: { workspaceId: input.workspaceId } });
  const existing = workflows.find((workflow) => {
    const metadata = isPlainRecord(workflow.graphMetadata) ? workflow.graphMetadata : {};
    return metadata.managed_kind === "service_webhook_integration"
      && metadata.integration_type === input.type
      && metadata.service_id === input.serviceId;
  });
  const actionKey = `send_${input.type}_service_incident`;
  const triggers = input.eventActions.map((eventAction) => ({
    entryActionKey: actionKey,
    eventAction,
    filters: [{ field: "metadata.service_id", operator: "equals", value: input.serviceId }],
    resourceType: "incident",
    triggerKey: `${eventAction.replaceAll(".", "_")}_${input.type}_${input.serviceId}`,
  }));
  if (!existing) {
    await tx.workflow.create({
      data: {
        workspaceId: input.workspaceId,
        name: `${input.type} service incident notifications`,
        description: "Managed by the service webhook integration setting.",
        enabled: input.enabled,
        runAsUserId: input.actorUserId,
        createdByUserId: input.actorUserId,
        graphMetadata: { managed_kind: "service_webhook_integration", integration_type: input.type, service_id: input.serviceId },
        triggers: { create: triggers },
        actions: { create: { actionKey, actionOrder: 1, type: "integration_webhook", config: { target: { integration_type: input.type, service_id: input.serviceId } } } },
      },
    });
    return;
  }
  await tx.workflow.update({
    where: { id: existing.id },
    data: { enabled: input.enabled, triggers: { deleteMany: {}, create: triggers } },
  });
}

function readWebhookIntegrationEventActions(value: unknown): WorkspaceWebhookIntegrationEventAction[] {
  if (!Array.isArray(value)) return [...defaultWebhookIntegrationEventActions];
  const supported = new Set<WorkspaceWebhookIntegrationEventAction>([
    "incident.created",
    "incident.acknowledged",
    "incident.resolved",
    "incident.priority_updated",
  ]);
  const actions = value.filter((entry): entry is WorkspaceWebhookIntegrationEventAction =>
    typeof entry === "string" && supported.has(entry as WorkspaceWebhookIntegrationEventAction));
  return actions.length > 0 ? actions : [...defaultWebhookIntegrationEventActions];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `workspace-${Date.now()}`;
}

function toNotificationProvider(value: string): WorkspaceNotificationProvider {
  if (notificationProviders.some((provider) => provider === value)) {
    return value as WorkspaceNotificationProvider;
  }

  throw new WorkspaceError("invalid_notification_provider", "Invalid notification provider");
}

function readConfig(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function mergeProviderConfig(
  provider: WorkspaceNotificationProvider,
  existing: Record<string, unknown>,
  input: UpdateWorkspaceNotificationProviderSettingRequest,
): Record<string, unknown> {
  if (provider === "slack") {
    return mergeNullableFields(existing, input.slack ?? {}, ["webhook_url"]);
  }

  if (provider === "email") {
    const emailInput = { ...input.email };

    if (typeof emailInput.smtp_password === "string") {
      emailInput.smtp_password = encryptProviderCredential(emailInput.smtp_password);
    }

    return mergeNullableFields(existing, emailInput, [
      "smtp_host",
      "smtp_port",
      "smtp_security",
      "smtp_username",
      "smtp_password",
      "from_name",
      "from_email",
      "event_actions",
    ]);
  }

  return mergeNullableFields(existing, input.twilio ?? {}, [
    "account_sid",
    "auth_token",
    "from_phone_number",
    "event_actions",
  ]);
}

function mergeNullableFields(
  existing: Record<string, unknown>,
  input: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  const next = { ...existing };

  for (const field of fields) {
    if (!(field in input)) {
      continue;
    }

    if (input[field] === null || input[field] === "") {
      delete next[field];
      continue;
    }

    next[field] = input[field];
  }

  return next;
}

function isProviderConfigured(
  provider: WorkspaceNotificationProvider,
  config: Record<string, unknown>,
): boolean {
  if (provider === "slack") {
    return typeof config.webhook_url === "string" && config.webhook_url.length > 0;
  }

  if (provider === "email") {
    return typeof config.smtp_host === "string"
      && config.smtp_host.length > 0
      && typeof config.smtp_port === "number"
      && (config.smtp_security === "starttls" || config.smtp_security === "tls")
      && typeof config.smtp_username === "string"
      && config.smtp_username.length > 0
      && typeof config.smtp_password === "string"
      && config.smtp_password.length > 0
      && typeof config.from_email === "string"
      && config.from_email.length > 0;
  }

  return typeof config.account_sid === "string"
    && config.account_sid.length > 0
    && typeof config.auth_token === "string"
    && config.auth_token.length > 0
    && typeof config.from_phone_number === "string"
    && config.from_phone_number.length > 0;
}

function providerDetails(
  provider: WorkspaceNotificationProvider,
  config: Record<string, unknown>,
): WorkspaceNotificationProviderSetting["details"] {
  if (provider === "slack") {
    return {
      has_slack_webhook_url: typeof config.webhook_url === "string" && config.webhook_url.length > 0,
    };
  }

  if (provider === "email") {
    return {
      smtp_host: typeof config.smtp_host === "string" ? config.smtp_host : null,
      smtp_port: typeof config.smtp_port === "number" ? config.smtp_port : null,
      smtp_security: config.smtp_security === "starttls" || config.smtp_security === "tls" ? config.smtp_security : null,
      smtp_username: typeof config.smtp_username === "string" ? config.smtp_username : null,
      has_smtp_password: typeof config.smtp_password === "string" && config.smtp_password.length > 0,
      from_name: typeof config.from_name === "string" ? config.from_name : null,
      from_email: typeof config.from_email === "string" ? config.from_email : null,
      event_actions: readWebhookIntegrationEventActions(config.event_actions),
    };
  }

  return {
    account_sid: typeof config.account_sid === "string" ? config.account_sid : null,
    account_sid_masked: typeof config.account_sid === "string" ? maskSecret(config.account_sid) : null,
    has_auth_token: typeof config.auth_token === "string" && config.auth_token.length > 0,
    from_phone_number: typeof config.from_phone_number === "string" ? config.from_phone_number : null,
    from_phone_number_masked: typeof config.from_phone_number === "string" ? maskPhoneNumber(config.from_phone_number) : null,
    event_actions: readWebhookIntegrationEventActions(config.event_actions),
  };
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "****";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function maskPhoneNumber(value: string): string {
  if (value.length <= 6) {
    return "****";
  }

  return `${value.slice(0, 3)}***${value.slice(-4)}`;
}
