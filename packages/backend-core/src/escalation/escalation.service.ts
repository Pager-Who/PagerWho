import { randomUUID } from "node:crypto";

import type {
  CreateEscalationPolicyRequest,
  EscalationPolicy,
  EscalationPolicyStep,
  IncidentEscalationState,
  ManualEscalationRequest,
  UpdateEscalationPolicyRequest,
  UpsertEscalationPolicyStepRequest,
  WorkspaceRole,
} from "@im/contracts";
import type { PrismaClient, TransactionClient } from "@im/db";

import { recordActivityLog } from "../activity";
import { OnCallService } from "../on-call";
import { QuotaService } from "../quotas";
import { hasWorkspacePermission, normalizeWorkspaceRoleKeys } from "../workspaces";
import { EscalationError } from "./escalation.errors";

type EscalationPolicyRecord = {
  id: string;
  workspaceId: string;
  name: string;
  repeatEnabled: boolean;
  repeatIntervalSeconds: number | null;
  repeatLimit: number | null;
  steps: EscalationPolicyStepRecord[];
  createdAt: Date;
  updatedAt: Date;
};

type EscalationPolicyStepRecord = {
  id: string;
  policyId: string;
  stepOrder: number;
  delaySeconds: number;
  targetType: string;
  targetId: string | null;
};

