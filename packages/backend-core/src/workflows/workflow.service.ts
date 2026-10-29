import {
  type ActivityResourceType,
  type CreateEscalationPolicyRequest,
  type CreateIncidentRequest,
  type CreateOnCallOverrideRequest,
  type CreateOnCallScheduleRequest,
  type CreateWorkflowRequest,
  type IncidentPriority,
  type IncidentSeverity,
  type PaginatedResponse,
  type UpdateEscalationPolicyRequest,
  type UpdateOnCallScheduleRequest,
  type UpdateWorkspaceNotificationProviderSettingRequest,
  type UpdateWorkflowRequest,
  type WorkspaceNotificationProvider,
  type Workflow,
  type WorkflowAction,
  type WorkflowActionInput,
  type WorkflowActionRun,
  type WorkflowEvent,
  type WorkflowRun,
  type WorkflowRunListQuery,
  type WorkflowTestRunRequest,
  type WorkflowTrigger,
  type WorkflowTriggerCatalogItem,
  type WorkflowTriggerFilter,
  type WorkflowTriggerInput,
  type WorkflowListQuery,
  type WorkspacePermission,
} from "@im/contracts";
import { Prisma, type PrismaClient } from "@im/db";

import { runWithActivityOrigin } from "../activity";
import { EscalationService } from "../escalation";
import { IncidentService } from "../incidents";
import { OnCallService } from "../on-call";
import { ServiceCatalogService } from "../services";
import { decryptProviderCredential, MANAGED_WEBHOOK_WORKFLOW_KIND, WorkspaceService } from "../workspaces";
import { WorkflowError } from "./workflow.errors";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const INCIDENT_PRIORITIES = ["P1", "P2", "P3", "P4", "P5"] as const satisfies readonly IncidentPriority[];
const INCIDENT_SEVERITIES = ["critical", "high", "medium", "low"] as const satisfies readonly IncidentSeverity[];
const MANUAL_ESCALATION_ACTIONS = ["trigger_current_step", "advance_to_next_step", "run_specific_step"] as const;
const NOTIFICATION_PROVIDERS = ["slack", "email", "twilio"] as const satisfies readonly WorkspaceNotificationProvider[];
const WORKFLOW_EVENT_ORIGIN = "workflow";
const WORKFLOW_TEST_EVENT_ORIGIN = "workflow_test";
const DEFAULT_MAX_ATTEMPTS = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_WORKFLOW_TRIGGERS: WorkflowTriggerInput[] = [
  {
    trigger_key: "trigger_1",
    event_action: "incident.created",
    resource_type: "incident",
    filters: [],
    entry_action_key: "condition_1",
  },
];
const DEFAULT_WORKFLOW_ACTIONS: WorkflowActionInput[] = [
  {
    action_key: "condition_1",
    type: "condition",
    config: {
      display_name: "Check incident priority",
      body: {
        field: "{{event.metadata.priority}}",
        operator: "equals",
        value: "P1",
      },
    },
    next_action_key: "action_1",
    failure_action_key: null,
  },
  {
    action_key: "action_1",
    type: "http_request",
    config: {
      display_name: "Call webhook",
      request: {
        method: "POST",
        url: "https://example.com/workflow",
      },
    },
    next_action_key: null,
    failure_action_key: null,
  },
];

type HttpActionConfig = {
  body?: unknown;
  headers?: Record<string, string>;
  method: (typeof HTTP_METHODS)[number];
  timeout_ms: number;
  url: string;
};

type WorkflowTemplateContext = {
  actionOutputs: Map<string, unknown>;
  event: WorkflowEventRecord;
};

type IncidentTargetConfig = {
  incident_id?: string;
};

type IncidentPriorityConfig = IncidentTargetConfig & {
  priority: IncidentPriority;
};

type ManualEscalationConfig = IncidentTargetConfig & {
  action: (typeof MANUAL_ESCALATION_ACTIONS)[number];
  force: boolean;
  reason?: string;
  step_order?: number;
  update_current_step: boolean;
};

type ServiceUpdateConfig = {
  service_id?: string;
  input: {
    description?: string | null;
    escalation_policy_id?: string | null;
    name?: string;
    team_id?: string | null;
  };
};

type ServiceCreateConfig = ServiceUpdateConfig["input"] & {
  name: string;
};

type ServiceDeleteConfig = {
  service_id: string;
};

type WebhookServiceTargetConfig = {
  service_id: string;
};

type WebhookEndpointTargetConfig = {
  endpoint_id: string;
};

type EscalationPolicyTargetConfig = {
  policy_id: string;
};

type OnCallScheduleTargetConfig = {
  schedule_id: string;
};

type OnCallOverrideTargetConfig = {
  override_id: string;
};

type NotificationProviderUpdateConfig = {
  input: UpdateWorkspaceNotificationProviderSettingRequest;
  provider: WorkspaceNotificationProvider;
};

type ConditionConfig = WorkflowTriggerFilter;

type ActionExecutionOutcome = {
  failed?: boolean;
  output: unknown;
};

type WorkflowRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  graphMetadata: unknown;
  runAsUserId: string;
  createdByUserId: string | null;
  triggers: WorkflowTriggerRecord[];
  actions: WorkflowActionRecord[];
  createdAt: Date;
  updatedAt: Date;
};

type WorkflowTriggerRecord = {
  id: string;
  workflowId: string;
  triggerKey: string;
  eventAction: string;
  resourceType: string | null;
  filters: unknown;
  entryActionKey: string | null;
  createdAt: Date;
};

