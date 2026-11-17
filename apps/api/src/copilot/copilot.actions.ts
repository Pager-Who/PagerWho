import {
  CopilotActionSchema,
  CopilotExecuteRequestSchema,
  CreateEscalationPolicyRequestSchema,
  CreateOnCallScheduleRequestSchema,
  CreateServiceRequestSchema,
  CreateWebhookEndpointRequestSchema,
  UpdateEscalationPolicyRequestSchema,
  UpdateOnCallScheduleRequestSchema,
  UpdateServiceRequestSchema,
  UpdateWorkspaceNotificationProviderSettingRequestSchema,
  type CopilotAction,
  type CopilotExecuteRequest,
  type CopilotExecuteResponse,
  type CopilotExecutionResult,
  type CopilotLocale,
  type CreateServiceRequest,
  type WorkspacePermission,
} from "@im/contracts";
import {
  EscalationService,
  OnCallService,
  ServiceCatalogService,
  WorkspaceService,
} from "@im/backend-core";
import { prisma } from "@im/db";

import { normalizeCopilotLocale } from "./copilot.locale";

const serviceCatalogService = new ServiceCatalogService(prisma, {
  ...(process.env.WEBHOOK_PUBLIC_BASE_URL ? { baseUrl: process.env.WEBHOOK_PUBLIC_BASE_URL } : {}),
  ...(process.env.WEBHOOK_SECRET_PEPPER ? { secretPepper: process.env.WEBHOOK_SECRET_PEPPER } : {}),
});
const escalationService = new EscalationService(prisma);
const onCallService = new OnCallService(prisma);
const workspaceService = new WorkspaceService(prisma);

type CreatedActionRef = {
  entityId: string;
  entityType: string;
};

export async function executeCopilotProposal(
  request: CopilotExecuteRequest,
  actorUserId: string,
  locale: CopilotLocale | undefined = request.locale,
): Promise<CopilotExecuteResponse> {
  const normalizedLocale = normalizeCopilotLocale(locale);

  const parsedRequest = CopilotExecuteRequestSchema.parse(request);
  const refs = new Map<string, CreatedActionRef>();
  const results: CopilotExecutionResult[] = [];

  for (const rawAction of parsedRequest.proposal.actions) {
    const action = CopilotActionSchema.parse(rawAction);

    try {
      const result = await executeAction(action, actorUserId, refs, normalizedLocale);
      results.push(result);

      if (result.status === "succeeded" && result.entity_id && result.entity_type) {
        refs.set(action.id, {
          entityId: result.entity_id,
          entityType: result.entity_type,
        });
      }
    } catch (error) {
      results.push({
        action_id: action.id,
        label: action.label,
        message: formatUnknownError(error),
        status: "failed",
        type: action.type,
      });
    }
  }

  const succeededCount = results.filter((result) => result.status === "succeeded").length;
  const failedCount = results.filter((result) => result.status === "failed").length;

  return {
    answer: failedCount > 0
      ? copilotActionText[normalizedLocale].partialExecution(succeededCount, failedCount)
      : succeededCount > 0
        ? copilotActionText[normalizedLocale].successfulExecution(succeededCount)
        : copilotActionText[normalizedLocale].nothingToExecute,
    kind: "execution_result",
    mode: "direct",
    results,
    sources: [],
  };
}

