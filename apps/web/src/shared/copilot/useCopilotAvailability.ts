import { useQuery } from "@tanstack/react-query";

import { copilotApi } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import { useAuth } from "../auth";

export type CopilotAvailability = "available" | "checking" | "not_configured";

/**
 * Copilot is optional and needs a server-configured model provider.
 * Copilot entry points stay visible; until the server reports a configured
 * provider they show setup guidance instead of sending requests.
 */
export function useCopilotAvailability(): CopilotAvailability {
  const { isAuthenticated } = useAuth();
  const status = useQuery({
    enabled: isAuthenticated,
    queryKey: queryKeys.copilot.status(),
    queryFn: () => copilotApi.status(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (status.data?.available === true) return "available";
  return status.isPending && isAuthenticated ? "checking" : "not_configured";
}