type WorkflowActionRecord = {
  id: string;
  workflowId: string;
  actionOrder: number;
  actionKey: string;
  type: string;
  config: unknown;
  nextActionKey: string | null;
  failureActionKey: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type WorkflowEventRecord = {
  id: string;
  activityLogId: string | null;
  workspaceId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  metadata: unknown;
  origin: string;
  occurredAt: Date;
  processedAt: Date | null;
  createdAt: Date;
};

type WorkflowActionRunRecord = {
  id: string;
  workflowRunId: string;
  workflowActionId: string;
  actionOrder: number;
  type: string;
  status: string;
  attempt: number;
  errorMessage: string | null;
  output: unknown;
  startedAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type WorkflowRunRecord = {
  id: string;
  workflowId: string;
  workflowEventId: string;
  workspaceId: string;
  matchedTriggerId: string | null;
  entryActionKey: string | null;
  status: string;
  attempt: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
  event?: WorkflowEventRecord;
  actionRuns?: WorkflowActionRunRecord[];
  createdAt: Date;
  updatedAt: Date;
};

type ProcessorResult = {
  processed: number;
};

export const WORKFLOW_TRIGGER_CATALOG = [
  { action: "workspace.created", resource_type: "workspace", label: "Workspace created" },
  { action: "workspace_invite.accepted", resource_type: "workspace_invite", label: "Workspace invite accepted" },
  { action: "workspace_invite.created", resource_type: "workspace_invite", label: "Workspace invite created" },
  { action: "workspace_invite.declined", resource_type: "workspace_invite", label: "Workspace invite declined" },
  { action: "workspace_member.roles_updated", resource_type: "workspace", label: "Workspace member roles updated" },
  {
    action: "workspace_notification_provider_setting.updated",
    resource_type: "workspace_notification_provider_setting",
    label: "Notification provider setting updated",
  },
  { action: "service.created", resource_type: "service", label: "Service created" },
  { action: "service.updated", resource_type: "service", label: "Service updated" },
  { action: "service.deleted", resource_type: "service", label: "Service deleted" },
  { action: "webhook_endpoint.created", resource_type: "webhook_endpoint", label: "Webhook endpoint created" },
  { action: "webhook_endpoint.deleted", resource_type: "webhook_endpoint", label: "Webhook endpoint deleted" },
  {
    action: "webhook_endpoint.secret_rotated",
    resource_type: "webhook_endpoint",
    label: "Webhook endpoint secret rotated",
  },
  { action: "incident.created", resource_type: "incident", label: "Incident created" },
  { action: "incident.acknowledged", resource_type: "incident", label: "Incident acknowledged" },
  { action: "incident.priority_updated", resource_type: "incident", label: "Incident priority updated" },
  { action: "incident.resolved", resource_type: "incident", label: "Incident resolved" },
  { action: "escalation.manual_triggered", resource_type: "incident", label: "Manual escalation triggered" },
  { action: "escalation_policy.created", resource_type: "escalation_policy", label: "Escalation policy created" },
  { action: "escalation_policy.updated", resource_type: "escalation_policy", label: "Escalation policy updated" },
  { action: "escalation_policy.deleted", resource_type: "escalation_policy", label: "Escalation policy deleted" },
  { action: "on_call_schedule.created", resource_type: "on_call_schedule", label: "On-call schedule created" },
  { action: "on_call_schedule.updated", resource_type: "on_call_schedule", label: "On-call schedule updated" },
  { action: "on_call_schedule.deleted", resource_type: "on_call_schedule", label: "On-call schedule deleted" },
  { action: "on_call_override.created", resource_type: "on_call_override", label: "On-call override created" },
  { action: "on_call_override.deleted", resource_type: "on_call_override", label: "On-call override deleted" },
  { action: "notification.claimed", resource_type: "notification", label: "Notification claimed" },
  { action: "notification.attempt_timed_out", resource_type: "notification", label: "Notification attempt timed out" },
  { action: "notification.skipped", resource_type: "notification", label: "Notification skipped" },
  { action: "notification.skipped_after_ack", resource_type: "notification", label: "Notification skipped after ack" },
] as const satisfies readonly WorkflowTriggerCatalogItem[];

export class WorkflowService {
  private readonly escalationService: EscalationService;
  private readonly incidentService: IncidentService;
  private readonly onCallService: OnCallService;
  private readonly serviceCatalogService: ServiceCatalogService;
  private readonly workspaceService: WorkspaceService;

  constructor(private readonly db: PrismaClient) {
    this.escalationService = new EscalationService(db);
    this.incidentService = new IncidentService(db);
    this.onCallService = new OnCallService(db);
    this.serviceCatalogService = new ServiceCatalogService(db);
    this.workspaceService = new WorkspaceService(db);
  }

  listTriggerCatalog(): WorkflowTriggerCatalogItem[] {
    return [...WORKFLOW_TRIGGER_CATALOG];
  }

  async listWorkflows(
    query: WorkflowListQuery,
    actorUserId: string,
  ): Promise<PaginatedResponse<Workflow>> {
    const workspaceIds = query.workspace_id
      ? [await this.assertReadableWorkspace(query.workspace_id, actorUserId)]
      : await this.listReadableWorkspaceIds(actorUserId);

    const rows = await this.db.workflow.findMany({
      where: {
        workspaceId: {
          in: workspaceIds,
        },
        ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
      },
      include: workflowInclude,
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      ...(query.cursor
        ? {
            cursor: {
              id: query.cursor,
            },
            skip: 1,
          }
        : {}),
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map(mapWorkflow);

    return {
      items,
      next_cursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async getWorkflow(workflowId: string, actorUserId: string): Promise<Workflow> {
    const workflow = await this.db.workflow.findUnique({
      where: {
        id: workflowId,
      },
      include: workflowInclude,
    });

    if (!workflow) {
      throw new WorkflowError("workflow_not_found", "Workflow not found");
    }

    await this.assertReadableWorkspace(workflow.workspaceId, actorUserId);
    return mapWorkflow(workflow);
  }

  async createWorkflow(input: CreateWorkflowRequest, actorUserId: string): Promise<Workflow> {
    await this.workspaceService.assertWorkspacePermission(input.workspace_id, actorUserId, "project.manage");
    const runAsUserId = input.run_as_user_id ?? actorUserId;
    await this.assertRunAsMember(input.workspace_id, runAsUserId);
    const { actions, triggers } = normalizeWorkflowDefinition(
      input.triggers ?? DEFAULT_WORKFLOW_TRIGGERS,
      input.actions ?? DEFAULT_WORKFLOW_ACTIONS,
    );

    const workflow = await this.db.workflow.create({
      data: {
        workspaceId: input.workspace_id,
        name: input.name.trim(),
        description: input.description ?? null,
        enabled: input.enabled ?? false,
        graphMetadata: input.graph_metadata === undefined || input.graph_metadata === null
          ? Prisma.JsonNull
          : toJsonValue(input.graph_metadata),
        runAsUserId,
        createdByUserId: actorUserId,
        triggers: {
          create: triggers.map(toTriggerCreateInput),
        },
        actions: {
          create: actions.map((action, index) => toActionCreateInput(action, index)),
        },
      },
      include: workflowInclude,
    });

    return mapWorkflow(workflow);
  }

  async updateWorkflow(
    workflowId: string,
    input: UpdateWorkflowRequest,
    actorUserId: string,
  ): Promise<Workflow> {
    const existing = await this.db.workflow.findUnique({
      where: {
        id: workflowId,
      },
      include: workflowInclude,
    });

    if (!existing) {
      throw new WorkflowError("workflow_not_found", "Workflow not found");
    }

    await this.workspaceService.assertWorkspacePermission(existing.workspaceId, actorUserId, "project.manage");
    assertWorkflowIsUserManaged(existing.graphMetadata);
    if (input.run_as_user_id) {
      await this.assertRunAsMember(existing.workspaceId, input.run_as_user_id);
    }
    const shouldUpdateGraph = Boolean(input.actions || input.triggers);
    const normalizedDefinition = shouldUpdateGraph
      ? normalizeWorkflowDefinition(
          input.triggers ?? existing.triggers.map(workflowTriggerToInput),
          input.actions ?? existing.actions.map(workflowActionToInput),
        )
      : null;
    const actions = normalizedDefinition?.actions ?? null;
    const triggers = normalizedDefinition?.triggers ?? null;

    const workflow = await this.db.$transaction(async (tx) => {
      await tx.workflow.update({
        where: {
          id: workflowId,
        },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.graph_metadata !== undefined
            ? { graphMetadata: input.graph_metadata === null ? Prisma.JsonNull : toJsonValue(input.graph_metadata) }
            : {}),
          ...(input.run_as_user_id !== undefined ? { runAsUserId: input.run_as_user_id } : {}),
        },
      });

      if (triggers) {
        await tx.workflowTrigger.deleteMany({
          where: {
            workflowId,
          },
        });
        await tx.workflowTrigger.createMany({
          data: triggers.map((trigger) => ({
            workflowId,
            ...toTriggerCreateInput(trigger),
          })),
        });
      }

      if (actions) {
        await tx.workflowAction.deleteMany({
          where: {
            workflowId,
          },
        });
        await tx.workflowAction.createMany({
          data: actions.map((action, index) => ({
            workflowId,
            ...toActionCreateInput(action, index),
          })),
        });
      }

      return tx.workflow.findUniqueOrThrow({
        where: {
          id: workflowId,
        },
        include: workflowInclude,
      });
    });

    return mapWorkflow(workflow);
  }

  async deleteWorkflow(workflowId: string, actorUserId: string): Promise<Workflow> {
    const workflow = await this.db.workflow.findUnique({
      where: { id: workflowId },
      include: workflowInclude,
    });

    if (!workflow) {
      throw new WorkflowError("workflow_not_found", "Workflow not found");
    }

    await this.workspaceService.assertWorkspacePermission(workflow.workspaceId, actorUserId, "project.manage");

    assertWorkflowIsUserManaged(workflow.graphMetadata);

    await this.db.workflow.delete({ where: { id: workflowId } });
    return mapWorkflow(workflow);
  }

  async setWorkflowEnabled(workflowId: string, enabled: boolean, actorUserId: string): Promise<Workflow> {
    const workflow = await this.db.workflow.findUnique({
      where: {
        id: workflowId,
      },
      select: {
        graphMetadata: true,
        workspaceId: true,
      },
    });

    if (!workflow) {
      throw new WorkflowError("workflow_not_found", "Workflow not found");
    }

    await this.workspaceService.assertWorkspacePermission(workflow.workspaceId, actorUserId, "project.manage");
    assertWorkflowIsUserManaged(workflow.graphMetadata);

    const updated = await this.db.workflow.update({
      where: {
        id: workflowId,
      },
      data: {
        enabled,
      },
      include: workflowInclude,
    });

    return mapWorkflow(updated);
  }

  async listRuns(
    workflowId: string,
    query: WorkflowRunListQuery,
    actorUserId: string,
  ): Promise<PaginatedResponse<WorkflowRun>> {
    const workflow = await this.db.workflow.findUnique({
      where: {
        id: workflowId,
      },
      select: {
        workspaceId: true,
      },
    });

    if (!workflow) {
      throw new WorkflowError("workflow_not_found", "Workflow not found");
    }

    await this.assertReadableWorkspace(workflow.workspaceId, actorUserId);

    const rows = await this.db.workflowRun.findMany({
      where: {
        workflowId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: runInclude,
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      ...(query.cursor
        ? {
            cursor: {
              id: query.cursor,
            },
            skip: 1,
          }
        : {}),
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map(mapWorkflowRun);

    return {
      items,
      next_cursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async getRun(runId: string, actorUserId: string): Promise<WorkflowRun> {
    const run = await this.db.workflowRun.findUnique({
      where: {
        id: runId,
      },
      include: runInclude,
    });

    if (!run) {
      throw new WorkflowError("workflow_run_not_found", "Workflow run not found");
    }

    await this.assertReadableWorkspace(run.workspaceId, actorUserId);
    return mapWorkflowRun(run);
  }

  async testWorkflow(workflowId: string, input: WorkflowTestRunRequest, actorUserId: string): Promise<WorkflowRun> {
    const workflow = await this.db.workflow.findUnique({
      where: {
        id: workflowId,
      },
      include: workflowInclude,
    });

    if (!workflow) {
      throw new WorkflowError("workflow_not_found", "Workflow not found");
    }

    await this.workspaceService.assertWorkspacePermission(workflow.workspaceId, actorUserId, "project.manage");

    if (workflow.actions.length === 0) {
      throw new WorkflowError("workflow_action_invalid_config", "Workflow must have at least one action to test");
    }

    const trigger = input.trigger_key
      ? workflow.triggers.find((candidate) => candidate.triggerKey === input.trigger_key)
      : workflow.triggers[0];
    if (!trigger) {
      throw new WorkflowError("workflow_trigger_invalid_config", "Workflow test trigger not found");
    }

    if (input.actor_user_id) {
      await this.assertRunAsMember(workflow.workspaceId, input.actor_user_id);
    }
    if (!trigger.entryActionKey) {
      throw new WorkflowError("workflow_trigger_invalid_config", "Selected trigger is not connected to an entry action");
    }

    const now = new Date();
    const testEvent = await this.buildWorkflowTestEvent(workflow.workspaceId, trigger, input, actorUserId);
    const mappedTestEvent: WorkflowEvent = {
      id: "00000000-0000-4000-8000-000000000000",
      activity_log_id: null,
      action: trigger.eventAction,
      actor_user_id: testEvent.actorUserId,
      created_at: now.toISOString(),
      metadata: testEvent.metadata,
      occurred_at: now.toISOString(),
      origin: WORKFLOW_TEST_EVENT_ORIGIN,
      processed_at: now.toISOString(),
      resource_id: testEvent.resourceId,
      resource_type: testEvent.resourceType,
      workspace_id: workflow.workspaceId,
    };
    if (!matchesTrigger(mappedTestEvent, mapWorkflowTrigger(trigger))) {
      throw new WorkflowError(
        "workflow_trigger_invalid_config",
        "Selected resource state does not match this trigger's filters",
      );
    }

    const event = await this.db.workflowEvent.create({
      data: {
        action: trigger.eventAction,
        actorUserId: testEvent.actorUserId,
        metadata: toJsonValue(testEvent.metadata),
        occurredAt: now,
        origin: WORKFLOW_TEST_EVENT_ORIGIN,
        processedAt: now,
        resourceId: testEvent.resourceId,
        resourceType: testEvent.resourceType,
        workspaceId: workflow.workspaceId,
      },
    });
    const run = await this.db.workflowRun.create({
      data: {
        entryActionKey: trigger.entryActionKey,
        matchedTriggerId: trigger.id,
        workflowEventId: event.id,
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
      },
    });

    await this.executeRunById(run.id);
    return this.getRun(run.id, actorUserId);
  }

  private async buildWorkflowTestEvent(
    workspaceId: string,
    trigger: WorkflowTriggerRecord,
    input: WorkflowTestRunRequest,
    actorUserId: string,
  ): Promise<{
    actorUserId: string | null;
    metadata: Record<string, unknown>;
    resourceId: string | null;
    resourceType: ActivityResourceType;
  }> {
    const resourceType = (trigger.resourceType ?? inferResourceTypeFromAction(trigger.eventAction)) as ActivityResourceType;
    const overrideMetadata = isRecord(input.metadata) ? input.metadata : {};
    const actor = input.actor_user_id ?? actorUserId;

    if (!input.resource_id) {
      return {
        actorUserId: actor,
        metadata: {
          ...defaultWorkflowTestMetadata(trigger),
          ...overrideMetadata,
        },
        resourceId: null,
        resourceType,
      };
    }

    const resourceId = input.resource_id;
    switch (resourceType) {
      case "incident": {
        const incident = await this.db.incident.findFirst({
          where: {
            id: resourceId,
            workspaceId,
          },
        });
        if (!incident) {
          throw new WorkflowError("workflow_action_invalid_config", "Workflow test incident not found in this workspace");
        }

        return {
          actorUserId: actor,
          metadata: {
            acknowledged_by: incident.acknowledgedById,
            dedup_key: incident.dedupKey,
            priority: incident.priority,
            resolved_by: incident.resolvedById,
            service_id: incident.serviceId,
            severity: incident.severity,
            source: incident.source,
            status: incident.status,
            title: incident.title,
            ...overrideMetadata,
          },
          resourceId,
          resourceType,
        };
      }
      case "service": {
        const service = await this.db.service.findFirst({
          where: {
            id: resourceId,
            workspaceId,
          },
        });
        if (!service) {
          throw new WorkflowError("workflow_action_invalid_config", "Workflow test service not found in this workspace");
        }

        return {
          actorUserId: actor,
          metadata: {
            description: service.description,
            escalation_policy_id: service.escalationPolicyId,
            name: service.name,
            team_id: service.teamId,
            ...overrideMetadata,
          },
          resourceId,
          resourceType,
        };
      }
      case "webhook_endpoint": {
        const endpoint = await this.db.webhookEndpoint.findFirst({
          where: {
            id: resourceId,
            service: {
              workspaceId,
            },
          },
        });
        if (!endpoint) {
          throw new WorkflowError("workflow_action_invalid_config", "Workflow test webhook endpoint not found in this workspace");
        }

        return {
          actorUserId: actor,
          metadata: {
            disabled_at: endpoint.disabledAt?.toISOString() ?? null,
            name: endpoint.name,
            service_id: endpoint.serviceId,
            ...overrideMetadata,
          },
          resourceId,
          resourceType,
        };
      }
      case "on_call_schedule": {
        const schedule = await this.db.onCallSchedule.findFirst({
          where: {
            id: resourceId,
            workspaceId,
          },
        });
        if (!schedule) {
          throw new WorkflowError("workflow_action_invalid_config", "Workflow test on-call schedule not found in this workspace");
        }

        return {
          actorUserId: actor,
          metadata: {
            name: schedule.name,
            service_id: schedule.serviceId,
            team_id: schedule.teamId,
            timezone: schedule.timezone,
            ...overrideMetadata,
          },
          resourceId,
          resourceType,
        };
      }
      case "on_call_override": {
        const override = await this.db.onCallOverride.findFirst({
          where: {
            id: resourceId,
            schedule: {
              workspaceId,
            },
          },
        });
        if (!override) {
          throw new WorkflowError("workflow_action_invalid_config", "Workflow test on-call override not found in this workspace");
        }

        return {
          actorUserId: actor,
          metadata: {
            ends_at: override.endsAt.toISOString(),
            layer: override.layer,
            schedule_id: override.scheduleId,
            starts_at: override.startsAt.toISOString(),
            user_id: override.userId,
            ...overrideMetadata,
          },
          resourceId,
          resourceType,
        };
      }
      case "escalation_policy": {
        const policy = await this.db.escalationPolicy.findFirst({
          where: {
            id: resourceId,
            workspaceId,
          },
        });
        if (!policy) {
          throw new WorkflowError("workflow_action_invalid_config", "Workflow test escalation policy not found in this workspace");
        }

        return {
          actorUserId: actor,
          metadata: {
            name: policy.name,
            repeat_enabled: policy.repeatEnabled,
            repeat_interval_seconds: policy.repeatIntervalSeconds,
            repeat_limit: policy.repeatLimit,
            ...overrideMetadata,
          },
          resourceId,
          resourceType,
        };
      }
      case "workspace": {
        if (resourceId !== workspaceId) {
          throw new WorkflowError("workflow_action_invalid_config", "Workflow test workspace id must match the selected workspace");
        }

        return {
          actorUserId: actor,
          metadata: {
            ...defaultWorkflowTestMetadata(trigger),
            ...overrideMetadata,
          },
          resourceId,
          resourceType,
        };
      }
      default:
        return {
          actorUserId: actor,
          metadata: {
            ...defaultWorkflowTestMetadata(trigger),
            ...overrideMetadata,
          },
          resourceId,
          resourceType,
        };
    }
  }

  async processNextEvent(workerId: string): Promise<ProcessorResult> {
    const now = new Date();
    const staleLock = new Date(now.getTime() - 5 * 60 * 1000);
    const event = await this.db.workflowEvent.findFirst({
      where: {
        processedAt: null,
        origin: {
          not: WORKFLOW_EVENT_ORIGIN,
        },
        OR: [
          {
            lockedAt: null,
          },
          {
            lockedAt: {
              lte: staleLock,
            },
          },
        ],
      },
      orderBy: [
        {
          occurredAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    });

    if (!event) {
      return { processed: 0 };
    }

    const locked = await this.db.workflowEvent.update({
      where: {
        id: event.id,
      },
      data: {
        lockedAt: now,
        lockedBy: workerId,
      },
    });

    const workflows = await this.db.workflow.findMany({
      where: {
        workspaceId: locked.workspaceId,
        enabled: true,
        triggers: {
          some: {
            eventAction: locked.action,
          },
        },
      },
      include: workflowInclude,
      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    });
    const workflowEvent = mapWorkflowEvent(locked);
    const matchingWorkflowTriggers = workflows.flatMap((workflow) =>
      workflow.triggers
        .filter((trigger) => matchesTrigger(workflowEvent, mapWorkflowTrigger(trigger)))
        .map((trigger) => ({ trigger, workflow })),
    );

    for (const { trigger, workflow } of matchingWorkflowTriggers) {
      if (workflow.actions.length === 0) {
        continue;
      }

      const entryActionKey = trigger.entryActionKey;
      if (!entryActionKey) {
        continue;
      }

      await this.db.workflowRun
        .create({
          data: {
            entryActionKey,
            matchedTriggerId: trigger.id,
            workflowId: workflow.id,
            workflowEventId: locked.id,
            workspaceId: locked.workspaceId,
          },
        })
        .catch((error: unknown) => {
          if (isUniqueConstraintError(error)) {
            return null;
          }
          throw error;
        });
    }

    await this.db.workflowEvent.update({
      where: {
        id: locked.id,
      },
      data: {
        processedAt: new Date(),
      },
    });

    return { processed: 1 };
  }

  async executeNextDueRun(): Promise<ProcessorResult> {
    const now = new Date();
    const candidate = await this.db.workflowRun.findFirst({
      where: {
        status: {
          in: ["pending", "retrying"],
        },
        OR: [
          {
            nextRetryAt: null,
          },
          {
            nextRetryAt: {
              lte: now,
            },
          },
        ],
      },
      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
      include: {
        workflow: {
          include: {
            actions: {
              orderBy: {
                actionOrder: "asc",
              },
            },
          },
        },
        workflowEvent: true,
        actionRuns: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!candidate) {
      return { processed: 0 };
    }

    await this.executeRunById(candidate.id);
    return { processed: 1 };
  }

  private async executeRunById(runId: string): Promise<void> {
    const now = new Date();
    const run = await this.db.workflowRun.update({
      where: {
        id: runId,
      },
      data: {
        attempt: {
          increment: 1,
        },
        errorMessage: null,
        startedAt: now,
        status: "running",
      },
      include: {
        workflow: {
          include: {
            actions: {
              orderBy: {
                actionOrder: "asc",
              },
            },
          },
        },
        workflowEvent: true,
        actionRuns: true,
      },
    });

    const actions: WorkflowActionRecord[] = run.workflow.actions;
    const actionsByKey = new Map(actions.map((action) => [action.actionKey, action]));
    const actionRunByActionId = new Map<string, (typeof run.actionRuns)[number]>();
    for (const actionRun of run.actionRuns) {
      actionRunByActionId.set(actionRun.workflowActionId, actionRun);
    }
    const actionOutputs = new Map<string, unknown>();
    for (const actionRun of run.actionRuns) {
      const action = actions.find((candidate) => candidate.id === actionRun.workflowActionId);
      if (action?.actionKey && actionRun.status === "succeeded") {
        actionOutputs.set(action.actionKey, actionRun.output);
      }
    }
    const visitedActionKeys = new Set<string>();
    let currentAction = run.entryActionKey ? actionsByKey.get(run.entryActionKey) ?? null : actions[0] ?? null;

    if (!currentAction) {
      await this.markRunFailedOrRetrying(run.id, run.attempt, `Workflow entry action not found: ${run.entryActionKey ?? "first action"}`);
      return;
    }

    while (currentAction) {
      const action = currentAction;

      if (visitedActionKeys.has(action.actionKey)) {
        await this.markRunFailedOrRetrying(run.id, run.attempt, `Workflow action cycle detected at ${action.actionKey}`);
        return;
      }

      visitedActionKeys.add(action.actionKey);

      const completedActionRun = actionRunByActionId.get(action.id);
      if (completedActionRun?.status === "succeeded") {
        currentAction = resolveNextAction(action, actionsByKey, "success");
        continue;
      }
      if (completedActionRun?.status === "failed" && action.failureActionKey) {
        currentAction = resolveNextAction(action, actionsByKey, "failure");
        continue;
      }

      const actionStartedAt = new Date();
      try {
        const outcome = await this.executeAction(run.workflow.workspaceId, run.workflow.runAsUserId, action, run.workflowEvent, {
          actionOutputs,
          event: run.workflowEvent,
        });
        actionOutputs.set(action.actionKey, outcome.output);
        await this.db.workflowActionRun.create({
          data: {
            workflowRunId: run.id,
            workflowActionId: action.id,
            actionOrder: action.actionOrder,
            type: action.type,
            status: outcome.failed ? "failed" : "succeeded",
            attempt: run.attempt,
            output: toJsonValue(outcome.output),
            startedAt: actionStartedAt,
            completedAt: new Date(),
          },
        });
        currentAction = resolveNextAction(action, actionsByKey, outcome.failed ? "failure" : "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.db.workflowActionRun.create({
          data: {
            workflowRunId: run.id,
            workflowActionId: action.id,
            actionOrder: action.actionOrder,
            type: action.type,
            status: "failed",
            attempt: run.attempt,
            errorMessage: message,
            startedAt: actionStartedAt,
            completedAt: new Date(),
          },
        });
        const failureAction = resolveNextAction(action, actionsByKey, "failure");
        if (!failureAction) {
          await this.markRunFailedOrRetrying(run.id, run.attempt, message);
          return;
        }

        currentAction = failureAction;
      }
    }

    await this.db.workflowRun.update({
      where: {
        id: run.id,
      },
      data: {
        completedAt: new Date(),
        errorMessage: null,
        nextRetryAt: null,
        status: "succeeded",
      },
    });
  }

  private async executeAction(
    workspaceId: string,
    runAsUserId: string,
    action: WorkflowActionRecord,
    event: WorkflowEventRecord,
    templateContext: WorkflowTemplateContext,
  ): Promise<ActionExecutionOutcome> {
    const resolvedConfig = resolveTemplateValue(action.config, templateContext);

    switch (action.type) {
      case "condition": {
        const condition = parseConditionConfig(action.config);
        const leftValue = readConditionLeftValue(condition.field, event, templateContext);
        const resolvedValue = condition.operator === "exists" ? undefined : resolveTemplateValue(condition.value, templateContext);
        const matched = matchesConditionValue(leftValue, condition.operator, resolvedValue);
        return {
          failed: !matched,
          output: {
            condition: {
              ...condition,
              ...(condition.operator === "exists" ? {} : { value: resolvedValue }),
            },
            left_value: leftValue,
            matched,
          },
        };
      }
      case "http_request":
      case "notification_webhook":
        await this.assertRunAsPermission(workspaceId, runAsUserId, "project.manage");
        return {
          output: await this.executeHttpAction(resolvedConfig, event),
        };
      case "integration_webhook":
        await this.assertRunAsPermission(workspaceId, runAsUserId, "project.manage");
        return {
          output: await this.executeIntegrationWebhook(workspaceId, resolvedConfig, event, templateContext),
        };
      case "service_create": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "service.manage");
        const config = parseServiceCreateConfig(resolvedConfig);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.serviceCatalogService.createService({ ...config, workspace_id: workspaceId }),
          ),
        };
      }
      case "service_update": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "service.manage");
        const config = parseServiceUpdateConfig(resolvedConfig);
        const serviceId = config.service_id ?? (event.resourceType === "service" ? event.resourceId : null);
        if (!serviceId) {
          throw new WorkflowError("workflow_action_missing_target", "service_update requires service_id");
        }
        await this.assertServiceTarget(workspaceId, serviceId);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.serviceCatalogService.updateService(serviceId, config.input),
          ),
        };
      }
      case "service_delete": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "service.manage");
        const config = parseServiceDeleteConfig(resolvedConfig, event);
        await this.assertServiceTarget(workspaceId, config.service_id);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.serviceCatalogService.deleteService(config.service_id),
          ),
        };
      }
      case "webhook_endpoint_create": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "webhook.manage");
        const config = parseWebhookServiceTargetConfig(resolvedConfig, event);
        await this.assertServiceTarget(workspaceId, config.service_id);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.serviceCatalogService.createServiceWebhookEndpoint(config.service_id),
          ),
        };
      }
      case "webhook_endpoint_rotate_secret": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "webhook.manage");
        const config = parseWebhookEndpointTargetConfig(resolvedConfig, event);
        await this.assertWebhookEndpointTarget(workspaceId, config.endpoint_id);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.serviceCatalogService.rotateWebhookEndpointSecret(config.endpoint_id),
          ),
        };
      }
      case "webhook_endpoint_delete": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "webhook.manage");
        const config = parseWebhookEndpointTargetConfig(resolvedConfig, event);
        await this.assertWebhookEndpointTarget(workspaceId, config.endpoint_id);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.serviceCatalogService.deleteWebhookEndpoint(config.endpoint_id),
          ),
        };
      }
      case "incident_create": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "incident.create");
        const config = parseIncidentCreateConfig(resolvedConfig);
        await this.assertServiceTarget(workspaceId, config.service_id);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.incidentService.createManualIncident(config),
          ),
        };
      }
      case "incident_ack":
        await this.assertRunAsPermission(workspaceId, runAsUserId, "incident.respond");
        await this.assertIncidentTarget(workspaceId, resolveIncidentId(resolvedConfig, event));
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.incidentService.acknowledgeIncident(resolveIncidentId(resolvedConfig, event), runAsUserId),
          ),
        };
      case "incident_resolve":
        await this.assertRunAsPermission(workspaceId, runAsUserId, "incident.respond");
        await this.assertIncidentTarget(workspaceId, resolveIncidentId(resolvedConfig, event));
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.incidentService.resolveIncident(resolveIncidentId(resolvedConfig, event), runAsUserId),
          ),
        };
      case "incident_update_priority": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "incident.respond");
        const config = parseIncidentPriorityConfig(resolvedConfig);
        await this.assertIncidentTarget(workspaceId, resolveIncidentId(config, event));
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.incidentService.updateIncidentPriority(resolveIncidentId(config, event), config.priority, runAsUserId),
          ),
        };
      }
      case "incident_manual_escalation": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "incident.respond");
        const config = parseManualEscalationConfig(resolvedConfig);
        await this.assertIncidentTarget(workspaceId, resolveIncidentId(config, event));
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.escalationService.triggerManualEscalation(resolveIncidentId(config, event), config, runAsUserId),
          ),
        };
      }
      case "escalation_policy_create": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "escalation.manage");
        const config = parseEscalationPolicyCreateConfig(workspaceId, resolvedConfig);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.escalationService.createPolicy(config),
          ),
        };
      }
      case "escalation_policy_update": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "escalation.manage");
        const { input, policy_id: policyId } = parseEscalationPolicyUpdateConfig(resolvedConfig);
        await this.assertEscalationPolicyTarget(workspaceId, policyId);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.escalationService.updatePolicy(policyId, input),
          ),
        };
      }
      case "escalation_policy_delete": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "escalation.manage");
        const config = parseEscalationPolicyTargetConfig(resolvedConfig, event);
        await this.assertEscalationPolicyTarget(workspaceId, config.policy_id);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.escalationService.deletePolicy(config.policy_id),
          ),
        };
      }
      case "on_call_schedule_create": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "on_call.manage");
        const config = parseOnCallScheduleCreateConfig(workspaceId, resolvedConfig);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.onCallService.createSchedule(config),
          ),
        };
      }
      case "on_call_schedule_update": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "on_call.manage");
        const { input, schedule_id: scheduleId } = parseOnCallScheduleUpdateConfig(resolvedConfig);
        await this.assertOnCallScheduleTarget(workspaceId, scheduleId);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.onCallService.updateSchedule(scheduleId, input),
          ),
        };
      }
      case "on_call_schedule_delete": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "on_call.manage");
        const config = parseOnCallScheduleTargetConfig(resolvedConfig, event);
        await this.assertOnCallScheduleTarget(workspaceId, config.schedule_id);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.onCallService.deleteSchedule(config.schedule_id),
          ),
        };
      }
      case "on_call_override_create": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "on_call.manage");
        const config = parseOnCallOverrideCreateConfig(resolvedConfig);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.onCallService.createOverride(config),
          ),
        };
      }
      case "on_call_override_delete": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "on_call.manage");
        const config = parseOnCallOverrideTargetConfig(resolvedConfig, event);
        await this.assertOnCallOverrideTarget(workspaceId, config.override_id);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.onCallService.deleteOverride(config.override_id),
          ),
        };
      }
      case "notification_provider_update": {
        await this.assertRunAsPermission(workspaceId, runAsUserId, "notification.manage");
        const config = parseNotificationProviderUpdateConfig(resolvedConfig);
        return {
          output: await runWithActivityOrigin(WORKFLOW_EVENT_ORIGIN, () =>
            this.workspaceService.updateNotificationProviderSetting(workspaceId, config.provider, config.input, runAsUserId),
          ),
        };
      }
      default:
        throw new WorkflowError("workflow_action_not_allowed", `Unsupported workflow action: ${action.type}`);
    }
  }

  private async executeHttpAction(config: unknown, event: WorkflowEventRecord): Promise<unknown> {
    const parsed = parseHttpActionConfig(config);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), parsed.timeout_ms);

    try {
      const init: RequestInit = {
        method: parsed.method,
        headers: buildHttpActionHeaders(parsed.headers),
        signal: controller.signal,
      };

      if (parsed.method !== "GET") {
        init.body = JSON.stringify(parsed.body ?? { event: mapWorkflowEvent(event) });
      }

      const response = await fetch(parsed.url, {
        ...init,
      });
      const text = await response.text();

      if (!response.ok) {
        throw new WorkflowError("workflow_http_action_failed", `HTTP action failed with ${response.status}`, {
          body: text.slice(0, 1000),
          status: response.status,
        });
      }

      return {
        body: text.slice(0, 1000),
        status: response.status,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeIntegrationWebhook(
    workspaceId: string,
    config: unknown,
    event: WorkflowEventRecord,
    templateContext: WorkflowTemplateContext,
  ): Promise<unknown> {
    const target = structuredTarget(config);
    const type = requireString(target.integration_type, "integration_type");
    if (!["slack", "discord", "teams", "custom"].includes(type)) {
      throw new WorkflowError("workflow_action_invalid_config", "Unsupported webhook integration");
    }
    const serviceId = typeof target.service_id === "string" ? target.service_id : null;
    let stored: Record<string, unknown> = {};
    let enabled = false;
    if (serviceId) {
      const service = await this.db.service.findFirst({ where: { id: serviceId, workspaceId } });
      const root = isRecord(service?.webhookIntegrationConfig) ? service.webhookIntegrationConfig : {};
      stored = isRecord(root[type]) ? root[type] : {};
      enabled = stored.enabled === true && stored.routing_mode !== "inherit";
    } else {
      const eventServiceId = isRecord(event.metadata) && typeof event.metadata.service_id === "string"
        ? event.metadata.service_id
        : null;
      if (eventServiceId) {
        const service = await this.db.service.findFirst({ where: { id: eventServiceId, workspaceId } });
        const root = isRecord(service?.webhookIntegrationConfig) ? service.webhookIntegrationConfig : {};
        const serviceConfig = isRecord(root[type]) ? root[type] : {};
        if (serviceConfig.enabled === true && serviceConfig.routing_mode === "override") {
          return { skipped: true, reason: "service_override" };
        }
      }
      const integration = await this.db.workspaceWebhookIntegration.findUnique({
        where: { workspaceId_type: { workspaceId, type } },
      });
      stored = isRecord(integration?.config) ? integration.config : {};
      enabled = integration?.enabled === true;
    }
    if (!enabled || typeof stored.url !== "string") {
      throw new WorkflowError("workflow_action_missing_target", `${type} webhook integration is not configured or enabled`);
    }
    const body = structuredBody(config);
    const payload = body.payload ?? resolveTemplateValue(stored.default_body, templateContext) ?? { event: mapWorkflowEvent(event) };
    return this.executeHttpAction({
      request: { method: "POST", url: decryptProviderCredential(stored.url), timeout_ms: 10000 },
      headers: { "content-type": "application/json" },
      body: payload,
    }, event);
  }

  private async markRunFailedOrRetrying(runId: string, attempt: number, message: string): Promise<void> {
    const nextAttempt = attempt + 1;
    const canRetry = nextAttempt <= DEFAULT_MAX_ATTEMPTS;
    const nextRetryAt = canRetry ? new Date(Date.now() + retryDelayMs(attempt)) : null;

    await this.db.workflowRun.update({
      where: {
        id: runId,
      },
      data: {
        completedAt: canRetry ? null : new Date(),
        errorMessage: message,
        nextRetryAt,
        status: canRetry ? "retrying" : "failed",
      },
    });
  }

  private async assertServiceTarget(workspaceId: string, serviceId: string): Promise<void> {
    const exists = await this.db.service.findFirst({ where: { id: serviceId, workspaceId }, select: { id: true } });
    if (!exists) throw new WorkflowError("workflow_action_missing_target", "Workflow service target not found in this workspace");
  }

  private async assertWebhookEndpointTarget(workspaceId: string, endpointId: string): Promise<void> {
    const exists = await this.db.webhookEndpoint.findFirst({
      where: { id: endpointId, service: { workspaceId } },
      select: { id: true },
    });
    if (!exists) throw new WorkflowError("workflow_action_missing_target", "Workflow webhook endpoint target not found in this workspace");
  }

  private async assertIncidentTarget(workspaceId: string, incidentId: string): Promise<void> {
    const exists = await this.db.incident.findFirst({ where: { id: incidentId, workspaceId }, select: { id: true } });
    if (!exists) throw new WorkflowError("workflow_action_missing_target", "Workflow incident target not found in this workspace");
  }

  private async assertEscalationPolicyTarget(workspaceId: string, policyId: string): Promise<void> {
    const exists = await this.db.escalationPolicy.findFirst({ where: { id: policyId, workspaceId }, select: { id: true } });
    if (!exists) throw new WorkflowError("workflow_action_missing_target", "Workflow escalation policy target not found in this workspace");
  }

  private async assertOnCallScheduleTarget(workspaceId: string, scheduleId: string): Promise<void> {
    const exists = await this.db.onCallSchedule.findFirst({ where: { id: scheduleId, workspaceId }, select: { id: true } });
    if (!exists) throw new WorkflowError("workflow_action_missing_target", "Workflow on-call schedule target not found in this workspace");
  }

  private async assertOnCallOverrideTarget(workspaceId: string, overrideId: string): Promise<void> {
    const exists = await this.db.onCallOverride.findFirst({
      where: { id: overrideId, schedule: { workspaceId } },
      select: { id: true },
    });
    if (!exists) throw new WorkflowError("workflow_action_missing_target", "Workflow on-call override target not found in this workspace");
  }

  private async listReadableWorkspaceIds(actorUserId: string): Promise<string[]> {
    const memberships = await this.db.workspaceMember.findMany({
      where: {
        userId: actorUserId,
      },
      select: {
        workspaceId: true,
      },
    });

    return memberships.map((membership) => membership.workspaceId);
  }

  private async assertReadableWorkspace(workspaceId: string, actorUserId: string): Promise<string> {
    await this.workspaceService.assertMember(workspaceId, actorUserId);
    return workspaceId;
  }

  private async assertRunAsMember(workspaceId: string, runAsUserId: string): Promise<void> {
    await this.workspaceService.assertMember(workspaceId, runAsUserId);
  }

  private async assertRunAsPermission(
    workspaceId: string,
    runAsUserId: string,
    permission: WorkspacePermission,
  ): Promise<void> {
    await this.workspaceService.assertWorkspacePermission(workspaceId, runAsUserId, permission);
  }
}

function buildHttpActionHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const merged = new Map<string, { name: string; value: string }>();
  const setHeader = (name: string, value: string) => {
    merged.set(name.toLowerCase(), { name, value });
  };

  setHeader("Content-Type", "application/json");

  for (const [name, value] of Object.entries(headers ?? {})) {
    setHeader(name, value);
  }

  return Object.fromEntries(Array.from(merged.values()).map(({ name, value }) => [name, value]));
}