async function executeAction(
  action: CopilotAction,
  actorUserId: string,
  refs: Map<string, CreatedActionRef>,
  locale: CopilotLocale,
): Promise<CopilotExecutionResult> {
  const text = copilotActionText[locale];

  switch (action.type) {
    case "create_service": {
      const input = CreateServiceRequestSchema.parse(action.input);
      const workspaceId = await resolveServiceCreateWorkspaceId(input);
      await workspaceService.assertWorkspacePermission(workspaceId, actorUserId, "service.manage");

      const created = await serviceCatalogService.createService(input);

      return {
        action_id: action.id,
        entity_id: created.service.id,
        entity_type: "service",
        label: action.label,
        message: text.serviceCreated(created.service.name),
        output: {
          default_webhook_endpoint_id: created.default_webhook_endpoint.id,
          default_webhook_url: created.default_webhook_endpoint.url,
          default_webhook_url_with_secret: created.default_webhook_endpoint.url_with_secret,
        },
        status: "succeeded",
        type: action.type,
      };
    }

    case "update_service": {
      const serviceId = action.service_id ?? resolveCreatedRef(refs, action.service_id_action_id, "service").entityId;
      const input = {
        ...action.input,
        ...(action.escalation_policy_action_id
          ? { escalation_policy_id: resolveCreatedRef(refs, action.escalation_policy_action_id, "escalation_policy").entityId }
          : {}),
      };
      const parsedInput = UpdateServiceRequestSchema.parse(input);
      const existing = await serviceCatalogService.getService(serviceId);

      if (!existing) {
        throw new Error("Service not found");
      }

      await workspaceService.assertWorkspacePermission(existing.workspace_id, actorUserId, "service.manage");
      const updated = await serviceCatalogService.updateService(serviceId, parsedInput);

      return {
        action_id: action.id,
        entity_id: updated.id,
        entity_type: "service",
        label: action.label,
        message: text.serviceUpdated(updated.name),
        status: "succeeded",
        type: action.type,
      };
    }

    case "create_service_webhook": {
      const serviceId = action.service_id ?? resolveCreatedRef(refs, action.service_id_action_id, "service").entityId;
      const parsedInput = CreateWebhookEndpointRequestSchema.parse(action.input ?? {});
      const existing = await serviceCatalogService.getService(serviceId);

      if (!existing) {
        throw new Error("Service not found");
      }

      await workspaceService.assertWorkspacePermission(existing.workspace_id, actorUserId, "webhook.manage");
      const endpoint = await serviceCatalogService.createServiceWebhookEndpoint(serviceId, parsedInput);

      return {
        action_id: action.id,
        entity_id: endpoint.id,
        entity_type: "webhook_endpoint",
        label: action.label,
        message: text.webhookCreated(existing.name),
        output: {
          url: endpoint.url,
          url_with_secret: endpoint.url_with_secret,
        },
        status: "succeeded",
        type: action.type,
      };
    }

    case "create_on_call_schedule": {
      const input = {
        ...action.input,
        ...(action.service_id_action_id
          ? { service_id: resolveCreatedRef(refs, action.service_id_action_id, "service").entityId }
          : {}),
      };
      const parsedInput = CreateOnCallScheduleRequestSchema.parse(input);
      await workspaceService.assertWorkspacePermission(parsedInput.workspace_id, actorUserId, "on_call.manage");
      const schedule = await onCallService.createSchedule(parsedInput);

      return {
        action_id: action.id,
        entity_id: schedule.id,
        entity_type: "on_call_schedule",
        label: action.label,
        message: text.scheduleCreated(schedule.name),
        status: "succeeded",
        type: action.type,
      };
    }

    case "update_on_call_schedule": {
      const input = {
        ...action.input,
        ...(action.service_id_action_id
          ? { service_id: resolveCreatedRef(refs, action.service_id_action_id, "service").entityId }
          : {}),
      };
      const parsedInput = UpdateOnCallScheduleRequestSchema.parse(input);
      const existing = await onCallService.getSchedule(action.schedule_id);

      if (!existing) {
        throw new Error("On-call schedule not found");
      }

      await workspaceService.assertWorkspacePermission(existing.workspace_id, actorUserId, "on_call.manage");
      const schedule = await onCallService.updateSchedule(action.schedule_id, parsedInput);

      return {
        action_id: action.id,
        entity_id: schedule.id,
        entity_type: "on_call_schedule",
        label: action.label,
        message: text.scheduleUpdated(schedule.name),
        status: "succeeded",
        type: action.type,
      };
    }

    case "create_escalation_policy": {
      const parsedInput = CreateEscalationPolicyRequestSchema.parse({
        ...action.input,
        steps: action.input.steps.map((step) => resolvePolicyStepRefs(step, refs)),
      });
      await workspaceService.assertWorkspacePermission(parsedInput.workspace_id, actorUserId, "escalation.manage");
      const policy = await escalationService.createPolicy(parsedInput);

      return {
        action_id: action.id,
        entity_id: policy.id,
        entity_type: "escalation_policy",
        label: action.label,
        message: text.policyCreated(policy.name),
        status: "succeeded",
        type: action.type,
      };
    }

    case "update_escalation_policy": {
      const existing = await escalationService.getPolicy(action.policy_id);

      if (!existing) {
        throw new Error("Escalation policy not found");
      }

      const parsedInput = UpdateEscalationPolicyRequestSchema.parse({
        ...action.input,
        ...(action.input.steps
          ? { steps: action.input.steps.map((step) => resolvePolicyStepRefs(step, refs)) }
          : {}),
      });
      await workspaceService.assertWorkspacePermission(existing.workspace_id, actorUserId, "escalation.manage");
      const policy = await escalationService.updatePolicy(action.policy_id, parsedInput);

      return {
        action_id: action.id,
        entity_id: policy.id,
        entity_type: "escalation_policy",
        label: action.label,
        message: text.policyUpdated(policy.name),
        status: "succeeded",
        type: action.type,
      };
    }

    case "update_notification_provider": {
      const parsedInput = UpdateWorkspaceNotificationProviderSettingRequestSchema.parse(action.input);
      const setting = await workspaceService.updateNotificationProviderSetting(
        action.workspace_id,
        action.provider,
        parsedInput,
        actorUserId,
      );

      return {
        action_id: action.id,
        entity_id: action.workspace_id,
        entity_type: "workspace_notification_provider_setting",
        label: action.label,
        message: text.providerUpdated(setting.provider),
        status: "succeeded",
        type: action.type,
      };
    }
  }
}

