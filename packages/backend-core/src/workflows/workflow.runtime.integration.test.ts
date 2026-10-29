import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";

import type { WorkflowActionInput, WorkflowActionType, WorkflowTriggerInput } from "@im/contracts";
import { Prisma, prisma } from "@im/db";
import { afterEach, beforeAll, expect, it } from "vitest";

import { assertIntegrationDatabaseReady, cleanupTestRecords, describeIfDatabase } from "../test-utils/db-fixtures";
import { WorkflowService } from "./workflow.service";

describeIfDatabase("Workflow runtime", () => {
  const workflowService = new WorkflowService(prisma);
  const fixtures: Fixture[] = [];
  const servers: Server[] = [];

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));

    for (const fixture of fixtures.splice(0).reverse()) {
      await cleanupTestRecords({
        userIds: [fixture.ownerId, fixture.runAsUserId],
        workspaceIds: [fixture.workspaceId],
      });
    }
  });

  it("creates, updates, enables, disables, and only dispatches matching enabled workflows", async () => {
    const fixture = await createFixture();
    const workflow = await createWorkflow(fixture, {
      enabled: false,
      filters: [
        { field: "metadata.priority", operator: "equals", value: "P1" },
        { field: "metadata.region", operator: "in", value: ["ap-northeast-2"] },
        { field: "metadata.owner", operator: "exists" },
      ],
    });

    const updated = await workflowService.updateWorkflow(workflow.id, {
      description: "updated description",
      name: "Updated runtime workflow",
    }, fixture.ownerId);
    expect(updated).toMatchObject({ description: "updated description", name: "Updated runtime workflow" });

    await createEvent(fixture, { priority: "P1", region: "ap-northeast-2", owner: "ops" }, {
      occurredAt: new Date(1),
    });
    await workflowService.processNextEvent("disabled-worker");
    expect(await prisma.workflowRun.count({ where: { workflowId: workflow.id } })).toBe(0);

    expect((await workflowService.setWorkflowEnabled(workflow.id, true, fixture.ownerId)).enabled).toBe(true);
    await createEvent(fixture, { priority: "P1", region: "ap-northeast-2", owner: "ops" }, {
      occurredAt: new Date(2),
    });
    await createEvent(fixture, { priority: "P2", region: "ap-northeast-2", owner: "ops" }, {
      occurredAt: new Date(3),
    });
    await workflowService.processNextEvent("matching-worker");
    await workflowService.processNextEvent("nonmatching-worker");
    expect(await prisma.workflowRun.count({ where: { workflowId: workflow.id } })).toBe(1);

    expect((await workflowService.setWorkflowEnabled(workflow.id, false, fixture.ownerId)).enabled).toBe(false);
  });

  it("deletes a workflow and its run history", async () => {
    const fixture = await createFixture();
    const workflow = await createWorkflow(fixture);
    const run = await workflowService.testWorkflow(workflow.id, {
      metadata: { priority: "P1" },
      trigger_key: "trigger",
    }, fixture.ownerId);

    const deleted = await workflowService.deleteWorkflow(workflow.id, fixture.ownerId);

    expect(deleted.id).toBe(workflow.id);
    expect(await prisma.workflow.findUnique({ where: { id: workflow.id } })).toBeNull();
    expect(await prisma.workflowRun.findUnique({ where: { id: run.id } })).toBeNull();
  });

  it("executes true and false condition paths and templates a previous action output", async () => {
    const fixture = await createFixture();
    const workflow = await createWorkflow(fixture, {
      actions: [
        conditionAction("priority", "{{event.metadata.priority}}", "equals", "P1", "previous", "fallback"),
        conditionAction("previous", "{{actions.priority.output.matched}}", "equals", true),
        conditionAction("fallback", "{{event.metadata.priority}}", "equals", "P2"),
      ],
    });

    const trueRun = await workflowService.testWorkflow(workflow.id, {
      metadata: { priority: "P1" },
      trigger_key: "trigger",
    }, fixture.ownerId);
    expect(trueRun.status).toBe("succeeded");
    expect(trueRun.action_runs!.map((run) => [run.status, run.type])).toEqual([
      ["succeeded", "condition"],
      ["succeeded", "condition"],
    ]);
    expect(trueRun.action_runs![1]?.output).toMatchObject({ matched: true });

    const falseRun = await workflowService.testWorkflow(workflow.id, {
      metadata: { priority: "P2" },
      trigger_key: "trigger",
    }, fixture.ownerId);
    expect(falseRun.status).toBe("succeeded");
    expect(falseRun.action_runs!.map((run) => run.status)).toEqual(["failed", "succeeded"]);
  });

  it("records HTTP success, HTTP errors, timeout errors, and follows the configured failure path", async () => {
    const fixture = await createFixture();
    const { baseUrl, requests } = await startHttpServer(servers);

    const success = await createWorkflow(fixture, {
      actions: [{
        action_key: "request",
        type: "http_request",
        config: {
          body: { priority: "{{event.metadata.priority}}" },
          request: { method: "POST", timeout_ms: 1000, url: `${baseUrl}/ok` },
        },
      }],
    });
    const successRun = await workflowService.testWorkflow(success.id, {
      metadata: { priority: "P1" },
      trigger_key: "trigger",
    }, fixture.ownerId);
    expect(successRun.status).toBe("succeeded");
    expect(successRun.action_runs![0]?.output).toMatchObject({ status: 200 });
    expect(requests).toContain('{"priority":"P1"}');

    const error = await createWorkflow(fixture, {
      actions: [
        {
          action_key: "request",
          type: "http_request",
          config: { request: { method: "GET", timeout_ms: 1000, url: `${baseUrl}/error` } },
          failure_action_key: "fallback",
        },
        conditionAction("fallback", "{{event.metadata.priority}}", "exists"),
      ],
    });
    const errorRun = await workflowService.testWorkflow(error.id, {
      metadata: { priority: "P1" },
      trigger_key: "trigger",
    }, fixture.ownerId);
    expect(errorRun.status).toBe("succeeded");
    expect(errorRun.action_runs![0]).toMatchObject({ status: "failed" });
    expect(errorRun.action_runs![0]?.error_message).toContain("HTTP action failed with 500");
    expect(errorRun.action_runs![1]).toMatchObject({ status: "succeeded" });

    const timeout = await createWorkflow(fixture, {
      actions: [{
        action_key: "request",
        type: "http_request",
        config: { request: { method: "GET", timeout_ms: 1000, url: `${baseUrl}/slow` } },
      }],
    });
    const timeoutRun = await workflowService.testWorkflow(timeout.id, { trigger_key: "trigger" }, fixture.ownerId);
    expect(timeoutRun.status).toBe("retrying");
    expect(timeoutRun.action_runs![0]).toMatchObject({ status: "failed" });
    expect(timeoutRun.action_runs![0]?.error_message).toMatch(/abort|timeout/i);
  });

  it("rechecks run-as permissions at execution time and rejects cross-workspace test resources", async () => {
    const fixture = await createFixture();
    const other = await createFixture();
    const workflow = await createWorkflow(fixture, {
      actions: [{
        action_key: "create_service",
        type: "service_create",
        config: { body: { name: "Created by workflow" } },
      }],
    });

    await prisma.workspaceMemberRole.deleteMany({
      where: { userId: fixture.runAsUserId, workspaceId: fixture.workspaceId },
    });
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { userId: fixture.runAsUserId, workspaceId: fixture.workspaceId } },
      data: { role: "viewer" },
    });
    const denied = await workflowService.testWorkflow(workflow.id, { trigger_key: "trigger" }, fixture.ownerId);
    expect(denied.status).toBe("retrying");
    expect(denied.action_runs![0]?.error_message).toContain("permission");
    expect(await prisma.service.count({ where: { name: "Created by workflow", workspaceId: fixture.workspaceId } })).toBe(0);

    const otherService = await prisma.service.create({
      data: { name: "Other workspace service", workspaceId: other.workspaceId },
    });
    await expect(workflowService.testWorkflow(workflow.id, {
      resource_id: otherService.id,
      trigger_key: "trigger",
    }, fixture.ownerId)).rejects.toMatchObject({ code: "workflow_action_invalid_config" });
  });

  it("does not allow an action target from another workspace", async () => {
    const fixture = await createFixture();
    const other = await createFixture();
    const otherService = await prisma.service.create({
      data: { name: "Untouched service", workspaceId: other.workspaceId },
    });
    const workflow = await createWorkflow(fixture, {
      actions: [{
        action_key: "update",
        config: { body: { name: "Cross-workspace mutation" }, target: { service_id: otherService.id } },
        type: "service_update",
      }],
    });

    const run = await workflowService.testWorkflow(workflow.id, { trigger_key: "trigger" }, fixture.ownerId);
    expect(run.status).toBe("retrying");
    expect(run.action_runs![0]?.error_message).toMatch(/workspace|not found|target/i);
    expect((await prisma.service.findUniqueOrThrow({ where: { id: otherService.id } })).name).toBe("Untouched service");
  });

  it("recovers stale event locks, deduplicates runs, and ignores workflow-origin events", async () => {
    const fixture = await createFixture();
    const workflow = await createWorkflow(fixture, { enabled: true });
    const stale = await createEvent(fixture, { priority: "P1" }, {
      lockedAt: new Date(Date.now() - 6 * 60 * 1000),
      lockedBy: "stopped-worker",
    });

    expect(await workflowService.processNextEvent("replacement-worker")).toEqual({ processed: 1 });
    expect(await prisma.workflowRun.count({ where: { workflowEventId: stale.id, workflowId: workflow.id } })).toBe(1);

    await prisma.workflowEvent.update({
      where: { id: stale.id },
      data: { lockedAt: null, lockedBy: null, processedAt: null },
    });
    expect(await workflowService.processNextEvent("duplicate-worker")).toEqual({ processed: 1 });
    expect(await prisma.workflowRun.count({ where: { workflowEventId: stale.id, workflowId: workflow.id } })).toBe(1);

    await prisma.workflowEvent.create({
      data: {
        action: "incident.created",
        metadata: { priority: "P1" },
        occurredAt: new Date(0),
        origin: "workflow",
        resourceType: "incident",
        workspaceId: fixture.workspaceId,
      },
    });
    expect(await workflowService.processNextEvent("loop-worker")).toEqual({ processed: 0 });

    const restartedWorkerService = new WorkflowService(prisma);
    expect(await restartedWorkerService.executeNextDueRun()).toEqual({ processed: 1 });
    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowEventId: stale.id, workflowId: workflow.id },
      include: { actionRuns: true },
    });
    expect(run.status).toBe("succeeded");
    expect(run.actionRuns).toHaveLength(1);
  });

  it("validates normal input and execution-time permissions for every protected action type", async () => {
    const fixture = await createFixture();
    const { baseUrl } = await startHttpServer(servers);
    const actions = protectedActionSamples(fixture, baseUrl);
    const workflows = [];

    for (const action of actions) {
      workflows.push(await createWorkflow(fixture, { actions: [action] }));
    }

    await prisma.workspaceMemberRole.deleteMany({
      where: { userId: fixture.runAsUserId, workspaceId: fixture.workspaceId },
    });
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { userId: fixture.runAsUserId, workspaceId: fixture.workspaceId } },
      data: { role: "viewer" },
    });

    for (const [index, workflow] of workflows.entries()) {
      const run = await workflowService.testWorkflow(workflow.id, { trigger_key: "trigger" }, fixture.ownerId);
      expect(run.status, actions[index]?.type).toBe("retrying");
      expect(run.action_runs![0]?.error_message, actions[index]?.type).toMatch(/permission/i);
    }
  });

  it("fails safely when target-dependent actions have no target resource", async () => {
    const fixture = await createFixture();
    const targetActions: Array<{ config: Record<string, unknown>; type: WorkflowActionType }> = [
      { config: {}, type: "service_delete" },
      { config: {}, type: "webhook_endpoint_create" },
      { config: {}, type: "webhook_endpoint_rotate_secret" },
      { config: {}, type: "webhook_endpoint_delete" },
      { config: {}, type: "incident_ack" },
      { config: {}, type: "incident_resolve" },
      { config: {}, type: "escalation_policy_delete" },
      { config: {}, type: "on_call_schedule_delete" },
      { config: {}, type: "on_call_override_delete" },
    ];

    for (const sample of targetActions) {
      const workflow = await createWorkflow(fixture, {
        actions: [{ action_key: "target", config: sample.config, type: sample.type }],
      });
      const run = await workflowService.testWorkflow(workflow.id, { trigger_key: "trigger" }, fixture.ownerId);
      expect(run.status, sample.type).toBe("retrying");
      expect(run.action_runs![0]?.error_message, sample.type).toMatch(/requires|target/i);
    }
  });

  it("rejects missing required values for every action type that defines them", async () => {
    const fixture = await createFixture();
    const invalidActions: Array<{ config: Record<string, unknown>; type: WorkflowActionType }> = [
      { config: {}, type: "condition" },
      { config: {}, type: "http_request" },
      { config: {}, type: "notification_webhook" },
      { config: {}, type: "service_create" },
      { config: {}, type: "incident_create" },
      { config: { target: { incident_id: randomUUID() } }, type: "incident_update_priority" },
      { config: {}, type: "escalation_policy_create" },
      { config: { body: { name: "Missing target" } }, type: "escalation_policy_update" },
      { config: {}, type: "on_call_schedule_create" },
      { config: { body: { name: "Missing target" } }, type: "on_call_schedule_update" },
      { config: {}, type: "on_call_override_create" },
      { config: { body: { enabled: false } }, type: "notification_provider_update" },
    ];

    for (const sample of invalidActions) {
      await expect(createWorkflow(fixture, {
        actions: [{ action_key: "invalid", config: sample.config, type: sample.type }],
      }), sample.type).rejects.toMatchObject({ code: "workflow_action_invalid_config" });
    }
  });

  async function createFixture(): Promise<Fixture> {
    const fixture = {
      ownerId: randomUUID(),
      runAsUserId: randomUUID(),
      workspaceId: randomUUID(),
    };
    fixtures.push(fixture);
    await prisma.user.createMany({
      data: [
        { email: `${fixture.ownerId}@example.com`, id: fixture.ownerId, name: "Workflow owner" },
        { email: `${fixture.runAsUserId}@example.com`, id: fixture.runAsUserId, name: "Workflow runner" },
      ],
    });
    await prisma.workspace.create({
      data: { id: fixture.workspaceId, name: "Workflow runtime", slug: `workflow-runtime-${fixture.workspaceId}` },
    });
    for (const userId of [fixture.ownerId, fixture.runAsUserId]) {
      await prisma.workspaceMember.create({
        data: { role: "owner", userId, workspaceId: fixture.workspaceId },
      });
      await prisma.workspaceMemberRole.create({
        data: { assignedByUserId: fixture.ownerId, roleKey: "project_owner", userId, workspaceId: fixture.workspaceId },
      });
    }
    return fixture;
  }

  async function createWorkflow(
    fixture: Fixture,
    options: {
      actions?: WorkflowActionInput[];
      enabled?: boolean;
      filters?: WorkflowTriggerInput["filters"];
    } = {},
  ) {
    return workflowService.createWorkflow({
      actions: options.actions ?? [conditionAction("entry", "{{event.metadata.priority}}", "exists")],
      enabled: options.enabled ?? false,
      name: "Runtime workflow",
      run_as_user_id: fixture.runAsUserId,
      triggers: [{
        entry_action_key: options.actions?.[0]?.action_key ?? "entry",
        event_action: "incident.created",
        filters: options.filters ?? [],
        resource_type: "incident",
        trigger_key: "trigger",
      }],
      workspace_id: fixture.workspaceId,
    }, fixture.ownerId);
  }

  async function createEvent(
    fixture: Fixture,
    metadata: Record<string, unknown>,
    options: { lockedAt?: Date; lockedBy?: string; occurredAt?: Date } = {},
  ) {
    return prisma.workflowEvent.create({
      data: {
        action: "incident.created",
        actorUserId: fixture.ownerId,
        ...(options.lockedAt ? { lockedAt: options.lockedAt } : {}),
        ...(options.lockedBy ? { lockedBy: options.lockedBy } : {}),
        metadata: metadata as Prisma.InputJsonObject,
        occurredAt: options.occurredAt ?? new Date(),
        resourceType: "incident",
        workspaceId: fixture.workspaceId,
      },
    });
  }
});