function defaultWorkflowTestMetadata(trigger: WorkflowTriggerRecord): Record<string, unknown> {
  if (trigger.eventAction.startsWith("incident.")) {
    return {
      priority: "P1",
      severity: "medium",
      source: WORKFLOW_TEST_EVENT_ORIGIN,
    };
  }

  if (trigger.eventAction.startsWith("service.")) {
    return {
      escalation_policy_id: null,
      source: WORKFLOW_TEST_EVENT_ORIGIN,
      team_id: null,
    };
  }

  return {
    source: WORKFLOW_TEST_EVENT_ORIGIN,
  };
}

function inferResourceTypeFromAction(action: string): ActivityResourceType {
  if (action.startsWith("incident.")) return "incident";
  if (action.startsWith("service.")) return "service";
  if (action.startsWith("webhook_endpoint.")) return "webhook_endpoint";
  if (action.startsWith("on_call_schedule.")) return "on_call_schedule";
  if (action.startsWith("on_call_override.")) return "on_call_override";
  if (action.startsWith("escalation_policy.")) return "escalation_policy";
  if (action.startsWith("workspace_invite.")) return "workspace_invite";
  if (action.startsWith("workspace_notification_provider_setting.")) return "workspace_notification_provider_setting";
  if (action.startsWith("notification.")) return "notification";

  return "workspace";
}