export function requiredPermissionsForActions(actions: readonly CopilotAction[]): WorkspacePermission[] {
  const permissions = new Set<WorkspacePermission>();

  for (const action of actions) {
    switch (action.type) {
      case "create_service":
      case "update_service":
        permissions.add("service.manage");
        break;
      case "create_service_webhook":
        permissions.add("webhook.manage");
        break;
      case "create_on_call_schedule":
      case "update_on_call_schedule":
        permissions.add("on_call.manage");
        break;
      case "create_escalation_policy":
      case "update_escalation_policy":
        permissions.add("escalation.manage");
        break;
      case "update_notification_provider":
        permissions.add("notification.manage");
        break;
    }
  }

  return [...permissions];
}

function resolvePolicyStepRefs(
  step: {
    delay_seconds: number;
    step_order: number;
    target_action_id?: string | undefined;
    target_id?: string | null | undefined;
    target_type: string;
  },
  refs: Map<string, CreatedActionRef>,
) {
  const { target_action_id: targetActionId, ...rest } = step;

  if (!targetActionId) {
    return rest;
  }

  return {
    ...rest,
    target_id: resolveCreatedRef(refs, targetActionId, "on_call_schedule").entityId,
  };
}

function resolveCreatedRef(
  refs: Map<string, CreatedActionRef>,
  actionId: string | undefined,
  expectedEntityType: string,
) {
  if (!actionId) {
    throw new Error(`Missing ${expectedEntityType} reference`);
  }

  const ref = refs.get(actionId);

  if (!ref) {
    throw new Error(`Referenced action did not succeed: ${actionId}`);
  }

  if (ref.entityType !== expectedEntityType) {
    throw new Error(`Referenced action ${actionId} produced ${ref.entityType}, expected ${expectedEntityType}`);
  }

  return ref;
}

