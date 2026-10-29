import type {
  CreateOnCallOverrideRequest,
  CreateOnCallScheduleRequest,
  CurrentOnCall,
  OnCallOverride,
  OnCallSchedule,
  OnCallSchedulePreview,
  OnCallSchedulePreviewQuery,
  UpdateOnCallScheduleRequest,
  UpsertOnCallRotationRequest,
  WorkspaceRole,
} from "@im/contracts";
import type { PrismaClient, TransactionClient } from "@im/db";

import { recordActivityLog } from "../activity";
import { QuotaService } from "../quotas";
import { hasWorkspacePermission, normalizeWorkspaceRoleKeys } from "../workspaces";
import { OnCallError } from "./on-call.errors";

type RotationWithParticipants = {
  rotationType: string;
  rotationInterval: number;
  startsAt: Date;
  timezone: string;
  participants: {
    userId: string;
    position: number;
  }[];
};

type OnCallReadClient = Pick<
  PrismaClient | TransactionClient,
  "onCallOverride" | "onCallRotation" | "onCallSchedule" | "service"
>;

type OnCallScheduleScopeInput = {
  service_id?: string | null | undefined;
  team_id?: string | null | undefined;
};

type OnCallScheduleRecord = {
  id: string;
  workspaceId: string;
  name: string;
  teamId: string | null;
  serviceId: string | null;
  timezone: string;
  rotations: OnCallRotationRecord[];
  overrides: OnCallOverrideRecord[];
  createdAt: Date;
  updatedAt: Date;
};

type OnCallRotationRecord = {
  id: string;
  scheduleId: string;
  layer: string;
  rotationType: string;
  rotationInterval: number;
  startsAt: Date;
  timezone: string;
  participants: {
    userId: string;
    position: number;
  }[];
};

type OnCallOverrideRecord = {
  id: string;
  scheduleId: string;
  userId: string;
  layer: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
};

export class OnCallService {
  private readonly quotaService: QuotaService;

  constructor(private readonly db: PrismaClient) {
    this.quotaService = new QuotaService(db);
  }

  async listSchedules(filters: { workspaceId?: string; workspaceIds?: string[] } = {}): Promise<OnCallSchedule[]> {
    const schedules = await this.db.onCallSchedule.findMany({
      where: {
        ...(filters.workspaceId
          ? { workspaceId: filters.workspaceId }
          : filters.workspaceIds
            ? { workspaceId: { in: filters.workspaceIds } }
            : {}),
      },
      include: this.scheduleInclude(),
      orderBy: {
        name: "asc",
      },
    });

    return schedules.map((schedule) => this.mapSchedule(schedule));
  }

  async getSchedule(scheduleId: string): Promise<OnCallSchedule | null> {
    const schedule = await this.db.onCallSchedule.findUnique({
      where: {
        id: scheduleId,
      },
      include: this.scheduleInclude(),
    });

    return schedule ? this.mapSchedule(schedule) : null;
  }

  async createSchedule(input: CreateOnCallScheduleRequest): Promise<OnCallSchedule> {
    await this.quotaService.assertCanCreateWorkspaceResource({
      resource: "on_call_schedules",
      workspaceId: input.workspace_id,
    });

    const schedule = await this.db.$transaction(async (tx) => {
      await this.assertScheduleReferences(tx, input.workspace_id, input);
      await this.assertRotationParticipants(tx, input.workspace_id, input.rotations);
      this.assertScheduleTimezones(input.timezone, input.rotations);
      this.assertSharedRotationCadence(input.rotations);

      const created = await tx.onCallSchedule.create({
        data: {
          workspaceId: input.workspace_id,
          name: input.name,
          teamId: input.team_id ?? null,
          serviceId: input.service_id ?? null,
          timezone: input.timezone,
        },
      });

      for (const rotation of input.rotations) {
        await this.createRotation(tx, created.id, rotation);
      }

      const scheduleWithRelations = await tx.onCallSchedule.findUniqueOrThrow({
        where: {
          id: created.id,
        },
        include: this.scheduleInclude(),
      });

      await recordActivityLog(tx, {
        workspaceId: created.workspaceId,
        resourceType: "on_call_schedule",
        resourceId: created.id,
        action: "on_call_schedule.created",
        message: `On-call schedule created: ${created.name}`,
        metadata: {
          team_id: created.teamId,
          service_id: created.serviceId,
          timezone: created.timezone,
          rotation_count: input.rotations.length,
        },
      });

      return scheduleWithRelations;
    });

    return this.mapSchedule(schedule);
  }