const workflowInclude = {
  triggers: {
    orderBy: {
      createdAt: "asc" as const,
    },
  },
  actions: {
    orderBy: {
      actionOrder: "asc" as const,
    },
  },
};

const runInclude = {
  workflowEvent: true,
  actionRuns: {
    orderBy: {
      actionOrder: "asc" as const,
    },
  },
};

export function matchesTrigger(event: WorkflowEvent, trigger: WorkflowTrigger): boolean {
  if (trigger.event_action !== event.action) {
    return false;
  }

  if (trigger.resource_type && trigger.resource_type !== event.resource_type) {
    return false;
  }

  return trigger.filters.every((filter) => matchesFilter(event, filter));
}

function matchesFilter(event: WorkflowEvent, filter: WorkflowTriggerFilter): boolean {
  const value = readFieldPath(event, filter.field);

  return matchesConditionValue(value, filter.operator, filter.value);
}

function matchesConditionValue(value: unknown, operator: WorkflowTriggerFilter["operator"], expected: unknown): boolean {
  switch (operator) {
    case "equals":
      return value === expected;
    case "in":
      return Array.isArray(expected) && expected.some((entry) => entry === value);
    case "exists":
      return value !== undefined && value !== null;
    default:
      return false;
  }
}

function readConditionLeftValue(field: string, event: WorkflowEventRecord, context: WorkflowTemplateContext): unknown {
  const trimmed = field.trim();
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    return resolveTemplateString(trimmed, context);
  }

  const mappedEvent = mapWorkflowEvent(event);
  if (trimmed === "event") return mappedEvent;
  if (trimmed.startsWith("event.")) {
    return readObjectPath(mappedEvent, trimmed.slice("event.".length));
  }

  return readFieldPath(mappedEvent, trimmed);
}

