import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usage = vi.hoisted(() => ({ assertBudget: vi.fn(), record: vi.fn() }));
vi.mock("./copilot-usage", () => ({ assertCopilotTokenBudget: usage.assertBudget, recordCopilotTokens: usage.record }));

import { HttpError } from "../http/errors/http-error";
import { fromChatCompletion, readCopilotConfig, requestCopilotModel, toChatMessages } from "./model-client";

const COPILOT_ENV = ["COPILOT_API_FORMAT", "COPILOT_API_KEY", "COPILOT_BASE_URL", "COPILOT_MODEL", "COPILOT_EXTRA_BODY",
  "COPILOT_ALLOW_INSECURE_HTTP"];

function configure(values: Record<string, string>) {
  for (const name of COPILOT_ENV) vi.stubEnv(name, values[name] ?? "");
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0]?.[1].body as string);
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Copilot model configuration", () => {
  it("is disabled when nothing is configured", () => {
    configure({});
    expect(readCopilotConfig()).toEqual({ status: "disabled" });
  });

  it("reports partial or unsafe configuration without echoing values", () => {
    configure({ COPILOT_API_KEY: "secret-key", COPILOT_BASE_URL: "http://llm.internal/v1", COPILOT_EXTRA_BODY: "{\"model\":\"x\"}" });
    const state = readCopilotConfig();
    expect(state.status).toBe("invalid");
    const problems = state.status === "invalid" ? state.problems.join(" ") : "";
    expect(problems).toContain("COPILOT_MODEL");
    expect(problems).toContain("HTTPS");
    expect(problems).toContain("COPILOT_EXTRA_BODY");
    expect(problems).not.toContain("secret-key");
  });

  it("allows plain HTTP only with an explicit opt-in", () => {
    configure({ COPILOT_API_KEY: "k", COPILOT_BASE_URL: "http://ollama:11434/v1/", COPILOT_MODEL: "m", COPILOT_ALLOW_INSECURE_HTTP: "true" });
    expect(readCopilotConfig()).toMatchObject({ status: "configured", config: { baseUrl: "http://ollama:11434/v1", apiFormat: "responses" } });
  });
});