  async updateSchedule(scheduleId: string, input: UpdateOnCallScheduleRequest): Promise<OnCallSchedule> {
    const schedule = await this.db.$transaction(async (tx) => {
      const existing = await tx.onCallSchedule.findUnique({
        where: {
          id: scheduleId,
        },
      });

      if (!existing) {
        throw new OnCallError("on_call_schedule_not_found", "On-call schedule not found");
      }

      const nextScope = {
        service_id: input.service_id === undefined ? existing.serviceId : input.service_id,
        team_id: input.team_id === undefined ? existing.teamId : input.team_id,
      };

      await this.assertScheduleReferences(tx, existing.workspaceId, nextScope);

      if (input.rotations) {
        await this.assertRotationParticipants(tx, existing.workspaceId, input.rotations);
      }

      this.assertScheduleTimezones(input.timezone ?? existing.timezone, input.rotations ?? []);
      this.assertSharedRotationCadence(input.rotations ?? []);

      const updated = await tx.onCallSchedule.update({
        where: {
          id: scheduleId,
        },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.team_id !== undefined ? { teamId: input.team_id } : {}),
          ...(input.service_id !== undefined ? { serviceId: input.service_id } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        },
      });

      if (input.rotations) {
        await tx.onCallRotation.deleteMany({
          where: {
            scheduleId,
          },
        });

        for (const rotation of input.rotations) {
          await this.createRotation(tx, scheduleId, rotation);
        }
      }

      const scheduleWithRelations = await tx.onCallSchedule.findUniqueOrThrow({
        where: {
          id: scheduleId,
        },
        include: this.scheduleInclude(),
      });

      await recordActivityLog(tx, {
        workspaceId: updated.workspaceId,
        resourceType: "on_call_schedule",
        resourceId: scheduleId,
        action: "on_call_schedule.updated",
        message: `On-call schedule updated: ${updated.name}`,
        metadata: {
          changed_fields: Object.keys(input),
          team_id: updated.teamId,
          service_id: updated.serviceId,
          timezone: updated.timezone,
          rotations_replaced: Boolean(input.rotations),
        },
      });

      return scheduleWithRelations;
    });