function readFieldPath(event: WorkflowEvent, path: string): unknown {
  if (path === "action") {
    return event.action;
  }
  if (path === "resource_type") {
    return event.resource_type;
  }
  if (path === "resource_id") {
    return event.resource_id;
  }
  if (path === "actor_user_id") {
    return event.actor_user_id;
  }
  if (!path.startsWith("metadata.")) {
    return undefined;
  }

  return path
    .slice("metadata.".length)
    .split(".")
    .reduce<unknown>((value, key) => {
      if (value && typeof value === "object" && key in value) {
        return (value as Record<string, unknown>)[key];
      }

      return undefined;
    }, event.metadata);
}

function resolveTemplateValue(value: unknown, context: WorkflowTemplateContext): unknown {
  if (typeof value === "string") {
    return resolveTemplateString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplateValue(entry, context));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveTemplateValue(entry, context)]),
    );
  }

  return value;
}

function resolveTemplateString(value: string, context: WorkflowTemplateContext): unknown {
  const wholeMatch = value.match(/^{{\s*([^}]+?)\s*}}$/);
  if (wholeMatch?.[1]) {
    const resolved = readTemplatePath(wholeMatch[1], context);
    return resolved === undefined ? value : resolved;
  }

  return value.replace(/{{\s*([^}]+?)\s*}}/g, (match, path: string) => {
    const resolved = readTemplatePath(path, context);
    return resolved === undefined || resolved === null ? match : String(resolved);
  });
}

function readTemplatePath(path: string, context: WorkflowTemplateContext): unknown {
  const normalizedPath = path.trim();
  if (normalizedPath === "event") return mapWorkflowEvent(context.event);
  if (normalizedPath.startsWith("event.")) {
    return readObjectPath(mapWorkflowEvent(context.event), normalizedPath.slice("event.".length));
  }
  if (!normalizedPath.startsWith("actions.")) return undefined;

  const [, actionKey, outputSegment, ...outputPath] = normalizedPath.split(".");
  if (!actionKey || outputSegment !== "output") return undefined;

  const output = context.actionOutputs.get(actionKey);
  return outputPath.length === 0 ? output : readObjectPath(output, outputPath.join("."));
}

function readObjectPath(value: unknown, path: string): unknown {
  if (!path) return value;

  return path.split(".").reduce<unknown>((current, key) => {
    if (isRecord(current) && key in current) return current[key];
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    return undefined;
  }, value);
}

function structuredTarget(config: unknown): Record<string, unknown> {
  const record = requireRecord(config, "workflow action config");
  return isRecord(record.target) ? record.target : record;
}

function structuredBody(config: unknown): Record<string, unknown> {
  const record = requireRecord(config, "workflow action config");
  return isRecord(record.body) ? record.body : record;
}

function structuredBodyOrInput(config: unknown): Record<string, unknown> {
  const record = requireRecord(config, "workflow action config");
  if (isRecord(record.body)) return record.body;
  if (isRecord(record.input)) return record.input;
  return record;
}

function parseHttpActionConfig(config: unknown): HttpActionConfig {
  const record = requireRecord(config, "http_request config");
  const legacyStructured = isRecord(record.body)
    && ("url" in record.body || "method" in record.body || "headers" in record.body || "timeout_ms" in record.body);
  const source = (isRecord(record.request) ? record.request : legacyStructured ? record.body : record) as Record<string, unknown>;
  const url = requireString(source.url, "url");

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new WorkflowError("workflow_action_invalid_config", "http_request url must be a valid http or https URL");
  }

  const method = source.method === undefined ? "POST" : requireString(source.method, "method").toUpperCase();
  if (!isHttpMethod(method)) {
    throw new WorkflowError("workflow_action_invalid_config", `Unsupported HTTP method: ${method}`);
  }

  const timeoutMs = source.timeout_ms === undefined ? 10000 : requireInteger(source.timeout_ms, "timeout_ms");
  if (timeoutMs < 1000 || timeoutMs > 30000) {
    throw new WorkflowError("workflow_action_invalid_config", "timeout_ms must be between 1000 and 30000");
  }

  return {
    ...(resolveHttpBody(record, source, legacyStructured) !== undefined ? { body: resolveHttpBody(record, source, legacyStructured) } : {}),
    ...(resolveHttpHeaders(record, source, legacyStructured) !== undefined ? { headers: parseStringRecord(resolveHttpHeaders(record, source, legacyStructured), "headers") } : {}),
    method,
    timeout_ms: timeoutMs,
    url,
  };
}

