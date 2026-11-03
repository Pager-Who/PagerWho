import { CopilotModelResponseSchema, type CopilotApiFormat } from "@im/contracts";

import { HttpError } from "../http/errors/http-error";
import { assertCopilotTokenBudget, recordCopilotTokens } from "./copilot-usage";

/*
 * Copilot talks to any LLM provider that exposes an OpenAI-compatible API.
 * Internally every planner speaks the Responses API item format
 * (message / function_call / function_call_output); the chat-completions
 * adapter translates to and from /chat/completions at this boundary only.
 */

const MAX_OUTPUT_TOKENS = 4096;
// Keys the adapters own. COPILOT_EXTRA_BODY must not override them.
const RESERVED_BODY_KEYS = new Set([
  "input", "max_completion_tokens", "max_output_tokens", "max_tokens", "messages", "model", "store", "stream", "tool_choice", "tools",
]);

export type CopilotModelConfig = {
  apiFormat: CopilotApiFormat;
  apiKey: string;
  baseUrl: string;
  extraBody: Record<string, unknown>;
  model: string;
};

export type CopilotConfigState =
  | { status: "configured"; config: CopilotModelConfig }
  | { status: "disabled" }
  | { status: "invalid"; problems: string[] };

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

/** Reads the COPILOT_* model provider settings. */
export function readCopilotConfig(): CopilotConfigState {
  const apiKey = env("COPILOT_API_KEY");
  const baseUrl = env("COPILOT_BASE_URL");
  const model = env("COPILOT_MODEL");
  const rawFormat = env("COPILOT_API_FORMAT") ?? "responses";
  const rawExtraBody = env("COPILOT_EXTRA_BODY");

  // Format/extra-body defaults alone do not enable Copilot; a key, endpoint or model signals intent.
  if (!apiKey && !baseUrl && !model) return { status: "disabled" };

  const problems: string[] = [];
  if (!apiKey) problems.push("COPILOT_API_KEY is required.");
  if (!model) problems.push("COPILOT_MODEL is required.");
  if (rawFormat !== "responses" && rawFormat !== "chat-completions") {
    problems.push("COPILOT_API_FORMAT must be responses or chat-completions.");
  }
  if (!baseUrl) problems.push("COPILOT_BASE_URL is required.");
  else {
    let url: URL | undefined;
    try { url = new URL(baseUrl); } catch { problems.push("COPILOT_BASE_URL must be an absolute URL."); }
    if (url && url.protocol !== "https:" && !(url.protocol === "http:" && env("COPILOT_ALLOW_INSECURE_HTTP") === "true")) {
      problems.push("COPILOT_BASE_URL must use HTTPS. Set COPILOT_ALLOW_INSECURE_HTTP=true only for a trusted local or private-network model server.");
    }
  }

  let extraBody: Record<string, unknown> = {};
  if (rawExtraBody) {
    try {
      const parsed: unknown = JSON.parse(rawExtraBody);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      extraBody = parsed as Record<string, unknown>;
      const reserved = Object.keys(extraBody).filter((key) => RESERVED_BODY_KEYS.has(key));
      if (reserved.length) problems.push(`COPILOT_EXTRA_BODY cannot set ${reserved.join(", ")}.`);
    } catch {
      problems.push("COPILOT_EXTRA_BODY must be a JSON object.");
    }
  }

  if (problems.length) return { status: "invalid", problems };
  return { status: "configured", config: { apiFormat: rawFormat as CopilotApiFormat, apiKey: apiKey!, baseUrl: baseUrl!.replace(/\/+$/, ""), extraBody, model: model! } };
}

export function isCopilotConfigured() {
  return readCopilotConfig().status === "configured";
}

export function getCopilotModel() {
  const state = readCopilotConfig();
  return state.status === "configured" ? state.config.model : undefined;
}

export function getCopilotApiFormat() {
  const state = readCopilotConfig();
  return state.status === "configured" ? state.config.apiFormat : undefined;
}

export function copilotNotConfiguredError() {
  return new HttpError(503, "copilot_not_configured", "Copilot is not configured on this server.");
}

type ToolDefinition = { type: "function"; name: string; description?: string; parameters?: unknown };
type ChatMessage = Record<string, unknown> & { role: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function textOf(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    const record = asRecord(part);
    return typeof record?.text === "string" ? record.text : "";
  }).join("");
}

