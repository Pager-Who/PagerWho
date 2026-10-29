import type {
  CreateEscalationPolicyRequest,
  EscalationPolicy,
  UpdateEscalationPolicyRequest,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createEscalationApi(client: ApiClient) {
  return {
    listEscalationPolicies(filters: { workspace_id?: string } = {}) {
      return client.request<EscalationPolicy[]>(`/escalation-policies${buildQueryString(filters)}`);
    },
    getEscalationPolicy(policyId: string) {
      return client.request<EscalationPolicy>(`/escalation-policies/${policyId}`);
    },
    createEscalationPolicy(input: CreateEscalationPolicyRequest) {
      return client.request<EscalationPolicy>("/escalation-policies", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    updateEscalationPolicy(policyId: string, input: UpdateEscalationPolicyRequest) {
      return client.request<EscalationPolicy>(`/escalation-policies/${policyId}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
    },
    deleteEscalationPolicy(policyId: string) {
      return client.request<EscalationPolicy>(`/escalation-policies/${policyId}`, {
        method: "DELETE",
      });
    },
  };
}

function buildQueryString(filters: Record<string, unknown>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  return query.size > 0 ? `?${query.toString()}` : "";
}