function resolveHttpBody(record: Record<string, unknown>, source: Record<string, unknown>, legacyStructured: boolean): unknown {
  if (legacyStructured) return source.body;
  if ("body" in record) return record.body;
  return source.body;
}

function resolveHttpHeaders(record: Record<string, unknown>, source: Record<string, unknown>, legacyStructured: boolean): unknown {
  if (legacyStructured) return source.headers;
  if ("headers" in record) return record.headers;
  return source.headers;
}

function normalizeHttpActionConfig(config: unknown): Record<string, unknown> {
  const parsed = parseHttpActionConfig(config);

  return cleanObject({
    ...(isRecord(config) && config.display_name !== undefined ? { display_name: config.display_name } : {}),
    request: {
      method: parsed.method,
      timeout_ms: parsed.timeout_ms,
      url: parsed.url,
    },
    headers: parsed.headers,
    body: parsed.body,
  });
}

function cleanObject(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function parseIncidentTargetConfig(config: unknown): IncidentTargetConfig {
  const record = structuredTarget(config);
  const incidentId = parseOptionalUuid(record.incident_id, "incident_id");

  return incidentId ? { incident_id: incidentId } : {};
}

function parseIncidentCreateConfig(config: unknown): CreateIncidentRequest {
  const body = structuredBody(config);
  const severity = body.severity === undefined ? "high" : requireString(body.severity, "severity");
  const priority = body.priority === undefined || body.priority === null ? undefined : requireString(body.priority, "priority");

  if (!isIncidentSeverity(severity)) {
    throw new WorkflowError("workflow_action_invalid_config", `Unsupported incident severity: ${severity}`);
  }
  if (priority !== undefined && !isIncidentPriority(priority)) {
    throw new WorkflowError("workflow_action_invalid_config", `Unsupported incident priority: ${priority}`);
  }

  return {
    service_id: requireUuid(body.service_id, "service_id"),
    title: requireString(body.title, "title"),
    ...(body.description !== undefined ? { description: body.description === null ? null : requireString(body.description, "description") } : {}),
    severity,
    ...(priority ? { priority } : {}),
    source: body.source === undefined ? "workflow" : requireString(body.source, "source"),
    ...(body.dedup_key !== undefined ? { dedup_key: body.dedup_key === null ? null : requireString(body.dedup_key, "dedup_key") } : {}),
  };
}

function parseIncidentPriorityConfig(config: unknown): IncidentPriorityConfig {
  const record = structuredBody(config);
  const target = parseIncidentTargetConfig(config);
  const priority = requireString(record.priority, "priority");

  if (!isIncidentPriority(priority)) {
    throw new WorkflowError("workflow_action_invalid_config", `Unsupported incident priority: ${priority}`);
  }

  return {
    ...target,
    priority,
  };
}

function parseManualEscalationConfig(config: unknown): ManualEscalationConfig {
  const record = structuredBody(config);
  const target = parseIncidentTargetConfig(config);
  const action = record.action === undefined ? "advance_to_next_step" : requireString(record.action, "action");

  if (!isManualEscalationAction(action)) {
    throw new WorkflowError("workflow_action_invalid_config", `Unsupported manual escalation action: ${action}`);
  }

  const stepOrder = record.step_order === undefined ? undefined : requireInteger(record.step_order, "step_order");
  if (action === "run_specific_step" && stepOrder === undefined) {
    throw new WorkflowError("workflow_action_invalid_config", "step_order is required for run_specific_step");
  }
  if (stepOrder !== undefined && stepOrder < 1) {
    throw new WorkflowError("workflow_action_invalid_config", "step_order must be greater than 0");
  }

  return {
    ...target,
    action,
    force: record.force === undefined ? false : requireBoolean(record.force, "force"),
    ...(record.reason !== undefined ? { reason: requireString(record.reason, "reason") } : {}),
    ...(stepOrder !== undefined ? { step_order: stepOrder } : {}),
    update_current_step: record.update_current_step === undefined
      ? false
      : requireBoolean(record.update_current_step, "update_current_step"),
  };
}

function parseServiceCreateConfig(config: unknown): ServiceCreateConfig {
  const body = structuredBodyOrInput(config);
  const name = requireString(body.name, "name").trim();
  if (!name) {
    throw new WorkflowError("workflow_action_invalid_config", "name must not be empty");
  }

  return {
    name,
    ...(body.description !== undefined ? { description: body.description === null ? null : requireString(body.description, "description") } : {}),
    ...(body.team_id !== undefined ? { team_id: body.team_id === null ? null : requireUuid(body.team_id, "team_id") } : {}),
    ...(body.escalation_policy_id !== undefined ? { escalation_policy_id: body.escalation_policy_id === null ? null : requireUuid(body.escalation_policy_id, "escalation_policy_id") } : {}),
  };
}

function parseServiceUpdateConfig(config: unknown): ServiceUpdateConfig {
  const target = structuredTarget(config);
  const input = structuredBodyOrInput(config);
  const serviceId = parseOptionalUuid(target.service_id, "service_id");
  const parsedInput: ServiceUpdateConfig["input"] = {};

  if (input.name !== undefined) {
    parsedInput.name = requireString(input.name, "input.name");
    if (parsedInput.name.trim().length === 0) {
      throw new WorkflowError("workflow_action_invalid_config", "input.name must not be empty");
    }
  }
  if (input.description !== undefined) {
    parsedInput.description = input.description === null ? null : requireString(input.description, "input.description");
  }
  if (input.team_id !== undefined) {
    parsedInput.team_id = input.team_id === null ? null : requireUuid(input.team_id, "input.team_id");
  }
  if (input.escalation_policy_id !== undefined) {
    parsedInput.escalation_policy_id = input.escalation_policy_id === null
      ? null
      : requireUuid(input.escalation_policy_id, "input.escalation_policy_id");
  }

  return {
    ...(serviceId ? { service_id: serviceId } : {}),
    input: parsedInput,
  };
}

function parseServiceDeleteConfig(config: unknown, event: WorkflowEventRecord): ServiceDeleteConfig {
  const target = structuredTarget(config);
  const serviceId = parseOptionalUuid(target.service_id, "service_id") ?? (event.resourceType === "service" ? event.resourceId : null);
  if (!serviceId) {
    throw new WorkflowError("workflow_action_missing_target", "service_delete requires service_id");
  }

  return { service_id: serviceId };
}

function parseWebhookServiceTargetConfig(config: unknown, event: WorkflowEventRecord): WebhookServiceTargetConfig {
  const target = structuredTarget(config);
  const serviceId = parseOptionalUuid(target.service_id, "service_id") ?? (event.resourceType === "service" ? event.resourceId : null);
  if (!serviceId) {
    throw new WorkflowError("workflow_action_missing_target", "webhook action requires service_id");
  }

  return { service_id: serviceId };
}

function parseWebhookEndpointTargetConfig(config: unknown, event: WorkflowEventRecord): WebhookEndpointTargetConfig {
  const target = structuredTarget(config);
  const endpointId = parseOptionalUuid(target.endpoint_id, "endpoint_id") ?? (event.resourceType === "webhook_endpoint" ? event.resourceId : null);
  if (!endpointId) {
    throw new WorkflowError("workflow_action_missing_target", "webhook endpoint action requires endpoint_id");
  }

  return { endpoint_id: endpointId };
}

function parseEscalationPolicyCreateConfig(workspaceId: string, config: unknown): CreateEscalationPolicyRequest {
  const body = structuredBody(config);
  return {
    workspace_id: workspaceId,
    name: requireString(body.name, "name"),
    repeat_enabled: body.repeat_enabled === undefined ? false : requireBoolean(body.repeat_enabled, "repeat_enabled"),
    ...(body.repeat_interval_seconds !== undefined ? { repeat_interval_seconds: body.repeat_interval_seconds === null ? null : requireInteger(body.repeat_interval_seconds, "repeat_interval_seconds") } : {}),
    ...(body.repeat_limit !== undefined ? { repeat_limit: body.repeat_limit === null ? null : requireInteger(body.repeat_limit, "repeat_limit") } : {}),
    steps: requireArray(body.steps, "steps") as CreateEscalationPolicyRequest["steps"],
  };
}

function parseEscalationPolicyUpdateConfig(config: unknown): { input: UpdateEscalationPolicyRequest; policy_id: string } {
  const target = structuredTarget(config);
  const body = structuredBody(config);
  const input: UpdateEscalationPolicyRequest = {};
  if (body.name !== undefined) input.name = requireString(body.name, "name");
  if (body.repeat_enabled !== undefined) input.repeat_enabled = requireBoolean(body.repeat_enabled, "repeat_enabled");
  if (body.repeat_interval_seconds !== undefined) input.repeat_interval_seconds = body.repeat_interval_seconds === null ? null : requireInteger(body.repeat_interval_seconds, "repeat_interval_seconds");
  if (body.repeat_limit !== undefined) input.repeat_limit = body.repeat_limit === null ? null : requireInteger(body.repeat_limit, "repeat_limit");
  if (body.steps !== undefined) input.steps = requireArray(body.steps, "steps") as UpdateEscalationPolicyRequest["steps"];

  return {
    input,
    policy_id: requireUuid(target.policy_id, "policy_id"),
  };
}

function parseEscalationPolicyTargetConfig(config: unknown, event: WorkflowEventRecord): EscalationPolicyTargetConfig {
  const target = structuredTarget(config);
  const policyId = parseOptionalUuid(target.policy_id, "policy_id") ?? (event.resourceType === "escalation_policy" ? event.resourceId : null);
  if (!policyId) {
    throw new WorkflowError("workflow_action_missing_target", "escalation policy action requires policy_id");
  }

  return { policy_id: policyId };
}

function parseOnCallScheduleCreateConfig(workspaceId: string, config: unknown): CreateOnCallScheduleRequest {
  const body = structuredBody(config);
  return {
    workspace_id: workspaceId,
    name: requireString(body.name, "name"),
    ...(body.team_id !== undefined ? { team_id: body.team_id === null ? null : requireUuid(body.team_id, "team_id") } : {}),
    ...(body.service_id !== undefined ? { service_id: body.service_id === null ? null : requireUuid(body.service_id, "service_id") } : {}),
    timezone: requireString(body.timezone, "timezone"),
    rotations: requireArray(body.rotations, "rotations") as CreateOnCallScheduleRequest["rotations"],
  };
}

function parseOnCallScheduleUpdateConfig(config: unknown): { input: UpdateOnCallScheduleRequest; schedule_id: string } {
  const target = structuredTarget(config);
  const body = structuredBody(config);
  const input: UpdateOnCallScheduleRequest = {};
  if (body.name !== undefined) input.name = requireString(body.name, "name");
  if (body.team_id !== undefined) input.team_id = body.team_id === null ? null : requireUuid(body.team_id, "team_id");
  if (body.service_id !== undefined) input.service_id = body.service_id === null ? null : requireUuid(body.service_id, "service_id");
  if (body.timezone !== undefined) input.timezone = requireString(body.timezone, "timezone");
  if (body.rotations !== undefined) input.rotations = requireArray(body.rotations, "rotations") as UpdateOnCallScheduleRequest["rotations"];

  return {
    input,
    schedule_id: requireUuid(target.schedule_id, "schedule_id"),
  };
}

function parseOnCallScheduleTargetConfig(config: unknown, event: WorkflowEventRecord): OnCallScheduleTargetConfig {
  const target = structuredTarget(config);
  const scheduleId = parseOptionalUuid(target.schedule_id, "schedule_id") ?? (event.resourceType === "on_call_schedule" ? event.resourceId : null);
  if (!scheduleId) {
    throw new WorkflowError("workflow_action_missing_target", "on-call schedule action requires schedule_id");
  }

  return { schedule_id: scheduleId };
}

function parseOnCallOverrideCreateConfig(config: unknown): CreateOnCallOverrideRequest {
  const body = structuredBody(config);
  const layer = requireString(body.layer, "layer");
  if (layer !== "primary" && layer !== "secondary") {
    throw new WorkflowError("workflow_action_invalid_config", "layer must be primary or secondary");
  }

  return {
    schedule_id: requireUuid(body.schedule_id, "schedule_id"),
    user_id: requireUuid(body.user_id, "user_id"),
    layer,
    starts_at: requireString(body.starts_at, "starts_at"),
    ends_at: requireString(body.ends_at, "ends_at"),
  };
}

function parseOnCallOverrideTargetConfig(config: unknown, event: WorkflowEventRecord): OnCallOverrideTargetConfig {
  const target = structuredTarget(config);
  const overrideId = parseOptionalUuid(target.override_id, "override_id") ?? (event.resourceType === "on_call_override" ? event.resourceId : null);
  if (!overrideId) {
    throw new WorkflowError("workflow_action_missing_target", "on-call override action requires override_id");
  }

  return { override_id: overrideId };
}

function parseNotificationProviderUpdateConfig(config: unknown): NotificationProviderUpdateConfig {
  const target = structuredTarget(config);
  const body = structuredBody(config);
  const provider = requireString(target.provider, "provider");
  if (!isNotificationProvider(provider)) {
    throw new WorkflowError("workflow_action_invalid_config", `Unsupported notification provider: ${provider}`);
  }

  return {
    input: body as UpdateWorkspaceNotificationProviderSettingRequest,
    provider,
  };
}

function parseTargetOnly(config: unknown, keys: string[]): Record<string, unknown> {
  const target = structuredTarget(config);
  const parsed: Record<string, unknown> = {};

  for (const key of keys) {
    if (target[key] !== undefined) {
      parsed[key] = key.endsWith("_id") ? parseOptionalUuid(target[key], key) : target[key];
    }
  }

  return parsed;
}

function omitWorkspaceId<T extends { workspace_id: string }>(input: T): Omit<T, "workspace_id"> {
  const { workspace_id: _workspaceId, ...rest } = input;
  return rest;
}

function parseConditionConfig(config: unknown): ConditionConfig {
  const record = structuredBody(config);
  const field = requireString(record.field, "field");
  const operator = requireString(record.operator, "operator");

  if (operator !== "equals" && operator !== "in" && operator !== "exists") {
    throw new WorkflowError("workflow_action_invalid_config", `Unsupported condition operator: ${operator}`);
  }

  if ((operator === "equals" || operator === "in") && record.value === undefined) {
    throw new WorkflowError("workflow_action_invalid_config", `${operator} condition requires value`);
  }

  return {
    field,
    operator,
    ...(operator === "exists" ? {} : { value: record.value }),
  };
}

function workflowTriggerToInput(trigger: WorkflowTriggerRecord): WorkflowTriggerInput {
  return {
    trigger_key: trigger.triggerKey,
    event_action: trigger.eventAction,
    resource_type: (trigger.resourceType as ActivityResourceType | null) ?? null,
    filters: Array.isArray(trigger.filters) ? (trigger.filters as WorkflowTriggerFilter[]) : [],
    entry_action_key: trigger.entryActionKey,
  };
}

function workflowActionToInput(action: WorkflowActionRecord): WorkflowActionInput {
  return {
    action_key: action.actionKey,
    type: action.type as WorkflowActionInput["type"],
    config: isRecord(action.config) ? action.config : {},
    next_action_key: action.nextActionKey,
    failure_action_key: action.failureActionKey,
  };
}

export function normalizeWorkflowDefinition(
  triggers: WorkflowTriggerInput[],
  actions: WorkflowActionInput[],
) {
  const normalizedActions = normalizeActionInputs(actions);
  const normalizedTriggers = normalizeTriggerInputs(triggers, normalizedActions);
  assertValidWorkflowGraph(normalizedActions, normalizedTriggers);

  return {
    actions: normalizedActions,
    triggers: normalizedTriggers,
  };
}

function normalizeTriggerInputs(
  triggers: WorkflowTriggerInput[],
  actions: WorkflowActionInput[],
): WorkflowTriggerInput[] {
  const actionKeys = new Set(actions.map((action) => action.action_key).filter(Boolean));
  const triggerKeys = new Set<string>();

  return triggers.map((trigger, index) => {
    const triggerKey = trigger.trigger_key?.trim() || `trigger_${index + 1}`;
    const entryActionKey = trigger.entry_action_key?.trim() || null;

    if (triggerKeys.has(triggerKey)) {
      throw new WorkflowError("workflow_action_invalid_graph", `Duplicate workflow trigger_key: ${triggerKey}`);
    }
    triggerKeys.add(triggerKey);

    if (entryActionKey && !actionKeys.has(entryActionKey)) {
      throw new WorkflowError("workflow_action_invalid_graph", `Workflow trigger entry points to missing action_key: ${entryActionKey}`);
    }

    for (const filter of trigger.filters) {
      if ((filter.operator === "equals" || filter.operator === "in") && filter.value === undefined) {
        throw new WorkflowError("workflow_filter_invalid", `${filter.operator} filter requires value`);
      }
    }

    return {
      trigger_key: triggerKey,
      event_action: trigger.event_action.trim(),
      resource_type: trigger.resource_type ?? null,
      filters: trigger.filters,
      entry_action_key: entryActionKey,
    };
  });
}

function normalizeActionInputs(actions: WorkflowActionInput[]): WorkflowActionInput[] {
  const actionKeys = actions.map((action, index) => action.action_key?.trim() || `action_${index + 1}`);
  const normalized = actions.map((action, index) => {
    const actionKey = actionKeys[index] ?? `action_${index + 1}`;
    const edgeFields = {
      action_key: actionKey,
      failure_action_key: action.failure_action_key?.trim() || null,
      next_action_key: action.next_action_key === undefined
        ? actionKeys[index + 1] ?? null
        : action.next_action_key?.trim() || null,
    };

    switch (action.type) {
      case "condition":
        return {
          ...action,
          ...edgeFields,
          config: parseConditionConfig(action.config),
        };
      case "http_request":
      case "notification_webhook":
        return {
          ...action,
          ...edgeFields,
          config: normalizeHttpActionConfig(action.config),
        };
      case "integration_webhook": {
        const target = structuredTarget(action.config);
        const integrationType = requireString(target.integration_type, "integration_type");
        if (!["slack", "discord", "teams", "custom"].includes(integrationType)) {
          throw new WorkflowError("workflow_action_invalid_config", "Unsupported webhook integration");
        }
        const body = structuredBody(action.config);
        return {
          ...action,
          ...edgeFields,
          config: cleanObject({
            ...(isRecord(action.config) && action.config.display_name !== undefined ? { display_name: action.config.display_name } : {}),
            target: {
              integration_type: integrationType,
              ...(typeof target.service_id === "string" ? { service_id: target.service_id } : {}),
            },
            ...(body.payload !== undefined ? { body: { payload: body.payload } } : {}),
          }),
        };
      }
      case "service_create":
        return {
          ...action,
          ...edgeFields,
          config: { body: parseServiceCreateConfig(action.config) },
        };
      case "service_update":
        return {
          ...action,
          ...edgeFields,
          config: {
            body: parseServiceUpdateConfig(action.config).input,
            target: parseTargetOnly(action.config, ["service_id"]),
          },
        };
      case "service_delete":
        return {
          ...action,
          ...edgeFields,
          config: { target: parseTargetOnly(action.config, ["service_id"]) },
        };
      case "webhook_endpoint_create":
        return {
          ...action,
          ...edgeFields,
          config: { target: parseTargetOnly(action.config, ["service_id"]) },
        };
      case "webhook_endpoint_rotate_secret":
      case "webhook_endpoint_delete":
        return {
          ...action,
          ...edgeFields,
          config: { target: parseTargetOnly(action.config, ["endpoint_id"]) },
        };
      case "incident_create":
        return {
          ...action,
          ...edgeFields,
          config: { body: parseIncidentCreateConfig(action.config) },
        };
      case "incident_ack":
      case "incident_resolve":
        return {
          ...action,
          ...edgeFields,
          config: { target: parseTargetOnly(action.config, ["incident_id"]) },
        };
      case "incident_update_priority":
        return {
          ...action,
          ...edgeFields,
          config: {
            body: { priority: parseIncidentPriorityConfig(action.config).priority },
            target: parseTargetOnly(action.config, ["incident_id"]),
          },
        };
      case "incident_manual_escalation":
        {
          const config = parseManualEscalationConfig(action.config);
          const { incident_id: _incidentId, ...body } = config;
          return {
            ...action,
            ...edgeFields,
            config: {
              body,
              target: parseTargetOnly(action.config, ["incident_id"]),
            },
          };
        }
      case "escalation_policy_create":
        return {
          ...action,
          ...edgeFields,
          config: { body: omitWorkspaceId(parseEscalationPolicyCreateConfig("__WORKSPACE_ID_TEMPLATE__", action.config)) },
        };
      case "escalation_policy_update":
        {
          const config = parseEscalationPolicyUpdateConfig(action.config);
          return {
            ...action,
            ...edgeFields,
            config: { body: config.input, target: { policy_id: config.policy_id } },
          };
        }
      case "escalation_policy_delete":
        return {
          ...action,
          ...edgeFields,
          config: { target: parseTargetOnly(action.config, ["policy_id"]) },
        };
      case "on_call_schedule_create":
        return {
          ...action,
          ...edgeFields,
          config: { body: omitWorkspaceId(parseOnCallScheduleCreateConfig("__WORKSPACE_ID_TEMPLATE__", action.config)) },
        };
      case "on_call_schedule_update":
        {
          const config = parseOnCallScheduleUpdateConfig(action.config);
          return {
            ...action,
            ...edgeFields,
            config: { body: config.input, target: { schedule_id: config.schedule_id } },
          };
        }
      case "on_call_schedule_delete":
        return {
          ...action,
          ...edgeFields,
          config: { target: parseTargetOnly(action.config, ["schedule_id"]) },
        };
      case "on_call_override_create":
        return {
          ...action,
          ...edgeFields,
          config: { body: parseOnCallOverrideCreateConfig(action.config) },
        };
      case "on_call_override_delete":
        return {
          ...action,
          ...edgeFields,
          config: { target: parseTargetOnly(action.config, ["override_id"]) },
        };
      case "notification_provider_update":
        {
          const config = parseNotificationProviderUpdateConfig(action.config);
          return {
            ...action,
            ...edgeFields,
            config: { body: config.input, target: { provider: config.provider } },
          };
        }
      default:
        throw new WorkflowError("workflow_action_not_allowed", `Unsupported workflow action: ${action.type}`);
    }
  });

  return normalized;
}

function toTriggerCreateInput(trigger: WorkflowTriggerInput) {
  return {
    triggerKey: trigger.trigger_key ?? "",
    eventAction: trigger.event_action,
    resourceType: trigger.resource_type ?? null,
    filters: trigger.filters.length > 0 ? toJsonValue(trigger.filters) : Prisma.JsonNull,
    entryActionKey: trigger.entry_action_key ?? null,
  };
}

function toActionCreateInput(action: WorkflowActionInput, index: number) {
  return {
    actionOrder: index + 1,
    actionKey: action.action_key ?? `action_${index + 1}`,
    type: action.type,
    config: toJsonValue(action.config),
    nextActionKey: action.next_action_key ?? null,
    failureActionKey: action.failure_action_key ?? null,
  };
}

function assertValidWorkflowGraph(actions: WorkflowActionInput[], triggers: WorkflowTriggerInput[]) {
  const keys = new Set<string>();

  for (const action of actions) {
    const actionKey = action.action_key;

    if (!actionKey) {
      throw new WorkflowError("workflow_action_invalid_graph", "Every workflow action requires action_key");
    }

    if (keys.has(actionKey)) {
      throw new WorkflowError("workflow_action_invalid_graph", `Duplicate workflow action_key: ${actionKey}`);
    }

    keys.add(actionKey);
  }

  for (const action of actions) {
    for (const edgeKey of [action.next_action_key, action.failure_action_key]) {
      if (edgeKey && !keys.has(edgeKey)) {
        throw new WorkflowError("workflow_action_invalid_graph", `Workflow action edge points to missing action_key: ${edgeKey}`);
      }
    }
  }

  const reachableKeys = new Set<string>();
  const visitingKeys = new Set<string>();

  function visit(actionKey: string) {
    if (visitingKeys.has(actionKey)) {
      throw new WorkflowError("workflow_action_invalid_graph", `Workflow action cycle detected at ${actionKey}`);
    }
    if (reachableKeys.has(actionKey)) {
      return;
    }

    const action = actions.find((candidate) => candidate.action_key === actionKey);
    if (!action) {
      throw new WorkflowError("workflow_action_invalid_graph", `Workflow entry points to missing action_key: ${actionKey}`);
    }

    visitingKeys.add(actionKey);
    reachableKeys.add(actionKey);

    for (const edgeKey of [action.next_action_key, action.failure_action_key]) {
      if (edgeKey) {
        visit(edgeKey);
      }
    }

    visitingKeys.delete(actionKey);
  }

  for (const trigger of triggers) {
    if (trigger.entry_action_key) {
      visit(trigger.entry_action_key);
    }
  }
}

function resolveNextAction(
  action: WorkflowActionRecord,
  actionsByKey: Map<string, WorkflowActionRecord>,
  edge: "failure" | "success",
): WorkflowActionRecord | null {
  const edgeKey = edge === "failure" ? action.failureActionKey : action.nextActionKey;

  return edgeKey ? actionsByKey.get(edgeKey) ?? null : null;
}

function assertWorkflowIsUserManaged(graphMetadata: unknown) {
  if (isRecord(graphMetadata) && graphMetadata.managed_kind === MANAGED_WEBHOOK_WORKFLOW_KIND) {
    throw new WorkflowError(
      "workflow_managed_by_integration",
      "This workflow is managed by a webhook integration. Update or disconnect that integration instead.",
    );
  }
}

function mapWorkflow(workflow: WorkflowRecord): Workflow {
  return {
    id: workflow.id,
    workspace_id: workflow.workspaceId,
    name: workflow.name,
    description: workflow.description,
    enabled: workflow.enabled,
    graph_metadata: isRecord(workflow.graphMetadata) ? workflow.graphMetadata : null,
    run_as_user_id: workflow.runAsUserId,
    created_by_user_id: workflow.createdByUserId,
    triggers: workflow.triggers.map(mapWorkflowTrigger),
    actions: workflow.actions.map(mapWorkflowAction),
    created_at: workflow.createdAt.toISOString(),
    updated_at: workflow.updatedAt.toISOString(),
  };
}

function mapWorkflowTrigger(trigger: WorkflowTriggerRecord): WorkflowTrigger {
  return {
    id: trigger.id,
    workflow_id: trigger.workflowId,
    trigger_key: trigger.triggerKey,
    event_action: trigger.eventAction,
    resource_type: (trigger.resourceType as ActivityResourceType | null) ?? null,
    filters: Array.isArray(trigger.filters) ? (trigger.filters as WorkflowTriggerFilter[]) : [],
    entry_action_key: trigger.entryActionKey,
    created_at: trigger.createdAt.toISOString(),
  };
}

function mapWorkflowAction(action: WorkflowActionRecord): WorkflowAction {
  return {
    id: action.id,
    workflow_id: action.workflowId,
    action_order: action.actionOrder,
    action_key: action.actionKey,
    type: action.type as WorkflowAction["type"],
    config: isRecord(action.config) ? action.config : {},
    next_action_key: action.nextActionKey,
    failure_action_key: action.failureActionKey,
    created_at: action.createdAt.toISOString(),
    updated_at: action.updatedAt.toISOString(),
  };
}

function mapWorkflowEvent(event: WorkflowEventRecord): WorkflowEvent {
  return {
    id: event.id,
    activity_log_id: event.activityLogId,
    workspace_id: event.workspaceId,
    action: event.action,
    resource_type: event.resourceType as ActivityResourceType,
    resource_id: event.resourceId,
    actor_user_id: event.actorUserId,
    metadata: event.metadata ?? null,
    origin: event.origin,
    occurred_at: event.occurredAt.toISOString(),
    processed_at: event.processedAt?.toISOString() ?? null,
    created_at: event.createdAt.toISOString(),
  };
}

function mapWorkflowRun(run: WorkflowRunRecord): WorkflowRun {
  return {
    id: run.id,
    workflow_id: run.workflowId,
    workflow_event_id: run.workflowEventId,
    workspace_id: run.workspaceId,
    matched_trigger_id: run.matchedTriggerId,
    entry_action_key: run.entryActionKey,
    status: run.status as WorkflowRun["status"],
    attempt: run.attempt,
    error_message: run.errorMessage,
    started_at: run.startedAt?.toISOString() ?? null,
    completed_at: run.completedAt?.toISOString() ?? null,
    next_retry_at: run.nextRetryAt?.toISOString() ?? null,
    event: run.event ? mapWorkflowEvent(run.event) : undefined,
    action_runs: run.actionRuns?.map(mapWorkflowActionRun),
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
  };
}

function mapWorkflowActionRun(actionRun: WorkflowActionRunRecord): WorkflowActionRun {
  return {
    id: actionRun.id,
    workflow_run_id: actionRun.workflowRunId,
    workflow_action_id: actionRun.workflowActionId,
    action_order: actionRun.actionOrder,
    type: actionRun.type as WorkflowActionRun["type"],
    status: actionRun.status as WorkflowActionRun["status"],
    attempt: actionRun.attempt,
    error_message: actionRun.errorMessage,
    output: actionRun.output ?? null,
    started_at: actionRun.startedAt?.toISOString() ?? null,
    completed_at: actionRun.completedAt?.toISOString() ?? null,
    next_retry_at: actionRun.nextRetryAt?.toISOString() ?? null,
    created_at: actionRun.createdAt.toISOString(),
    updated_at: actionRun.updatedAt.toISOString(),
  };
}

function resolveIncidentId(config: unknown, event: WorkflowEventRecord): string {
  const parsed = parseIncidentTargetConfig(config);
  const incidentId = parsed.incident_id ?? (event.resourceType === "incident" ? event.resourceId : null);

  if (!incidentId) {
    throw new WorkflowError("workflow_action_missing_target", "Incident action requires incident_id");
  }

  return incidentId;
}

function retryDelayMs(attempt: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? null) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new WorkflowError("workflow_action_invalid_config", `${label} must be an object`);
  }

  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new WorkflowError("workflow_action_invalid_config", `${label} must be a string`);
  }

  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new WorkflowError("workflow_action_invalid_config", `${label} must be a boolean`);
  }

  return value;
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new WorkflowError("workflow_action_invalid_config", `${label} must be an integer`);
  }

  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new WorkflowError("workflow_action_invalid_config", `${label} must be an array`);
  }

  return value;
}