function conditionAction(
  actionKey: string,
  field: string,
  operator: "equals" | "exists" | "in",
  value?: unknown,
  nextActionKey?: string,
  failureActionKey?: string,
): WorkflowActionInput {
  return {
    action_key: actionKey,
    config: { body: { field, operator, ...(operator === "exists" ? {} : { value }) } },
    failure_action_key: failureActionKey ?? null,
    next_action_key: nextActionKey ?? null,
    type: "condition",
  };
}

async function startHttpServer(servers: Server[]) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push(Buffer.concat(chunks).toString("utf8"));
      if (request.url === "/slow") {
        setTimeout(() => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end('{"slow":true}');
        }, 1500);
        return;
      }
      if (request.url === "/error") {
        response.writeHead(500, { "content-type": "application/json" });
        response.end('{"error":"expected"}');
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP test server did not expose a TCP port");
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

type Fixture = {
  ownerId: string;
  runAsUserId: string;
  workspaceId: string;
};

function protectedActionSamples(fixture: Fixture, baseUrl: string): WorkflowActionInput[] {
  const id = randomUUID();
  const body = (value: Record<string, unknown>) => ({ body: value });
  const targeted = (target: Record<string, unknown>, value: Record<string, unknown> = {}) => ({ body: value, target });
  const samples: Array<[WorkflowActionType, Record<string, unknown>]> = [
    ["http_request", { request: { method: "GET", timeout_ms: 1000, url: `${baseUrl}/ok` } }],
    ["notification_webhook", { request: { method: "POST", timeout_ms: 1000, url: `${baseUrl}/ok` } }],
    ["service_create", body({ name: "Sample service" })],
    ["service_update", targeted({ service_id: id }, { name: "Updated service" })],
    ["service_delete", targeted({ service_id: id })],
    ["webhook_endpoint_create", targeted({ service_id: id })],
    ["webhook_endpoint_rotate_secret", targeted({ endpoint_id: id })],
    ["webhook_endpoint_delete", targeted({ endpoint_id: id })],
    ["incident_create", body({ service_id: id, severity: "high", title: "Sample incident" })],
    ["incident_ack", targeted({ incident_id: id })],
    ["incident_resolve", targeted({ incident_id: id })],
    ["incident_update_priority", targeted({ incident_id: id }, { priority: "P1" })],
    ["incident_manual_escalation", targeted({ incident_id: id }, { action: "advance_to_next_step" })],
    ["escalation_policy_create", body({ name: "Sample policy", steps: [] })],
    ["escalation_policy_update", targeted({ policy_id: id }, { name: "Updated policy" })],
    ["escalation_policy_delete", targeted({ policy_id: id })],
    ["on_call_schedule_create", body({ name: "Sample schedule", rotations: [], timezone: "UTC" })],
    ["on_call_schedule_update", targeted({ schedule_id: id }, { name: "Updated schedule" })],
    ["on_call_schedule_delete", targeted({ schedule_id: id })],
    ["on_call_override_create", body({
      ends_at: "2027-01-01T01:00:00.000Z",
      layer: "primary",
      schedule_id: id,
      starts_at: "2027-01-01T00:00:00.000Z",
      user_id: fixture.runAsUserId,
    })],
    ["on_call_override_delete", targeted({ override_id: id })],
    ["notification_provider_update", targeted({ provider: "slack" }, { enabled: false })],
  ];

  return samples.map(([type, config]) => ({ action_key: type, config, type }));
}
