import type { RequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { askCopilotHandler, executeCopilotHandler, getCopilotStatusHandler } from "./copilot.handler";
import { errorMiddleware } from "../middleware/error.middleware";
import { rememberProposal } from "../../copilot/copilot-proposals";

const mocks = vi.hoisted(() => ({
  answerCopilotQuestion: vi.fn(),
  executeCopilotProposal: vi.fn(),
  getCopilotStatus: vi.fn(),
  readSettingsContext: vi.fn(),
  validateSettingsActions: vi.fn(),
  auditCreate: vi.fn(),
  auditUpdate: vi.fn(),
}));

vi.mock("@im/db", async () => ({ prisma: { activityLog: { create: mocks.auditCreate, update: mocks.auditUpdate },
  copilotProposal: (await import("../../copilot/copilot-proposals.fixtures")).fakeCopilotProposalStore() } }));

vi.mock("../../copilot/copilot-settings", () => ({
  readSettingsContext: mocks.readSettingsContext,
  settingsFingerprint: () => "snapshot",
  validateSettingsActions: mocks.validateSettingsActions,
}));

vi.mock("../../copilot/copilot.actions", () => ({
  executeCopilotProposal: mocks.executeCopilotProposal,
}));

vi.mock("../../copilot/copilot.service", () => ({
  answerCopilotQuestion: mocks.answerCopilotQuestion,
  getCopilotStatus: mocks.getCopilotStatus,
}));

describe("askCopilotHandler", () => {
  afterEach(() => vi.unstubAllEnvs());
  const actorUserId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    mocks.auditCreate.mockResolvedValue({ id: "audit-id" });
    mocks.auditUpdate.mockResolvedValue({});
    vi.clearAllMocks();
    mocks.answerCopilotQuestion.mockResolvedValue({
      answer: "Service에 Escalation Policy를 연결합니다.",
      kind: "message",
      mode: "ai",
      model: "example-model",
      sources: [],
    });
    mocks.getCopilotStatus.mockResolvedValue({
      available: true,
      checked_at: "2026-06-17T00:00:00.000Z",
      model: "example-model",
      api_format: "responses",
    });
    mocks.executeCopilotProposal.mockResolvedValue({
      answer: "1개 action을 적용했습니다.",
      kind: "execution_result",
      mode: "direct",
      results: [
        {
          action_id: "create-service",
          label: "Create service",
          message: "Service created",
          status: "succeeded",
          type: "create_service",
        },
      ],
      sources: [],
    });
  });

  it("requires an authenticated actor", async () => {
    const response = await invokeHandler(askCopilotHandler, {
      body: {
        question: "서비스 생성 절차 알려줘",
      },
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: {
        code: "authentication_required",
      },
    });
    expect(mocks.answerCopilotQuestion).not.toHaveBeenCalled();
  });

  it("validates the question", async () => {
    const response = await invokeHandler(askCopilotHandler, {
      body: {
        question: "",
      },
      actorUserId,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "invalid_copilot_request",
      },
    });
    expect(mocks.answerCopilotQuestion).not.toHaveBeenCalled();
  });

  it("returns a Copilot answer", async () => {
    const response = await invokeHandler(askCopilotHandler, {
      body: {
        history: [
          {
            content: "이게 무슨 플랫폼이야",
            role: "user",
          },
        ],
        question: "서비스 생성 절차 알려줘",
        workspace_id: "22222222-2222-4222-8222-222222222222",
      },
      actorUserId,
    });

    expect(response.status).toBe(200);
    expect(mocks.answerCopilotQuestion).toHaveBeenCalledWith(
      "서비스 생성 절차 알려줘",
      [
        {
          content: "이게 무슨 플랫폼이야",
          role: "user",
        },
      ],
        {
          actorUserId,
          locale: undefined,
          structuredInput: undefined,
          workspaceId: "22222222-2222-4222-8222-222222222222",
        },
    );
    expect(response.body).toMatchObject({
      data: {
        answer: "Service에 Escalation Policy를 연결합니다.",
        mode: "ai",
      },
    });
  });

  it("passes the requested locale to Copilot", async () => {
    const response = await invokeHandler(askCopilotHandler, {
      body: {
        locale: "zh-CN",
        question: "什么是服务？",
      },
      actorUserId,
    });

    expect(response.status).toBe(200);
    expect(mocks.answerCopilotQuestion).toHaveBeenCalledWith(
      "什么是服务？",
      [],
      {
        actorUserId,
        locale: "zh-CN",
        structuredInput: undefined,
        workspaceId: undefined,
      },
    );
  });

  it("passes the client docs version so stale product guides are detected", async () => {
    const response = await invokeHandler(askCopilotHandler, {
      body: {
        docs_version: "0123abcd",
        question: "How does on-call work?",
        workspace_id: "22222222-2222-4222-8222-222222222222",
      },
      actorUserId,
    });

    expect(response.status).toBe(200);
    expect(mocks.answerCopilotQuestion).toHaveBeenCalledWith(
      "How does on-call work?",
      [],
      expect.objectContaining({ docsVersion: "0123abcd" }),
    );
  });

  it("passes structured clarification input to Copilot", async () => {
    const structuredInput = {
      task: {
        known_inputs: {},
        operation: "create_service",
        pending_goal: "서비스 하나 만들어줘",
        required_fields: ["service_name"],
        task_id: "task-1",
      },
      task_id: "task-1",
      values: {
        service_name: "테스트서비스",
      },
    };

    const response = await invokeHandler(askCopilotHandler, {
      body: {
        question: "서비스 이름: 테스트서비스",
        structured_input: structuredInput,
        workspace_id: "22222222-2222-4222-8222-222222222222",
      },
      actorUserId,
    });

    expect(response.status).toBe(200);
    expect(mocks.answerCopilotQuestion).toHaveBeenCalledWith(
      "서비스 이름: 테스트서비스",
      [],
      {
        actorUserId,
        locale: undefined,
        structuredInput,
        workspaceId: "22222222-2222-4222-8222-222222222222",
      },
    );
  });

  it("returns Copilot model status", async () => {
    const response = await invokeHandler(getCopilotStatusHandler, {
      actorUserId,
    });

    expect(response.status).toBe(200);
    expect(mocks.getCopilotStatus).toHaveBeenCalledWith();
    expect(response.body).toMatchObject({
      data: {
        available: true,
        model: "example-model",
        api_format: "responses",
      },
    });
  });

  it("rejects execute requests without approval", async () => {
    const response = await invokeHandler(executeCopilotHandler, {
      body: {
        approval: false,
        proposal: {
          actions: [],
          goal: "test",
          id: "proposal-1",
          missing_inputs: [],
          risks: [],
          summary: "test",
        },
      },
      actorUserId,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "invalid_copilot_execute_request",
      },
    });
    expect(mocks.executeCopilotProposal).not.toHaveBeenCalled();
  });

  it("rejects client-supplied proposals the server did not issue", async () => {
    const proposal = {
      actions: [],
      goal: "test",
      id: "proposal-1",
      missing_inputs: [],
      risks: [],
      summary: "test",
    };

    const response = await invokeHandler(executeCopilotHandler, {
      body: {
        approval: true,
        proposal,
      },
      actorUserId,
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "copilot_proposal_expired" } });
    expect(mocks.executeCopilotProposal).not.toHaveBeenCalled();
  });

  it("executes server-owned Copilot proposals only once", async () => {
    mocks.readSettingsContext.mockResolvedValue({});
    const proposal = await rememberProposal({ actions: [], goal: "test", id: "draft", missing_inputs: [], risks: [], summary: "test",
      workspace_id: "22222222-2222-4222-8222-222222222222" }, actorUserId, "snapshot");
    expect((await invokeHandler(executeCopilotHandler, { body: { approval: true, proposal }, actorUserId })).status).toBe(200);
    expect((await invokeHandler(executeCopilotHandler, { body: { approval: true, proposal }, actorUserId })).status).toBe(409);
    expect(mocks.executeCopilotProposal).toHaveBeenCalledTimes(1);
  });

  it("rejects stale settings before executing", async () => {
    mocks.readSettingsContext.mockResolvedValue({});
    const proposal = await rememberProposal({ actions: [], goal: "test", id: "draft", missing_inputs: [], risks: [], summary: "test",
      workspace_id: "22222222-2222-4222-8222-222222222222" }, actorUserId, "old-snapshot");
    const response = await invokeHandler(executeCopilotHandler, { body: { approval: true, proposal }, actorUserId });
    expect(response.status).toBe(409);
    expect(mocks.executeCopilotProposal).not.toHaveBeenCalled();
  });

  it("passes the requested locale when executing a proposal", async () => {
    mocks.readSettingsContext.mockResolvedValue({});
    const proposal = await rememberProposal({ actions: [], goal: "test", id: "draft", missing_inputs: [], risks: [], summary: "test",
      workspace_id: "22222222-2222-4222-8222-222222222222" }, actorUserId, "snapshot");

    const response = await invokeHandler(executeCopilotHandler, {
      body: {
        approval: true,
        locale: "en",
        proposal,
      },
      actorUserId,
    });

    expect(response.status).toBe(200);
    expect(mocks.executeCopilotProposal).toHaveBeenCalledWith({ approval: true, locale: "en", proposal }, actorUserId, "en");
    expect(response.body).toMatchObject({ data: { kind: "execution_result", results: [{ status: "succeeded", type: "create_service" }] } });
  });
});

async function invokeHandler(
  handler: RequestHandler,
  input: {
    actorUserId?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<{
  body: unknown;
  status: number;
}> {
  const req = {
    actorUserId: input.actorUserId,
    authSource: input.actorUserId ? "session" : undefined,
    body: input.body ?? {},
    header(name: string) {
      return input.headers?.[name.toLowerCase()];
    },
  };
  const res = createResponse();
  const next = vi.fn((error?: unknown) => {
    if (error) {
      errorMiddleware(error, req as never, res as never, vi.fn());
    }
  });

  await handler(req as never, res as never, next);

  return {
    body: res.body,
    status: res.statusCode,
  };
}

function createResponse() {
  return {
    body: null as unknown,
    locals: {
      requestId: "test-request-id",
    },
    statusCode: 200,
    json(body: unknown) {
      this.body = body;
      return this;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
  };
}