/** Converts Responses-style input items into Chat Completions messages. */
export function toChatMessages(input: unknown[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const entry of input) {
    const item = asRecord(entry);
    if (!item) continue;
    if (item.type === "function_call") {
      const call = { id: String(item.call_id), type: "function", function: { name: String(item.name), arguments: String(item.arguments ?? "{}") } };
      const previous = messages.at(-1);
      // Parallel calls from one model turn belong to a single assistant message.
      if (previous?.role === "assistant" && Array.isArray(previous.tool_calls)) previous.tool_calls.push(call);
      else messages.push({ role: "assistant", content: null, tool_calls: [call] });
    } else if (item.type === "function_call_output") {
      messages.push({ role: "tool", tool_call_id: String(item.call_id), content: String(item.output ?? "") });
    } else if (typeof item.role === "string") {
      messages.push({ role: item.role === "developer" ? "system" : item.role, content: textOf(item.content) });
    }
  }
  return messages;
}

function toChatTools(tools: unknown[]) {
  return tools.map((tool) => {
    const { name, description, parameters } = tool as ToolDefinition;
    return { type: "function", function: { name, ...(description ? { description } : {}), ...(parameters ? { parameters } : {}) } };
  });
}

/** Converts a Chat Completions response into the Responses output shape the planners consume. */
export function fromChatCompletion(body: unknown) {
  const choice = asRecord(Array.isArray(asRecord(body)?.choices) ? (asRecord(body)!.choices as unknown[])[0] : undefined);
  const message = asRecord(choice?.message);
  if (!choice || !message) return { status: "incomplete", output: [] };
  const output: unknown[] = [];
  const text = textOf(message.content);
  if (text) output.push({ type: "message", content: [{ type: "output_text", text }] });
  for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    const record = asRecord(call);
    const fn = asRecord(record?.function);
    if (!record || !fn) continue;
    output.push({ type: "function_call", name: String(fn.name ?? ""), call_id: String(record.id ?? ""), arguments: String(fn.arguments ?? "{}") });
  }
  return { status: choice.finish_reason === "length" || choice.finish_reason === "content_filter" ? "incomplete" : "completed", output };
}

function buildRequest(config: CopilotModelConfig, input: unknown[], tools: unknown[], requiredTool?: string) {
  if (config.apiFormat === "chat-completions") {
    return { path: "/chat/completions", body: {
      ...config.extraBody, model: config.model, messages: toChatMessages(input),
      ...(tools.length ? { tools: toChatTools(tools) } : {}),
      ...(requiredTool ? { tool_choice: { type: "function", function: { name: requiredTool } } } : {}),
      max_tokens: MAX_OUTPUT_TOKENS,
    } };
  }
  return { path: "/responses", body: {
    ...config.extraBody, model: config.model, input, store: false,
    ...(tools.length ? { tools } : {}),
    ...(requiredTool ? { tool_choice: { type: "function", name: requiredTool } } : {}),
    max_output_tokens: MAX_OUTPUT_TOKENS,
  } };
}

// Provider usage when reported; otherwise a conservative estimate so missing usage cannot bypass the budget.
function billedTokens(body: unknown, requestBody: string) {
  const usage = asRecord(asRecord(body)?.usage);
  if (usage) {
    const input = usage.input_tokens ?? usage.prompt_tokens;
    const output = usage.output_tokens ?? usage.completion_tokens;
    if (typeof input === "number" && typeof output === "number" && input >= 0 && output >= 0) return Math.ceil(input + output);
  }
  return Math.ceil(requestBody.length / 2) + MAX_OUTPUT_TOKENS;
}

/** Pass workspaceId for every user-triggered call so the shared project/global token budget applies. */
export async function requestCopilotModel(input: unknown[], tools: unknown[], signal: AbortSignal, requiredTool?: string, workspaceId?: string) {
  const state = readCopilotConfig();
  if (state.status !== "configured") throw copilotNotConfiguredError();
  if (workspaceId) await assertCopilotTokenBudget(workspaceId);
  const { config } = state;

  try {
    const request = buildRequest(config, input, tools, requiredTool);
    const requestBody = JSON.stringify(request.body);
    const response = await fetch(`${config.baseUrl}${request.path}`, {
      method: "POST",
      redirect: "error",
      signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: requestBody,
    });
    if (!response.ok) {
      // Provider error bodies can echo input or credentials. Never expose them.
      throw new HttpError(502, "copilot_provider_error", "Copilot provider request failed. Check server API configuration.");
    }
    const body: unknown = await response.json();
    if (workspaceId) await recordCopilotTokens(workspaceId, billedTokens(body, requestBody));
    const parsed = CopilotModelResponseSchema.safeParse(config.apiFormat === "chat-completions" ? fromChatCompletion(body) : body);
    if (!parsed.success || (parsed.data.status && parsed.data.status !== "completed")) {
      throw new HttpError(502, "copilot_invalid_response", "Copilot returned an incomplete or invalid response. Please try again.");
    }
    return parsed.data.output;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "copilot_unavailable", "Copilot is temporarily unavailable. Please try again.");
  }
}
