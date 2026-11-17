import "dotenv/config";
import console from "node:console";
import process from "node:process";

import { getCopilotModel, isCopilotConfigured, requestCopilotModel } from "../src/copilot/model-client.ts";

// Uses synthetic data only. Does not connect to the application database.
if (!isCopilotConfigured()) {
  console.error("Copilot model provider is not configured. Set COPILOT_* in apps/api/.env.");
  process.exit(1);
}

const tools = [{
  type: "function",
  name: "get_test_settings",
  description: "Returns synthetic settings for a connectivity test.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
}];

try {
  const input = [{ role: "user", content: "Call get_test_settings exactly once. After receiving its result, answer OK. This is a synthetic connectivity test." }];
  const output = await requestCopilotModel(input, tools, globalThis.AbortSignal.timeout(45_000));
  const calls = output.filter((item) => item.type === "function_call");
  console.log(JSON.stringify({ model: getCopilotModel(), connected: true, toolCalls: calls.map((call) => call.name) }));
  if (calls.length !== 1 || calls[0].name !== "get_test_settings") throw new Error("Expected test tool call was not returned.");
  const call = calls[0];
  input.push(
    { type: "function_call", name: call.name, arguments: call.arguments, call_id: call.call_id },
    { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ configured: true, synthetic: true }) },
  );
  const final = await requestCopilotModel(input, tools, globalThis.AbortSignal.timeout(45_000));
  const completed = final.some((item) => item.type === "message") && !final.some((item) => item.type === "function_call");
  console.log(JSON.stringify({ toolResultAccepted: completed }));
  if (!completed) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ code: error.code ?? "connectivity_test_failed", message: error.message }));
  process.exitCode = 1;
}
