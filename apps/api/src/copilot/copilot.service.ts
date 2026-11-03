import type {
  CopilotAskResponse,
  CopilotClarificationSubmission,
  CopilotConversationMessage,
  CopilotLocale,
  CopilotStatusResponse,
} from "@im/contracts";

import { normalizeCopilotLocale } from "./copilot.locale";
import { readCopilotConfig } from "./model-client";
import { planCopilotSettings } from "./copilot-settings";

export async function getCopilotStatus(): Promise<CopilotStatusResponse> {
  const state = readCopilotConfig();
  const config = state.status === "configured" ? state.config : undefined;
  return { available: Boolean(config), checked_at: new Date().toISOString(), api_format: config?.apiFormat ?? null, model: config?.model ?? null,
    message: config ? "Configuration status only; availability is verified on the next request."
      : "Copilot is not configured on this server." };
}

export async function answerCopilotQuestion(
  question: string,
  history: CopilotConversationMessage[] = [],
  context: {
    actorUserId?: string | undefined;
    docsVersion?: string | undefined;
    locale?: CopilotLocale | undefined;
    structuredInput?: CopilotClarificationSubmission | undefined;
    workspaceId?: string | undefined;
  } = {},
): Promise<CopilotAskResponse> {
  if (!context.actorUserId) throw new Error("Authentication required");
  return planCopilotSettings({ question, history, locale: normalizeCopilotLocale(context.locale), workspace_id: context.workspaceId,
    structured_input: context.structuredInput, docs_version: context.docsVersion }, context.actorUserId);
}