describe("Responses API format", () => {
  beforeEach(() => configure({ COPILOT_API_KEY: "test-key", COPILOT_BASE_URL: "https://example.test/v1", COPILOT_MODEL: "example-model",
    COPILOT_EXTRA_BODY: "{\"enable_thinking\":false}" }));

  it("uses /responses, disables storage, merges extra body and never returns reasoning", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [
      { type: "reasoning", summary: [{ text: "internal reasoning" }] },
      { type: "message", content: [{ type: "output_text", text: "Which timezone?" }] },
    ] })));
    vi.stubGlobal("fetch", fetchMock);
    const output = await requestCopilotModel([{ role: "user", content: "create schedule" }], [], AbortSignal.timeout(1000), "tool_a");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.test/v1/responses");
    expect(requestBody(fetchMock)).toMatchObject({ model: "example-model", store: false, enable_thinking: false,
      tool_choice: { type: "function", name: "tool_a" }, max_output_tokens: 4096 });
    expect(JSON.stringify(output)).not.toContain("internal reasoning");
  });

  it("sanitizes provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret request input", { status: 401 })));
    await expect(requestCopilotModel([], [], AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "copilot_provider_error" });
  });

  it("rejects incomplete responses and missing configuration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "incomplete", output: [] }))));
    await expect(requestCopilotModel([], [], AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "copilot_invalid_response" });
    vi.stubEnv("COPILOT_API_KEY", "");
    await expect(requestCopilotModel([], [], AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "copilot_not_configured" });
  });

  it("checks the project budget before calling and records provider-reported tokens", async () => {
    const workspaceId = "22222222-2222-4222-8222-222222222222";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [],
      usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 } }))));
    await requestCopilotModel([], [], AbortSignal.timeout(1000), undefined, workspaceId);
    expect(usage.assertBudget).toHaveBeenCalledWith(workspaceId);
    expect(usage.record).toHaveBeenCalledWith(workspaceId, 1500);
  });

  it("charges a conservative estimate when usage is missing, even for invalid output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "incomplete", output: [] }))));
    await expect(requestCopilotModel([], [], AbortSignal.timeout(1000), undefined, "workspace")).rejects.toMatchObject({ code: "copilot_invalid_response" });
    expect(usage.record.mock.calls[0]?.[1]).toBeGreaterThan(4096);
  });

  it("does not call the provider once the budget is exhausted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    usage.assertBudget.mockRejectedValueOnce(new HttpError(429, "copilot_budget_exceeded", "limit"));
    await expect(requestCopilotModel([], [], AbortSignal.timeout(1000), undefined, "workspace")).rejects.toMatchObject({ code: "copilot_budget_exceeded" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Chat Completions format", () => {
  beforeEach(() => configure({ COPILOT_API_FORMAT: "chat-completions", COPILOT_API_KEY: "test-key",
    COPILOT_BASE_URL: "https://example.test/v1", COPILOT_MODEL: "example-model" }));

  const tool = { type: "function", name: "lookup", description: "Look up", parameters: { type: "object", properties: {} } };

  it("translates tools, tool choice and tool-call history to /chat/completions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop",
      message: { role: "assistant", content: "done" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })));
    vi.stubGlobal("fetch", fetchMock);
    await requestCopilotModel([
      { role: "system", content: "rules" },
      { role: "user", content: "hi" },
      { type: "function_call", name: "lookup", call_id: "c1", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "{\"ok\":true}" },
    ], [tool], AbortSignal.timeout(1000), "lookup", "workspace");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.test/v1/chat/completions");
    const body = requestBody(fetchMock);
    expect(body).toMatchObject({
      model: "example-model", max_tokens: 4096,
      tools: [{ type: "function", function: { name: "lookup", description: "Look up", parameters: { type: "object", properties: {} } } }],
      tool_choice: { type: "function", function: { name: "lookup" } },
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "hi" },
        { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "lookup", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c1", content: "{\"ok\":true}" },
      ],
    });
    expect(body).not.toHaveProperty("store");
    expect(body).not.toHaveProperty("input");
    expect(usage.record).toHaveBeenCalledWith("workspace", 15);
  });

  it("maps assistant text and tool calls into Responses output items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: {
      role: "assistant", content: "Checking.", tool_calls: [{ id: "c9", type: "function", function: { name: "lookup", arguments: "{\"q\":1}" } }],
    } }] }))));
    await expect(requestCopilotModel([], [tool], AbortSignal.timeout(1000))).resolves.toEqual([
      { type: "message", content: [{ type: "output_text", text: "Checking." }] },
      { type: "function_call", name: "lookup", call_id: "c9", arguments: "{\"q\":1}" },
    ]);
  });

  it("treats truncated or missing choices as incomplete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "partial" } }] }))));
    await expect(requestCopilotModel([], [], AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "copilot_invalid_response" });
    expect(fromChatCompletion({})).toEqual({ status: "incomplete", output: [] });
  });

  it("groups consecutive tool calls into one assistant message", () => {
    expect(toChatMessages([
      { type: "function_call", name: "a", call_id: "1", arguments: "{}" },
      { type: "function_call", name: "b", call_id: "2", arguments: "{}" },
      { type: "function_call_output", call_id: "1", output: "x" },
      { type: "function_call_output", call_id: "2", output: "y" },
    ])).toEqual([
      { role: "assistant", content: null, tool_calls: [
        { id: "1", type: "function", function: { name: "a", arguments: "{}" } },
        { id: "2", type: "function", function: { name: "b", arguments: "{}" } },
      ] },
      { role: "tool", tool_call_id: "1", content: "x" },
      { role: "tool", tool_call_id: "2", content: "y" },
    ]);
  });
});