type IncidentEscalationStateRecord = {
  incidentId: string;
  policyId: string;
  currentStep: number;
  repeatIteration: number;
  nextRunAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type SnapshotStep = {
  id: string;
  step_order: number;
  delay_seconds: number;
  target_type: EscalationPolicyStep["target_type"];
  target_id: string | null;
};

type PolicySnapshot = {
  id: string;
  name: string;
  repeat_enabled: boolean;
  repeat_interval_seconds: number | null;
  repeat_limit: number | null;
  steps: SnapshotStep[];
};

type IncidentForEscalation = {
  id: string;
  workspaceId: string;
  serviceId: string;
  title: string;
  severity: string;
  status: string;
};

type NotificationTarget = {
  channel: "slack" | "email" | "sms" | "phone" | "webhook";
  targetId: string | null;
  targetAddress: string;
  delaySeconds: number;
};

type UserNotificationRoute = {
  id: string;
  email: string;
  notificationContacts: {
    type: string;
    address: string;
    verifiedAt: Date | null;
  }[];
  notificationPreferences: {
    channel: string;
    enabled: boolean;
    delaySeconds: number;
  }[];
};

type TeamMemberNotificationRoute = {
  user: UserNotificationRoute;
};

type NotificationLogCreationOptions = {
  idempotencyScope?: string;
};

export class EscalationService {
  private readonly onCallService: OnCallService;
  private readonly quotaService: QuotaService;

  constructor(private readonly db: PrismaClient) {
    this.onCallService = new OnCallService(db);
    this.quotaService = new QuotaService(db);
  }

  async listPolicies(filters: { workspaceId?: string; workspaceIds?: string[] } = {}): Promise<EscalationPolicy[]> {
    const policies = await this.db.escalationPolicy.findMany({
      where: {
        ...(filters.workspaceId
          ? { workspaceId: filters.workspaceId }
          : filters.workspaceIds
            ? { workspaceId: { in: filters.workspaceIds } }
            : {}),
      },
      include: this.policyInclude(),
      orderBy: {
        name: "asc",
      },
    });

    return policies.map((policy) => this.mapPolicy(policy));
  }

  async getPolicy(policyId: string): Promise<EscalationPolicy | null> {
    const policy = await this.db.escalationPolicy.findUnique({
      where: {
        id: policyId,
      },
      include: this.policyInclude(),
    });

    return policy ? this.mapPolicy(policy) : null;
  }

  async createPolicy(input: CreateEscalationPolicyRequest): Promise<EscalationPolicy> {
    this.assertValidPolicySteps(input.steps);
    await this.assertPolicyReferences(this.db, input.workspace_id, input.steps);
    await this.quotaService.assertCanCreateWorkspaceResource({
      resource: "escalation_policies",
      workspaceId: input.workspace_id,
    });

    const policy = await this.db.$transaction(async (tx) => {
      const created = await tx.escalationPolicy.create({
        data: {
          workspaceId: input.workspace_id,
          name: input.name,
          repeatEnabled: input.repeat_enabled,
          repeatIntervalSeconds: input.repeat_interval_seconds ?? null,
          repeatLimit: input.repeat_limit ?? null,
          steps: {
            create: input.steps.map((step) => ({
              ...(step.id ? { id: step.id } : {}),
              stepOrder: step.step_order,
              delaySeconds: step.delay_seconds,
              targetType: step.target_type,
              targetId: step.target_id ?? null,
            })),
          },
        },
        include: this.policyInclude(),
      });

      await recordActivityLog(tx, {
        workspaceId: created.workspaceId,
        resourceType: "escalation_policy",
        resourceId: created.id,
        action: "escalation_policy.created",
        message: `Escalation policy created: ${created.name}`,
        metadata: policyActivityMetadata(created),
      });

      return created;
    });

    return this.mapPolicy(policy);
  }

  async updatePolicy(policyId: string, input: UpdateEscalationPolicyRequest): Promise<EscalationPolicy> {
    if (input.steps) {
      this.assertValidPolicySteps(input.steps);
    }

    const policy = await this.db.$transaction(async (tx) => {
      const existing = await tx.escalationPolicy.findUnique({
        where: {
          id: policyId,
        },
      });

      if (!existing) {
        throw new EscalationError("escalation_policy_not_found", "Escalation policy not found");
      }

      if (input.steps) {
        await this.assertPolicyReferences(tx, existing.workspaceId, input.steps);
      }

      await tx.escalationPolicy.update({
        where: {
          id: policyId,
        },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.repeat_enabled !== undefined ? { repeatEnabled: input.repeat_enabled } : {}),
          ...(input.repeat_interval_seconds !== undefined
            ? { repeatIntervalSeconds: input.repeat_interval_seconds }
            : {}),
          ...(input.repeat_limit !== undefined ? { repeatLimit: input.repeat_limit } : {}),
        },
      });

      if (input.steps) {
        await tx.escalationPolicyStep.deleteMany({
          where: {
            policyId,
          },
        });

        await tx.escalationPolicyStep.createMany({
          data: input.steps.map((step) => ({
            ...(step.id ? { id: step.id } : {}),
            policyId,
            stepOrder: step.step_order,
            delaySeconds: step.delay_seconds,
            targetType: step.target_type,
            targetId: step.target_id ?? null,
          })),
        });
      }

      const policyWithSteps = await tx.escalationPolicy.findUniqueOrThrow({
        where: {
          id: policyId,
        },
        include: this.policyInclude(),
      });

      await recordActivityLog(tx, {
        workspaceId: policyWithSteps.workspaceId,
        resourceType: "escalation_policy",
        resourceId: policyId,
        action: "escalation_policy.updated",
        message: `Escalation policy updated: ${policyWithSteps.name}`,
        metadata: {
          ...policyActivityMetadata(policyWithSteps),
          changed_fields: Object.keys(input),
          steps_replaced: Boolean(input.steps),
        },
      });

      return policyWithSteps;
    });

    return this.mapPolicy(policy);
  }

  async deletePolicy(policyId: string): Promise<EscalationPolicy | null> {
    const existing = await this.db.$transaction(async (tx) => {
      const policy = await tx.escalationPolicy.findUnique({
        where: {
          id: policyId,
        },
        include: this.policyInclude(),
      });

      if (!policy) {
        return null;
      }

      const [serviceCount, escalationStateCount, notificationLogCount] = await Promise.all([
        tx.service.count({
          where: {
            escalationPolicyId: policyId,
          },
        }),
        tx.incidentEscalationState.count({
          where: {
            policyId,
          },
        }),
        tx.notificationLog.count({
          where: {
            policyStep: {
              policyId,
            },
          },
        }),
      ]);

      if (serviceCount > 0 || escalationStateCount > 0 || notificationLogCount > 0) {
        throw new EscalationError("escalation_policy_in_use", "Escalation policy is used by services or incident history");
      }

      await tx.escalationPolicy.delete({
        where: {
          id: policyId,
        },
      });

      await recordActivityLog(tx, {
        workspaceId: policy.workspaceId,
        resourceType: "escalation_policy",
        resourceId: policyId,
        action: "escalation_policy.deleted",
        message: `Escalation policy deleted: ${policy.name}`,
        metadata: policyActivityMetadata(policy),
      });

      return policy;
    });

    return existing ? this.mapPolicy(existing) : null;
  }

  async start(incidentId: string): Promise<IncidentEscalationState> {
    const state = await this.db.$transaction(async (tx) => {
      const incident = await tx.incident.findUnique({
        where: {
          id: incidentId,
        },
        include: {
          service: {
            include: {
              escalationPolicy: {
                include: this.policyInclude(),
              },
            },
          },
        },
      });

      if (!incident) {
        throw new EscalationError("incident_not_found", "Incident not found");
      }

      const policy = incident.service.escalationPolicy;

      if (!policy || policy.steps.length === 0) {
        throw new EscalationError("invalid_escalation_policy", "Incident service has no escalation policy steps");
      }

      const snapshot = this.snapshotPolicy(policy);
      const firstStep = snapshot.steps[0];

      if (!firstStep) {
        throw new EscalationError("invalid_escalation_policy", "Escalation policy must contain at least one step");
      }

      const existingState = await tx.incidentEscalationState.findUnique({
        where: {
          incidentId,
        },
        select: {
          incidentId: true,
        },
      });
      const nextRunAt = new Date(Date.now() + firstStep.delay_seconds * 1000);
      const state = await tx.incidentEscalationState.upsert({
        where: {
          incidentId,
        },
        update: {
          policyId: policy.id,
          policySnapshot: snapshot,
          currentStep: firstStep.step_order,
          repeatIteration: 0,
          nextRunAt,
          status: "active",
        },
        create: {
          incidentId,
          policyId: policy.id,
          policySnapshot: snapshot,
          currentStep: firstStep.step_order,
          repeatIteration: 0,
          nextRunAt,
          status: "active",
        },
      });

      await tx.incidentTimelineEntry.create({
        data: {
          incidentId,
          type: existingState ? "escalation.restarted" : "escalation.started",
          message: `${existingState ? "Escalation restarted" : "Escalation started"} using policy ${policy.name}`,
          metadata: {
            first_step: firstStep.step_order,
            next_run_at: nextRunAt.toISOString(),
            policy_id: policy.id,
          },
        },
      });

      return state;
    });

    return this.mapEscalationState(state);
  }

  async executeNextDueState(): Promise<IncidentEscalationState | null> {
    const state = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ incident_id: string }[]>`
        SELECT ies.incident_id
        FROM incident_escalation_states ies
        JOIN incidents i ON i.id = ies.incident_id
        JOIN workspaces w ON w.id = i.workspace_id
        WHERE ies.status = 'active'
          AND ies.next_run_at IS NOT NULL
          AND ies.next_run_at <= now()
          AND w.suspended_at IS NULL
        ORDER BY ies.next_run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;

      const row = rows[0];

      if (!row) {
        return null;
      }

      return this.executeDueStepInTransaction(tx, row.incident_id);
    });

    return state ? this.mapEscalationState(state) : null;
  }

  async executeDueStep(incidentId: string): Promise<IncidentEscalationState> {
    const state = await this.db.$transaction((tx) => this.executeDueStepInTransaction(tx, incidentId));
    return this.mapEscalationState(state);
  }

  async triggerManualEscalation(
    incidentId: string,
    input: ManualEscalationRequest,
    actorUserId: string,
  ): Promise<IncidentEscalationState> {
    const state = await this.db.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where: {
          id: actorUserId,
        },
      });

      if (!actor) {
        throw new EscalationError("actor_not_found", "Actor user not found");
      }

      const lockedRows = await tx.$queryRaw<{ incident_id: string }[]>`
        SELECT incident_id
        FROM incident_escalation_states
        WHERE incident_id = ${incidentId}::uuid
        FOR UPDATE
      `;

      if (lockedRows.length === 0) {
        throw new EscalationError("incident_escalation_state_not_found", "Incident escalation state not found");
      }

      const state = await tx.incidentEscalationState.findUnique({
        where: {
          incidentId,
        },
        include: {
          incident: true,
        },
      });

      if (!state) {
        throw new EscalationError("incident_escalation_state_not_found", "Incident escalation state not found");
      }

      if (state.incident.status === "resolved") {
        throw new EscalationError("invalid_incident_state", "Resolved incidents cannot be manually escalated");
      }

      if (state.incident.status === "acknowledged" && !input.force) {
        throw new EscalationError("invalid_incident_state", "Acknowledged incidents require force=true for manual escalation");
      }

      const snapshot = this.parseSnapshot(state.policySnapshot);
      const steps = [...snapshot.steps].sort((a, b) => a.step_order - b.step_order);
      const currentStep = steps.find((step) => step.step_order === state.currentStep) ?? steps[0];
      const targetStep = this.resolveManualStep(input, steps, currentStep);
      const manualRunId = `manual:${randomUUID()}`;
      const notificationLogsCreated = await this.createNotificationLogsForStep(
        tx,
        state.incident,
        targetStep,
        state.repeatIteration,
        {
          idempotencyScope: manualRunId,
        },
      );

      await tx.incidentTimelineEntry.create({
        data: {
          incidentId,
          type: "escalation.manual_triggered",
          message: `Manual escalation ${input.action} executed for step ${targetStep.step_order}`,
          actorUserId: actor.id,
          metadata: {
            action: input.action,
            force: input.force,
            manual_run_id: manualRunId,
            notification_logs_created: notificationLogsCreated,
            previous_step: state.currentStep,
            reason: input.reason ?? null,
            repeat_iteration: state.repeatIteration,
            step_id: targetStep.id,
            step_order: targetStep.step_order,
            update_current_step: input.update_current_step,
          },
        },
      });

      await recordActivityLog(tx, {
        workspaceId: state.incident.workspaceId,
        resourceType: "incident",
        resourceId: incidentId,
        action: "escalation.manual_triggered",
        message: `Manual escalation ${input.action} executed for step ${targetStep.step_order}`,
        actorUserId: actor.id,
        metadata: {
          action: input.action,
          force: input.force,
          manual_run_id: manualRunId,
          notification_logs_created: notificationLogsCreated,
          previous_step: state.currentStep,
          reason: input.reason ?? null,
          repeat_iteration: state.repeatIteration,
          service_id: state.incident.serviceId,
          step_id: targetStep.id,
          step_order: targetStep.step_order,
          update_current_step: input.update_current_step,
        },
      });

      const shouldAdvanceState = input.action === "advance_to_next_step";
      const shouldUpdateCurrentStep = shouldAdvanceState
        || (input.action === "run_specific_step" && input.update_current_step);

      if (!shouldUpdateCurrentStep) {
        return state;
      }

      if (state.incident.status === "acknowledged") {
        return tx.incidentEscalationState.update({
          where: {
            incidentId,
          },
          data: {
            currentStep: targetStep.step_order,
            nextRunAt: null,
            status: "stopped",
          },
        });
      }

      if (shouldAdvanceState) {
        const nextState = this.calculateNextState(snapshot, targetStep, state.repeatIteration);

        return tx.incidentEscalationState.update({
          where: {
            incidentId,
          },
          data: {
            currentStep: nextState.currentStep,
            repeatIteration: nextState.repeatIteration,
            nextRunAt: nextState.nextRunAt,
            status: nextState.status,
          },
        });
      }

      return tx.incidentEscalationState.update({
        where: {
          incidentId,
        },
        data: {
          currentStep: targetStep.step_order,
        },
      });
    });

    return this.mapEscalationState(state);
  }

  private async executeDueStepInTransaction(
    tx: TransactionClient,
    incidentId: string,
  ): Promise<IncidentEscalationStateRecord> {
    const lockedRows = await tx.$queryRaw<{ incident_id: string }[]>`
      SELECT incident_id
      FROM incident_escalation_states
      WHERE incident_id = ${incidentId}::uuid
      FOR UPDATE
    `;

    if (lockedRows.length === 0) {
      throw new EscalationError("incident_not_found", "Incident escalation state not found");
    }

    const state = await tx.incidentEscalationState.findUnique({
      where: {
        incidentId,
      },
      include: {
        incident: true,
      },
    });

    if (!state) {
      throw new EscalationError("incident_not_found", "Incident escalation state not found");
    }

    if (state.status !== "active") {
      return state;
    }

    if (state.incident.status === "acknowledged" || state.incident.status === "resolved") {
      await tx.incidentTimelineEntry.create({
        data: {
          incidentId,
          type: "escalation.stopped",
          message: `Escalation stopped because incident is ${state.incident.status}`,
          metadata: {
            status: state.incident.status,
          },
        },
      });

      return tx.incidentEscalationState.update({
        where: {
          incidentId,
        },
        data: {
          status: "stopped",
          nextRunAt: null,
        },
      });
    }

    const snapshot = this.parseSnapshot(state.policySnapshot);
    const steps = [...snapshot.steps].sort((a, b) => a.step_order - b.step_order);
    const currentStep = steps.find((step) => step.step_order === state.currentStep) ?? steps[0];

    if (!currentStep) {
      return tx.incidentEscalationState.update({
        where: {
          incidentId,
        },
        data: {
          status: "completed",
          nextRunAt: null,
        },
      });
    }

    const notificationLogsCreated = await this.createNotificationLogsForStep(tx, state.incident, currentStep, state.repeatIteration);

    await tx.incidentTimelineEntry.create({
      data: {
        incidentId,
        type: "escalation.step_executed",
        message: `Escalation step ${currentStep.step_order} executed`,
        metadata: {
          step_id: currentStep.id,
          target_type: currentStep.target_type,
          notification_logs_created: notificationLogsCreated,
          repeat_iteration: state.repeatIteration,
        },
      },
    });

    const nextState = this.calculateNextState(snapshot, currentStep, state.repeatIteration);

    if (nextState.repeated) {
      await tx.incidentTimelineEntry.create({
        data: {
          incidentId,
          type: "escalation.repeated",
          message: `Escalation repeat iteration ${nextState.repeatIteration} scheduled`,
          metadata: {
            repeat_iteration: nextState.repeatIteration,
          },
        },
      });
    }

    return tx.incidentEscalationState.update({
      where: {
        incidentId,
      },
      data: {
        currentStep: nextState.currentStep,
        repeatIteration: nextState.repeatIteration,
        nextRunAt: nextState.nextRunAt,
        status: nextState.status,
      },
    });
  }

  private calculateNextState(
    snapshot: PolicySnapshot,
    currentStep: SnapshotStep,
    repeatIteration: number,
  ): {
    currentStep: number;
    nextRunAt: Date | null;
    repeatIteration: number;
    repeated: boolean;
    status: "active" | "completed";
  } {
    const steps = [...snapshot.steps].sort((a, b) => a.step_order - b.step_order);
    const currentIndex = steps.findIndex((step) => step.step_order === currentStep.step_order);
    const nextStep = steps[currentIndex + 1];
    const now = Date.now();

    if (nextStep) {
      return {
        currentStep: nextStep.step_order,
        repeatIteration,
        nextRunAt: new Date(now + nextStep.delay_seconds * 1000),
        repeated: false,
        status: "active",
      };
    }

    const canRepeat = snapshot.repeat_enabled
      && (snapshot.repeat_limit === null || repeatIteration + 1 < snapshot.repeat_limit);

    if (!canRepeat) {
      return {
        currentStep: currentStep.step_order,
        repeatIteration,
        nextRunAt: null,
        repeated: false,
        status: "completed",
      };
    }

    const firstStep = steps[0];

    if (!firstStep) {
      return {
        currentStep: currentStep.step_order,
        repeatIteration,
        nextRunAt: null,
        repeated: false,
        status: "completed",
      };
    }

    return {
      currentStep: firstStep.step_order,
      repeatIteration: repeatIteration + 1,
      nextRunAt: new Date(now + (snapshot.repeat_interval_seconds ?? 0) * 1000),
      repeated: true,
      status: "active",
    };
  }

  private resolveManualStep(
    input: ManualEscalationRequest,
    steps: SnapshotStep[],
    currentStep: SnapshotStep | undefined,
  ): SnapshotStep {
    if (input.action === "trigger_current_step") {
      if (!currentStep) {
        throw new EscalationError("invalid_escalation_policy", "Escalation policy must contain at least one step");
      }

      return currentStep;
    }

    if (input.action === "advance_to_next_step") {
      if (!currentStep) {
        throw new EscalationError("invalid_escalation_policy", "Escalation policy must contain at least one step");
      }

      const currentIndex = steps.findIndex((step) => step.step_order === currentStep.step_order);
      const nextStep = steps[currentIndex + 1];

      if (!nextStep) {
        throw new EscalationError("invalid_manual_escalation_action", "Incident is already at the final escalation step");
      }

      return nextStep;
    }

    const targetStep = steps.find((step) => step.step_order === input.step_order);

    if (!targetStep) {
      throw new EscalationError("invalid_manual_escalation_action", "Escalation step not found in incident policy snapshot");
    }

    return targetStep;
  }

  private async createNotificationLogsForStep(
    tx: TransactionClient,
    incident: IncidentForEscalation,
    step: SnapshotStep,
    repeatIteration: number,
    options: NotificationLogCreationOptions = {},
  ): Promise<number> {
    const targets = await this.resolveNotificationTargets(tx, incident.serviceId, step);
    let created = 0;

    for (const target of targets) {
      const idempotencyKey = [
        incident.id,
        step.id,
        repeatIteration,
        step.target_type,
        target.targetId ?? "none",
        target.channel,
        ...(options.idempotencyScope ? [options.idempotencyScope] : []),
      ].join(":");

      const existing = await tx.notificationLog.findUnique({
        where: {
          idempotencyKey,
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        continue;
      }

      await tx.notificationLog.create({
        data: {
          incidentId: incident.id,
          policyStepId: step.id,
          repeatIteration,
          channel: target.channel,
          targetType: step.target_type,
          targetId: target.targetId,
          targetAddress: target.targetAddress,
          status: "pending",
          attempt: 0,
          idempotencyKey,
          nextRetryAt: target.delaySeconds > 0
            ? new Date(Date.now() + target.delaySeconds * 1000)
            : null,
        },
      });

      created += 1;
    }

    return created;
  }

  private async resolveNotificationTargets(
    tx: TransactionClient,
    serviceId: string,
    step: SnapshotStep,
  ): Promise<NotificationTarget[]> {
    if (step.target_type === "primary_on_call" || step.target_type === "secondary_on_call") {
      const layer = step.target_type === "primary_on_call" ? "primary" : "secondary";
      const user = step.target_id
        ? await this.resolveOnCallScheduleUser(tx, step.target_id, layer)
        : await this.resolveOnCallUser(tx, serviceId, layer);

      if (!user) {
        return [];
      }

      return this.resolveUserNotificationTargets(user);
    }

    if (step.target_type === "user" && step.target_id) {
      const user = await tx.user.findUnique({
        where: {
          id: step.target_id,
        },
        include: this.userNotificationRouteInclude(),
      });

      return user ? this.resolveUserNotificationTargets(user) : [];
    }

    if (step.target_type === "team" && step.target_id) {
      const members = await tx.teamMember.findMany({
        where: {
          teamId: step.target_id,
        },
        include: {
          user: {
            include: this.userNotificationRouteInclude(),
          },
        },
      });

      return members.flatMap((member: TeamMemberNotificationRoute) =>
        this.resolveUserNotificationTargets(member.user),
      );
    }

    if (step.target_type === "team_channel" && step.target_id) {
      return [
        {
          channel: "slack",
          targetId: step.target_id,
          targetAddress: step.target_id,
          delaySeconds: 0,
        },
      ];
    }

    if (step.target_type === "webhook" && step.target_id) {
      return [
        {
          channel: "webhook",
          targetId: step.target_id,
          targetAddress: step.target_id,
          delaySeconds: 0,
        },
      ];
    }

    return [];
  }

  private resolveUserNotificationTargets(user: UserNotificationRoute): NotificationTarget[] {
    const contacts = new Map(user.notificationContacts.map((contact) => [contact.type, contact]));
    const preferences = this.userPreferencesWithDefaults(user.notificationPreferences);
    const targets: NotificationTarget[] = [];

    for (const preference of preferences) {
      if (!preference.enabled) {
        continue;
      }

      if (preference.channel === "slack") {
        const contact = contacts.get("slack_webhook");

        if (contact) {
          targets.push({
            channel: "slack",
            targetId: user.id,
            targetAddress: contact.address,
            delaySeconds: preference.delaySeconds,
          });
        }
      }

      if (preference.channel === "email") {
        targets.push({
          channel: "email",
          targetId: user.id,
          targetAddress: user.email,
          delaySeconds: preference.delaySeconds,
        });
      }

      if (preference.channel === "sms" || preference.channel === "phone") {
        const contact = contacts.get(preference.channel === "sms" ? "phone_sms" : "phone_voice");

        if (contact?.verifiedAt) {
          targets.push({
            channel: preference.channel,
            targetId: user.id,
            targetAddress: contact.address,
            delaySeconds: preference.delaySeconds,
          });
        }
      }
    }

    return targets;
  }

  private async resolveOnCallUser(tx: TransactionClient, serviceId: string, layer: "primary" | "secondary") {
    const userId = await this.onCallService.resolveOnCallUserIdInTransaction(tx, serviceId, layer);

    if (!userId) {
      return null;
    }

    return tx.user.findUnique({
      where: {
        id: userId,
      },
      include: this.userNotificationRouteInclude(),
    });
  }

  private async resolveOnCallScheduleUser(tx: TransactionClient, scheduleId: string, layer: "primary" | "secondary") {
    const userId = await this.onCallService.resolveScheduleLayerUserIdInTransaction(tx, scheduleId, layer);

    if (!userId) {
      return null;
    }

    return tx.user.findUnique({
      where: {
        id: userId,
      },
      include: this.userNotificationRouteInclude(),
    });
  }

  private parseSnapshot(value: unknown): PolicySnapshot {
    if (!this.isPolicySnapshot(value) || value.steps.length === 0) {
      throw new EscalationError("invalid_escalation_policy", "Invalid escalation policy snapshot");
    }

    return {
      ...value,
      steps: [...value.steps].sort((a, b) => a.step_order - b.step_order),
    };
  }

  private isPolicySnapshot(value: unknown): value is PolicySnapshot {
    if (!value || typeof value !== "object") {
      return false;
    }

    const snapshot = value as Partial<PolicySnapshot>;
    return typeof snapshot.id === "string"
      && typeof snapshot.name === "string"
      && typeof snapshot.repeat_enabled === "boolean"
      && Array.isArray(snapshot.steps)
      && snapshot.steps.every((step) => this.isSnapshotStep(step));
  }

  private isSnapshotStep(value: unknown): value is SnapshotStep {
    if (!value || typeof value !== "object") {
      return false;
    }

    const step = value as Partial<SnapshotStep>;
    return typeof step.id === "string"
      && typeof step.step_order === "number"
      && typeof step.delay_seconds === "number"
      && typeof step.target_type === "string";
  }

  private snapshotPolicy(policy: EscalationPolicyRecord): PolicySnapshot {
    return {
      id: policy.id,
      name: policy.name,
      repeat_enabled: policy.repeatEnabled,
      repeat_interval_seconds: policy.repeatIntervalSeconds,
      repeat_limit: policy.repeatLimit,
      steps: policy.steps
        .map((step) => ({
          id: step.id,
          step_order: step.stepOrder,
          delay_seconds: step.delaySeconds,
          target_type: step.targetType as SnapshotStep["target_type"],
          target_id: step.targetId,
        }))
        .sort((a, b) => a.step_order - b.step_order),
    };
  }

  private assertValidPolicySteps(steps: UpsertEscalationPolicyStepRequest[]) {
    const seen = new Set<number>();

    for (const step of steps) {
      if (seen.has(step.step_order)) {
        throw new EscalationError("invalid_escalation_policy", "Escalation step order must be unique");
      }

      seen.add(step.step_order);

      if (step.target_type === "team_channel" && !isSlackIncomingWebhookUrl(step.target_id)) {
        throw new EscalationError(
          "invalid_escalation_policy",
          "Team channel escalation steps require a Slack Incoming Webhook URL target_id",
        );
      }

      if (step.target_type === "webhook" && !isHttpUrl(step.target_id)) {
        throw new EscalationError(
          "invalid_escalation_policy",
          "Webhook escalation steps require an HTTP URL target_id",
        );
      }

      if ((step.target_type === "user" || step.target_type === "team") && !isUuid(step.target_id)) {
        throw new EscalationError(
          "invalid_escalation_policy",
          `${step.target_type === "team" ? "Team" : "User"} escalation steps require a ${step.target_type} id target_id`,
        );
      }

      if ((step.target_type === "primary_on_call" || step.target_type === "secondary_on_call") && !isUuid(step.target_id)) {
        throw new EscalationError(
          "invalid_escalation_policy",
          "On-call escalation steps require an on-call schedule id target_id",
        );
      }
    }
  }

  private async assertPolicyReferences(
    db: Pick<PrismaClient | TransactionClient, "onCallSchedule" | "team" | "workspace" | "workspaceMember">,
    workspaceId: string,
    steps: UpsertEscalationPolicyStepRequest[],
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
      throw new EscalationError("workspace_not_found", "Workspace not found");
    }

    const userTargetIds = [...new Set(
      steps
        .filter((step) => step.target_type === "user" && step.target_id)
        .map((step) => step.target_id as string),
    )];
    const teamTargetIds = [...new Set(
      steps
        .filter((step) => step.target_type === "team" && step.target_id)
        .map((step) => step.target_id as string),
    )];
    const onCallScheduleTargetIds = [...new Set(
      steps
        .filter((step) => (step.target_type === "primary_on_call" || step.target_type === "secondary_on_call") && step.target_id)
        .map((step) => step.target_id as string),
    )];

    if (userTargetIds.length === 0 && teamTargetIds.length === 0 && onCallScheduleTargetIds.length === 0) {
      return;
    }

    const members = await db.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: {
          in: userTargetIds,
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

    if (members.length !== userTargetIds.length) {
      throw new EscalationError("workspace_member_not_found", "One or more escalation target users are not workspace members");
    }

    const invalidUserTargets = members.filter((member) => {
      const roleKeys = normalizeWorkspaceRoleKeys(
        member.roles.map((role) => role.roleKey),
        member.role as WorkspaceRole,
      );

      return !hasWorkspacePermission(roleKeys, "notification.receive")
        && !hasWorkspacePermission(roleKeys, "on_call.participate");
    });

    if (invalidUserTargets.length > 0) {
      throw new EscalationError(
        "notification_target_role_required",
        "One or more escalation target users need notification recipient or on-call participant role",
      );
    }

    if (teamTargetIds.length > 0) {
      const teams = await db.team.findMany({
        where: {
          workspaceId,
          id: {
            in: teamTargetIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (teams.length !== teamTargetIds.length) {
        throw new EscalationError("workspace_member_not_found", "One or more escalation target teams are not in this workspace");
      }
    }

    if (onCallScheduleTargetIds.length > 0) {
      const schedules = await db.onCallSchedule.findMany({
        where: {
          workspaceId,
          id: {
            in: onCallScheduleTargetIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (schedules.length !== onCallScheduleTargetIds.length) {
        throw new EscalationError("on_call_schedule_not_found", "One or more escalation target schedules are not in this workspace");
      }
    }
  }

  private policyInclude() {
    return {
      steps: {
        orderBy: {
          stepOrder: "asc" as const,
        },
      },
    };
  }

  private userNotificationRouteInclude() {
    return {
      notificationContacts: true,
      notificationPreferences: true,
    };
  }

  private userPreferencesWithDefaults(preferences: UserNotificationRoute["notificationPreferences"]) {
    const byChannel = new Map(preferences.map((preference) => [preference.channel, preference]));
    const defaults = [
      { channel: "slack", enabled: false, delaySeconds: 0 },
      { channel: "email", enabled: false, delaySeconds: 0 },
      { channel: "sms", enabled: false, delaySeconds: 0 },
      { channel: "phone", enabled: false, delaySeconds: 0 },
    ] as const;

    return defaults.map((defaultPreference) => {
      const preference = byChannel.get(defaultPreference.channel);

      return {
        channel: defaultPreference.channel,
        enabled: preference?.enabled ?? defaultPreference.enabled,
        delaySeconds: preference?.delaySeconds ?? defaultPreference.delaySeconds,
      };
    });
  }

  private mapPolicy(policy: EscalationPolicyRecord): EscalationPolicy {
    return {
      id: policy.id,
      workspace_id: policy.workspaceId,
      name: policy.name,
      repeat_enabled: policy.repeatEnabled,
      repeat_interval_seconds: policy.repeatIntervalSeconds,
      repeat_limit: policy.repeatLimit,
      steps: policy.steps.map((step) => this.mapPolicyStep(step)),
      created_at: policy.createdAt.toISOString(),
      updated_at: policy.updatedAt.toISOString(),
    };
  }

  private mapPolicyStep(step: EscalationPolicyStepRecord): EscalationPolicyStep {
    return {
      id: step.id,
      policy_id: step.policyId,
      step_order: step.stepOrder,
      delay_seconds: step.delaySeconds,
      target_type: step.targetType as EscalationPolicyStep["target_type"],
      target_id: maskPolicyStepTargetId(step.targetType, step.targetId),
    };
  }

  private mapEscalationState(state: IncidentEscalationStateRecord): IncidentEscalationState {
    return {
      incident_id: state.incidentId,
      policy_id: state.policyId,
      current_step: state.currentStep,
      repeat_iteration: state.repeatIteration,
      next_run_at: state.nextRunAt?.toISOString() ?? null,
      status: state.status as IncidentEscalationState["status"],
      created_at: state.createdAt.toISOString(),
      updated_at: state.updatedAt.toISOString(),
    };
  }
}

function isSlackIncomingWebhookUrl(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith("https://hooks.slack.com/services/"));
}

function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith("http://") || value?.startsWith("https://"));
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

function policyActivityMetadata(policy: EscalationPolicyRecord): Record<string, unknown> {
  return {
    repeat_enabled: policy.repeatEnabled,
    repeat_interval_seconds: policy.repeatIntervalSeconds,
    repeat_limit: policy.repeatLimit,
    step_count: policy.steps.length,
    steps: policy.steps.map((step) => ({
      delay_seconds: step.delaySeconds,
      step_order: step.stepOrder,
      target_type: step.targetType,
    })),
  };
}

function maskPolicyStepTargetId(targetType: string, targetId: string | null): string | null {
  if (!targetId || (targetType !== "team_channel" && targetType !== "webhook")) {
    return targetId;
  }

  try {
    const url = new URL(targetId);
    return `${url.origin}/***`;
  } catch {
    return "***";
  }
}