function requireUuid(value: unknown, label: string): string {
  const uuid = requireString(value, label);

  if (isTemplateString(uuid)) {
    return uuid;
  }

  if (!UUID_PATTERN.test(uuid)) {
    throw new WorkflowError("workflow_action_invalid_config", `${label} must be a UUID`);
  }

  return uuid;
}

function parseOptionalUuid(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireUuid(value, label);
}

function parseStringRecord(value: unknown, label: string): Record<string, string> {
  const record = requireRecord(value, label);
  const parsed: Record<string, string> = {};

  for (const [key, entry] of Object.entries(record)) {
    parsed[key] = requireString(entry, `${label}.${key}`);
  }

  return parsed;
}

function isTemplateString(value: string): boolean {
  return /{{\s*[^}]+?\s*}}/.test(value);
}

function isHttpMethod(value: string): value is (typeof HTTP_METHODS)[number] {
  return HTTP_METHODS.some((method) => method === value);
}

function isIncidentPriority(value: string): value is IncidentPriority {
  return INCIDENT_PRIORITIES.some((priority) => priority === value);
}

function isIncidentSeverity(value: string): value is IncidentSeverity {
  return INCIDENT_SEVERITIES.some((severity) => severity === value);
}

function isManualEscalationAction(value: string): value is (typeof MANUAL_ESCALATION_ACTIONS)[number] {
  return MANUAL_ESCALATION_ACTIONS.some((action) => action === value);
}

function isNotificationProvider(value: string): value is WorkspaceNotificationProvider {
  return NOTIFICATION_PROVIDERS.some((provider) => provider === value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