    return this.mapSchedule(schedule);
  }

  async deleteSchedule(scheduleId: string): Promise<OnCallSchedule | null> {
    const existing = await this.db.$transaction(async (tx) => {
      const schedule = await tx.onCallSchedule.findUnique({
        where: {
          id: scheduleId,
        },
        include: this.scheduleInclude(),
      });

      if (!schedule) {
        return null;
      }

      const policyStepCount = await tx.escalationPolicyStep.count({
        where: {
          targetId: scheduleId,
          targetType: {
            in: ["primary_on_call", "secondary_on_call"],
          },
        },
      });

      if (policyStepCount > 0) {
        throw new OnCallError("on_call_schedule_in_use", "On-call schedule is used by an escalation policy");
      }

      await tx.onCallSchedule.delete({
        where: {
          id: scheduleId,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: schedule.workspaceId,
        resourceType: "on_call_schedule",
        resourceId: scheduleId,
        action: "on_call_schedule.deleted",
        message: `On-call schedule deleted: ${schedule.name}`,
        metadata: {
          team_id: schedule.teamId,
          service_id: schedule.serviceId,
          timezone: schedule.timezone,
          rotation_count: schedule.rotations.length,
        },
      });

      return schedule;
    });

    return existing ? this.mapSchedule(existing) : null;
  }

  async createOverride(input: CreateOnCallOverrideRequest): Promise<OnCallOverride> {
    const startsAt = new Date(input.starts_at);
    const endsAt = new Date(input.ends_at);

    if (endsAt <= startsAt) {
      throw new OnCallError("invalid_override_window", "Override end time must be after start time");
    }

    const override = await this.db.$transaction(async (tx) => {
      const [schedule, user] = await Promise.all([
        tx.onCallSchedule.findUnique({ where: { id: input.schedule_id } }),
        tx.user.findUnique({ where: { id: input.user_id } }),
      ]);

      if (!schedule) {
        throw new OnCallError("on_call_schedule_not_found", "On-call schedule not found");
      }

      if (!user) {
        throw new OnCallError("user_not_found", "User not found");
      }

      await this.assertWorkspaceMembers(tx, schedule.workspaceId, [input.user_id]);

      const created = await tx.onCallOverride.create({
        data: {
          scheduleId: input.schedule_id,
          userId: input.user_id,
          layer: input.layer,
          startsAt,
          endsAt,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: schedule.workspaceId,
        resourceType: "on_call_override",
        resourceId: created.id,
        action: "on_call_override.created",
        message: `On-call override created for ${created.layer}`,
        metadata: {
          schedule_id: created.scheduleId,
          user_id: created.userId,
          layer: created.layer,
          starts_at: created.startsAt.toISOString(),
          ends_at: created.endsAt.toISOString(),
        },
      });

      return created;
    });

    return this.mapOverride(override);
  }

  async deleteOverride(overrideId: string): Promise<OnCallOverride | null> {
    const existing = await this.db.$transaction(async (tx) => {
      const override = await tx.onCallOverride.findUnique({
        where: {
          id: overrideId,
        },
        include: {
          schedule: {
            select: {
              workspaceId: true,
            },
          },
        },
      });

      if (!override) {
        return null;
      }

      await tx.onCallOverride.delete({
        where: {
          id: overrideId,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: override.schedule.workspaceId,
        resourceType: "on_call_override",
        resourceId: overrideId,
        action: "on_call_override.deleted",
        message: `On-call override deleted for ${override.layer}`,
        metadata: {
          schedule_id: override.scheduleId,
          user_id: override.userId,
          layer: override.layer,
          starts_at: override.startsAt.toISOString(),
          ends_at: override.endsAt.toISOString(),
        },
      });

      return override;
    });

    if (!existing) {
      return null;
    }

    return this.mapOverride(existing);
  }

  async getCurrentOnCall(
    serviceId: string,
    at: Date = new Date(),
  ): Promise<CurrentOnCall> {
    const [primaryScheduleId, secondaryScheduleId] = await Promise.all([
      this.resolveScheduleIdForServiceLayer(this.db, serviceId, "primary"),
      this.resolveScheduleIdForServiceLayer(this.db, serviceId, "secondary"),
    ]);

    const [primaryUserId, secondaryUserId] = await Promise.all([
      primaryScheduleId ? this.resolveLayerUserFromClient(this.db, primaryScheduleId, "primary", at) : Promise.resolve(null),
      secondaryScheduleId ? this.resolveLayerUserFromClient(this.db, secondaryScheduleId, "secondary", at) : Promise.resolve(null),
    ]);

    return {
      primary_user_id: primaryUserId,
      secondary_user_id: secondaryUserId,
      resolved_at: at.toISOString(),
    };
  }

  async previewSchedule(
    scheduleId: string,
    query: Partial<OnCallSchedulePreviewQuery> = {},
  ): Promise<OnCallSchedulePreview | null> {
    const schedule = await this.db.onCallSchedule.findUnique({
      where: {
        id: scheduleId,
      },
      select: {
        id: true,
        timezone: true,
      },
    });

    if (!schedule) {
      return null;
    }

    const startsAt = query.starts_at ? new Date(query.starts_at) : new Date();
    const endsAt = query.ends_at ? new Date(query.ends_at) : new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const stepMinutes = query.step_minutes ?? 1440;

    if (endsAt <= startsAt) {
      throw new OnCallError("invalid_preview_window", "Preview end time must be after start time");
    }

    this.assertValidTimeZone(schedule.timezone);

    const entries: OnCallSchedulePreview["entries"] = [];
    const stepMs = stepMinutes * 60 * 1000;

    for (let cursor = startsAt; cursor < endsAt; cursor = new Date(cursor.getTime() + stepMs)) {
      const entryEndsAt = new Date(Math.min(cursor.getTime() + stepMs, endsAt.getTime()));
      const [primaryUserId, secondaryUserId] = await Promise.all([
        this.resolveLayerUserFromClient(this.db, scheduleId, "primary", cursor),
        this.resolveLayerUserFromClient(this.db, scheduleId, "secondary", cursor),
      ]);

      entries.push({
        starts_at: cursor.toISOString(),
        ends_at: entryEndsAt.toISOString(),
        local_starts_at: this.formatInTimeZone(cursor, schedule.timezone),
        local_ends_at: this.formatInTimeZone(entryEndsAt, schedule.timezone),
        primary_user_id: primaryUserId,
        secondary_user_id: secondaryUserId,
      });
    }

    return {
      schedule_id: schedule.id,
      timezone: schedule.timezone,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      step_minutes: stepMinutes,
      entries,
    };
  }

  async resolveOnCallUserIdInTransaction(
    tx: TransactionClient,
    serviceId: string,
    layer: "primary" | "secondary",
    at: Date = new Date(),
  ): Promise<string | null> {
    const scheduleId = await this.resolveScheduleIdFromClient(tx, serviceId);

    if (!scheduleId) {
      return null;
    }

    return this.resolveLayerUserFromClient(tx, scheduleId, layer, at);
  }

  async resolveScheduleLayerUserIdInTransaction(
    tx: TransactionClient,
    scheduleId: string,
    layer: "primary" | "secondary",
    at: Date = new Date(),
  ): Promise<string | null> {
    return this.resolveLayerUserFromClient(tx, scheduleId, layer, at);
  }

  private async resolveScheduleIdForServiceLayer(
    db: OnCallReadClient,
    serviceId: string,
    layer: "primary" | "secondary",
  ): Promise<string | null> {
    const targetType = layer === "primary" ? "primary_on_call" : "secondary_on_call";
    const service = await db.service.findUnique({
      where: {
        id: serviceId,
      },
      select: {
        escalationPolicy: {
          select: {
            steps: {
              where: {
                targetType,
                targetId: {
                  not: null,
                },
              },
              orderBy: {
                stepOrder: "asc",
              },
              select: {
                targetId: true,
              },
            },
          },
        },
      },
    });

    const scheduleId = service?.escalationPolicy?.steps[0]?.targetId ?? null;

    return scheduleId ?? this.resolveScheduleIdFromClient(db, serviceId);
  }

  private async resolveScheduleIdFromClient(
    db: OnCallReadClient,
    serviceId: string,
  ): Promise<string | null> {
    const service = await db.service.findUnique({
      where: {
        id: serviceId,
      },
      select: {
        teamId: true,
      },
    });

    if (!service) {
      return null;
    }

    const serviceSchedule = await db.onCallSchedule.findFirst({
      where: {
        serviceId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    });

    if (serviceSchedule) {
      return serviceSchedule.id;
    }

    if (!service.teamId) {
      return null;
    }

    const teamSchedule = await db.onCallSchedule.findFirst({
      where: {
        teamId: service.teamId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    });

    return teamSchedule?.id ?? null;
  }

  private async assertScheduleReferences(
    db: Pick<PrismaClient | TransactionClient, "workspace" | "team" | "service">,
    workspaceId: string,
    input: OnCallScheduleScopeInput,
  ) {
    const workspace = await db.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
      },
    });

    if (!workspace) {
      throw new OnCallError("workspace_not_found", "Workspace not found");
    }

    if (input.team_id) {
      const team = await db.team.findUnique({
        where: {
          id: input.team_id,
        },
        select: {
          id: true,
          workspaceId: true,
        },
      });

      if (!team) {
        throw new OnCallError("team_not_found", "Team not found");
      }

      if (team.workspaceId !== workspaceId) {
        throw new OnCallError("workspace_mismatch", "Team belongs to a different workspace");
      }
    }

    if (input.service_id) {
      const service = await db.service.findUnique({
        where: {
          id: input.service_id,
        },
        select: {
          id: true,
          workspaceId: true,
        },
      });

      if (!service) {
        throw new OnCallError("service_not_found", "Service not found");
      }

      if (service.workspaceId !== workspaceId) {
        throw new OnCallError("workspace_mismatch", "Service belongs to a different workspace");
      }
    }
  }

  private async assertRotationParticipants(
    db: Pick<PrismaClient | TransactionClient, "user" | "workspaceMember">,
    workspaceId: string,
    rotations: UpsertOnCallRotationRequest[],
  ) {
    const userIds = new Set(rotations.flatMap((rotation) => rotation.participants));

    if (userIds.size === 0) {
      return;
    }

    const users = await db.user.findMany({
      where: {
        id: {
          in: [...userIds],
        },
      },
      select: {
        id: true,
      },
    });

    if (users.length !== userIds.size) {
      throw new OnCallError("user_not_found", "One or more rotation participants were not found");
    }

    await this.assertWorkspaceMembers(db, workspaceId, [...userIds]);
  }

  private async assertWorkspaceMembers(
    db: Pick<PrismaClient | TransactionClient, "workspaceMember">,
    workspaceId: string,
    userIds: string[],
  ) {
    if (userIds.length === 0) {
      return;
    }

    const members = await db.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: {
          in: userIds,
        },
      },
      select: {
        role: true,
        roles: {
          select: {
            roleKey: true,
          },
        },
        userId: true,
      },
    });

    if (members.length !== new Set(userIds).size) {
      throw new OnCallError("workspace_member_not_found", "One or more users are not workspace members");
    }

    const invalidParticipants = members.filter((member) => {
      const roleKeys = normalizeWorkspaceRoleKeys(
        member.roles.map((role) => role.roleKey),
        member.role as WorkspaceRole,
      );

      return !hasWorkspacePermission(roleKeys, "on_call.participate")
        && !hasWorkspacePermission(roleKeys, "notification.receive");
    });

    if (invalidParticipants.length > 0) {
      throw new OnCallError(
        "on_call_participant_role_required",
        "One or more rotation participants need on-call participant or notification recipient role",
      );
    }
  }

  private async createRotation(
    tx: TransactionClient,
    scheduleId: string,
    rotation: UpsertOnCallRotationRequest,
  ) {
    const created = await tx.onCallRotation.create({
      data: {
        ...(rotation.id ? { id: rotation.id } : {}),
        scheduleId,
        layer: rotation.layer,
        rotationType: rotation.rotation_type,
        rotationInterval: rotation.rotation_interval,
        startsAt: new Date(rotation.starts_at),
        timezone: rotation.timezone,
      },
    });

    await tx.onCallRotationParticipant.createMany({
      data: rotation.participants.map((userId, position) => ({
        rotationId: created.id,
        userId,
        position,
      })),
    });
  }

  private async resolveLayerUserFromClient(
    db: OnCallReadClient,
    scheduleId: string,
    layer: "primary" | "secondary",
    at: Date,
  ): Promise<string | null> {
    const override = await db.onCallOverride.findFirst({
      where: {
        scheduleId,
        layer,
        startsAt: {
          lte: at,
        },
        endsAt: {
          gt: at,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        userId: true,
      },
    });

    if (override) {
      return override.userId;
    }

    const rotation = await db.onCallRotation.findFirst({
      where: {
        scheduleId,
        layer,
      },
      include: {
        participants: {
          orderBy: {
            position: "asc",
          },
          select: {
            userId: true,
            position: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!rotation || rotation.participants.length === 0) {
      return null;
    }

    return this.pickRotationParticipant(rotation, at);
  }

  private pickRotationParticipant(rotation: RotationWithParticipants, at: Date): string {
    const interval = Math.max(1, rotation.rotationInterval);
    const elapsedUnits = this.elapsedRotationUnits(rotation, at);
    const slot = Math.floor(elapsedUnits / interval) % rotation.participants.length;

    const participant = rotation.participants[slot] ?? rotation.participants[0];

    if (!participant) {
      throw new Error("On-call rotation has no participants");
    }

    return participant.userId;
  }

  private elapsedRotationUnits(rotation: RotationWithParticipants, at: Date): number {
    if (at <= rotation.startsAt) {
      return 0;
    }

    if (rotation.rotationType === "custom") {
      return Math.floor((at.getTime() - rotation.startsAt.getTime()) / (60 * 60 * 1000));
    }

    const elapsedDays = this.elapsedCalendarDays(rotation.startsAt, at, rotation.timezone);

    if (rotation.rotationType === "weekly") {
      return Math.floor(elapsedDays / 7);
    }

    return elapsedDays;
  }

  private elapsedCalendarDays(start: Date, end: Date, timezone: string): number {
    const safeTimeZone = this.assertValidTimeZone(timezone);
    const startDate = this.localDateParts(start, safeTimeZone);
    const endDate = this.localDateParts(end, safeTimeZone);
    const startUtcDay = Date.UTC(startDate.year, startDate.month - 1, startDate.day);
    const endUtcDay = Date.UTC(endDate.year, endDate.month - 1, endDate.day);

    return Math.max(0, Math.floor((endUtcDay - startUtcDay) / (24 * 60 * 60 * 1000)));
  }

  private localDateParts(value: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(value);
    const lookup = new Map(parts.map((part) => [part.type, part.value]));

    return {
      year: Number(lookup.get("year")),
      month: Number(lookup.get("month")),
      day: Number(lookup.get("day")),
    };
  }

  private formatInTimeZone(value: Date, timezone: string): string {
    const safeTimeZone = this.assertValidTimeZone(timezone);

    return new Intl.DateTimeFormat("sv-SE", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: safeTimeZone,
    }).format(value);
  }

  private assertScheduleTimezones(scheduleTimezone: string, rotations: UpsertOnCallRotationRequest[]) {
    this.assertValidTimeZone(scheduleTimezone);

    for (const rotation of rotations) {
      this.assertValidTimeZone(rotation.timezone);
    }
  }

  private assertSharedRotationCadence(rotations: UpsertOnCallRotationRequest[]) {
    if (rotations.length <= 1) {
      return;
    }

    const firstRotation = rotations[0];

    if (!firstRotation) {
      return;
    }

    const firstStartsAt = new Date(firstRotation.starts_at).getTime();

    for (const rotation of rotations) {
      if (
        rotation.rotation_type !== firstRotation.rotation_type
        || rotation.rotation_interval !== firstRotation.rotation_interval
        || new Date(rotation.starts_at).getTime() !== firstStartsAt
        || rotation.timezone !== firstRotation.timezone
      ) {
        throw new OnCallError("invalid_rotation_cadence", "All rotations in a schedule must share the same cadence");
      }
    }
  }

  private assertValidTimeZone(timezone: string): string {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
      return timezone;
    } catch {
      throw new OnCallError("invalid_timezone", `Invalid IANA timezone: ${timezone}`);
    }
  }

  private scheduleInclude() {
    return {
      rotations: {
        include: {
          participants: {
            orderBy: {
              position: "asc" as const,
            },
          },
        },
        orderBy: [
          {
            layer: "asc" as const,
          },
          {
            createdAt: "asc" as const,
          },
        ],
      },
      overrides: {
        orderBy: {
          startsAt: "desc" as const,
        },
      },
    };
  }

  private mapSchedule(schedule: OnCallScheduleRecord): OnCallSchedule {
    return {
      id: schedule.id,
      workspace_id: schedule.workspaceId,
      name: schedule.name,
      team_id: schedule.teamId,
      service_id: schedule.serviceId,
      timezone: schedule.timezone,
      rotations: schedule.rotations.map((rotation) => ({
        id: rotation.id,
        schedule_id: rotation.scheduleId,
        layer: rotation.layer as OnCallSchedule["rotations"][number]["layer"],
        rotation_type: rotation.rotationType as OnCallSchedule["rotations"][number]["rotation_type"],
        rotation_interval: rotation.rotationInterval,
        starts_at: rotation.startsAt.toISOString(),
        timezone: rotation.timezone,
        participants: rotation.participants.map((participant) => ({
          user_id: participant.userId,
          position: participant.position,
        })),
      })),
      overrides: schedule.overrides.map((override) => this.mapOverride(override)),
      created_at: schedule.createdAt.toISOString(),
      updated_at: schedule.updatedAt.toISOString(),
    };
  }

  private mapOverride(override: OnCallOverrideRecord): OnCallOverride {
    return {
      id: override.id,
      schedule_id: override.scheduleId,
      user_id: override.userId,
      layer: override.layer as OnCallOverride["layer"],
      starts_at: override.startsAt.toISOString(),
      ends_at: override.endsAt.toISOString(),
      created_at: override.createdAt.toISOString(),
    };
  }
}
