import type { CreateTeamMemberRequest, CreateTeamRequest, Team, TeamMember } from "@im/contracts";

import type { ApiClient } from "./client";

export function createTeamApi(client: ApiClient) {
  return {
    listTeams(filters: { workspace_id?: string } = {}) {
      return client.request<Team[]>(`/teams${buildQueryString(filters)}`);
    },
    createTeam(input: CreateTeamRequest) {
      return client.request<Team>("/teams", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    listTeamMembers(teamId: string) {
      return client.request<TeamMember[]>(`/teams/${teamId}/members`);
    },
    addTeamMember(teamId: string, input: CreateTeamMemberRequest) {
      return client.request<TeamMember>(`/teams/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    removeTeamMember(teamId: string, userId: string) {
      return client.request<TeamMember>(`/teams/${teamId}/members/${userId}`, {
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
