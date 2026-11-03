import type {
  CopilotAskRequest,
  CopilotAskResponse,
  CopilotExecuteRequest,
  CopilotExecuteResponse,
  CopilotStatusResponse,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createCopilotApi(client: ApiClient) {
  return {
    ask(input: CopilotAskRequest) {
      return client.request<CopilotAskResponse>("/copilot/ask", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    execute(input: CopilotExecuteRequest) {
      return client.request<CopilotExecuteResponse>("/copilot/execute", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    status() {
      return client.request<CopilotStatusResponse>("/copilot/status");
    },
  };
}
