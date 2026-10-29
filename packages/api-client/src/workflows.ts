import type {
  CreateWorkflowRequest,
  PaginatedWorkflowRuns,
  PaginatedWorkflows,
  UpdateWorkflowRequest,
  Workflow,
  WorkflowListQuery,
  WorkflowRun,
  WorkflowRunListQuery,
  WorkflowTestRunRequest,
  WorkflowTriggerCatalog,
} from "@im/contracts";

import type { ApiClient } from "./client";

export function createWorkflowApi(client: ApiClient) {
  return {
    listTriggers() {
      return client.request<WorkflowTriggerCatalog>("/workflows/triggers");
    },
    listWorkflows(query: Partial<WorkflowListQuery> = {}) {
      return client.request<PaginatedWorkflows>(`/workflows${buildQueryString(query)}`);
    },
    createWorkflow(input: CreateWorkflowRequest) {
      return client.request<Workflow>("/workflows", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    getWorkflow(workflowId: string) {
      return client.request<Workflow>(`/workflows/${workflowId}`);
    },
    updateWorkflow(workflowId: string, input: UpdateWorkflowRequest) {
      return client.request<Workflow>(`/workflows/${workflowId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    deleteWorkflow(workflowId: string) {
      return client.request<Workflow>(`/workflows/${workflowId}`, {
        method: "DELETE",
      });
    },
    enableWorkflow(workflowId: string) {
      return client.request<Workflow>(`/workflows/${workflowId}/enable`, {
        method: "POST",
      });
    },
    disableWorkflow(workflowId: string) {
      return client.request<Workflow>(`/workflows/${workflowId}/disable`, {
        method: "POST",
      });
    },
    testWorkflow(workflowId: string, input: WorkflowTestRunRequest = {}) {
      return client.request<WorkflowRun>(`/workflows/${workflowId}/test`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    listWorkflowRuns(workflowId: string, query: Partial<WorkflowRunListQuery> = {}) {
      return client.request<PaginatedWorkflowRuns>(`/workflows/${workflowId}/runs${buildQueryString(query)}`);
    },
    getWorkflowRun(runId: string) {
      return client.request<WorkflowRun>(`/workflow-runs/${runId}`);
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
