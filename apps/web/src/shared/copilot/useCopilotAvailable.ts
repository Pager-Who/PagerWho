import { useQuery } from "@tanstack/react-query";

import { copilotApi } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import { useAuth } from "../auth";

/**
 * Copilot is optional and needs a server-configured model provider.
 * Fails closed: while loading, on error, or when unconfigured, Copilot UI stays hidden.
 */
export function useCopilotAvailable() {
  const { isAuthenticated } = useAuth();
  const status = useQuery({
    enabled: isAuthenticated,
    queryKey: queryKeys.copilot.status(),
    queryFn: () => copilotApi.status(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  return status.data?.available === true;
}