async function resolveServiceCreateWorkspaceId(input: CreateServiceRequest) {
  if (input.workspace_id) {
    return input.workspace_id;
  }

  if (!input.team_id) {
    throw new Error("workspace_id is required when team_id is not provided");
  }

  const team = await prisma.team.findUnique({
    where: {
      id: input.team_id,
    },
    select: {
      workspaceId: true,
    },
  });

  if (!team) {
    throw new Error("Team not found");
  }

  return team.workspaceId;
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Action failed";
}

const copilotActionText: Record<CopilotLocale, {
  nothingToExecute: string;
  partialExecution: (succeededCount: number, failedCount: number) => string;
  policyCreated: (name: string) => string;
  policyUpdated: (name: string) => string;
  providerUpdated: (provider: string) => string;
  scheduleCreated: (name: string) => string;
  scheduleUpdated: (name: string) => string;
  serviceCreated: (name: string) => string;
  serviceUpdated: (name: string) => string;
  successfulExecution: (count: number) => string;
  webhookCreated: (serviceName: string) => string;
}> = {
  en: {
    nothingToExecute: "There are no changes to execute.",
    partialExecution: (succeededCount, failedCount) => `${succeededCount} action(s) were applied and ${failedCount} action(s) failed. Review the failed items before retrying.`,
    policyCreated: (name) => `Escalation policy created: ${name}`,
    policyUpdated: (name) => `Escalation policy updated: ${name}`,
    providerUpdated: (provider) => `Notification provider updated: ${provider}`,
    scheduleCreated: (name) => `On-call schedule created: ${name}`,
    scheduleUpdated: (name) => `On-call schedule updated: ${name}`,
    serviceCreated: (name) => `Service created: ${name}`,
    serviceUpdated: (name) => `Service updated: ${name}`,
    successfulExecution: (count) => `${count} action(s) applied.`,
    webhookCreated: (serviceName) => `Webhook endpoint created for ${serviceName}`,
  },
  ko: {
    nothingToExecute: "실행할 변경이 없습니다.",
    partialExecution: (succeededCount, failedCount) => `${succeededCount}개 action은 적용됐고 ${failedCount}개 action은 실패했습니다. 실패 항목을 확인한 뒤 다시 실행할 수 있습니다.`,
    policyCreated: (name) => `Escalation policy 생성됨: ${name}`,
    policyUpdated: (name) => `Escalation policy 수정됨: ${name}`,
    providerUpdated: (provider) => `Notification provider 수정됨: ${provider}`,
    scheduleCreated: (name) => `On-call schedule 생성됨: ${name}`,
    scheduleUpdated: (name) => `On-call schedule 수정됨: ${name}`,
    serviceCreated: (name) => `Service 생성됨: ${name}`,
    serviceUpdated: (name) => `Service 수정됨: ${name}`,
    successfulExecution: (count) => `${count}개 action을 적용했습니다.`,
    webhookCreated: (serviceName) => `${serviceName}에 webhook endpoint를 생성했습니다.`,
  },
  "zh-CN": {
    nothingToExecute: "没有需要执行的更改。",
    partialExecution: (succeededCount, failedCount) => `${succeededCount} 个操作已应用，${failedCount} 个操作失败。请检查失败项后再重试。`,
    policyCreated: (name) => `已创建 Escalation Policy：${name}`,
    policyUpdated: (name) => `已更新 Escalation Policy：${name}`,
    providerUpdated: (provider) => `已更新 Notification provider：${provider}`,
    scheduleCreated: (name) => `已创建 On-call Schedule：${name}`,
    scheduleUpdated: (name) => `已更新 On-call Schedule：${name}`,
    serviceCreated: (name) => `已创建 Service：${name}`,
    serviceUpdated: (name) => `已更新 Service：${name}`,
    successfulExecution: (count) => `已应用 ${count} 个操作。`,
    webhookCreated: (serviceName) => `已为 ${serviceName} 创建 webhook endpoint`,
  },
};
