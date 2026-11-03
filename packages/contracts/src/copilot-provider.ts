import { z } from "zod";

import { CopilotActionSchema } from "./copilot";

// Validate the external provider boundary before using model output.
// Chat Completions responses are converted into this Responses-style shape first.
export const CopilotModelResponseSchema = z.object({
  status: z.string().optional(),
  output: z.array(z.union([
    z.object({ type: z.literal("function_call"), name: z.string(), call_id: z.string(), arguments: z.string().max(40_000) }),
    z.object({ type: z.literal("message"), content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }),
    z.object({ type: z.literal("reasoning") }),
  ])).max(20),
});

const ModelDateTimeSchema = z.string().datetime({ offset: true });

function normalizeModelAction(value: unknown) {
  if (typeof value === "object" && value !== null) {
    value = Object.fromEntries(Object.entries(value).filter(([key, entry]) => !(key.endsWith("_action_id") && entry === null)));
  }
  if (typeof value === "object" && value !== null && "type" in value
    && ["create_service", "create_on_call_schedule", "create_escalation_policy"].includes(String(value.type))
    && "workspace_id" in value && "input" in value && typeof value.input === "object" && value.input !== null) {
    // Preserve the explicit project ID when a provider places it beside input.
    // Conflicting IDs must fail validation rather than silently selecting either one.
    if ("workspace_id" in value.input && value.input.workspace_id !== value.workspace_id) return null;
    value = { ...value, input: { ...value.input, workspace_id: value.workspace_id } };
  }
  if (typeof value !== "object" || value === null || !("input" in value)
    || typeof value.input !== "object" || value.input === null
    || !("rotations" in value.input) || !Array.isArray(value.input.rotations)) return value;
  return { ...value, input: { ...value.input, rotations: value.input.rotations.map((rotation: unknown) => {
    if (typeof rotation !== "object" || rotation === null || !("starts_at" in rotation)) return rotation;
    const date = ModelDateTimeSchema.safeParse(rotation.starts_at);
    // REST contracts require UTC. Preserve the instant supplied with an explicit offset.
    return date.success && Number.isFinite(Date.parse(date.data))
      ? { ...rotation, starts_at: new Date(date.data).toISOString() } : rotation;
  }) } };
}

export const CopilotSettingsDraftSchema = z.object({
  summary: z.string().min(1).max(2000),
  goal: z.string().min(1).max(1000),
  actions: z.preprocess((value) => Array.isArray(value) ? value.filter((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return true;
    const fields = Object.entries(entry);
    // Some providers append an empty reference placeholder. It cannot represent an action.
    return !(fields.length > 0 && fields.every(([key, field]) => key.endsWith("_action_id") && field === null));
  }) : value, z.array(z.preprocess(normalizeModelAction, CopilotActionSchema)).min(1).max(8)),
});
