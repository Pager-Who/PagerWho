import type { Route } from "@playwright/test";

import { e2eUserId } from "./test-data";

export const apiPattern = "**/api/v1/**";

export async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

export async function fulfillUnhandledApi(route: Route) {
  const request = route.request();
  const url = new URL(request.url());

  if (request.method() === "GET" && url.pathname === "/api/v1/auth/me") {
    await fulfillJson(route, {
      data: {
        auth_source: "session",
        is_platform_admin: false,
        platform_roles: [],
        user: {
          email: "responder@example.com",
          email_verified: true,
          id: e2eUserId,
          name: "Responder",
        },
      },
    });
    return;
  }

  if (request.method() === "GET" && /\/api\/v1\/workspaces\/[^/]+\/usage$/.test(url.pathname)) {
    await fulfillJson(route, {
      data: {
        quota_settings: {
          quota_overrides: [],
          updated_at: null,
          updated_by_user_id: null,
        },
        exceeded: {
          workspaces: false,
          members: false,
          services: false,
          on_call_schedules: false,
          escalation_policies: false,
        },
        limits: {
          workspaces: null,
          members: null,
          services: null,
          on_call_schedules: null,
          escalation_policies: null,
          retention_days: 365,
        },
        usage: {
          workspaces: 1,
          members: 1,
          active_members: 1,
          pending_invites: 0,
          services: 0,
          on_call_schedules: 0,
          escalation_policies: 0,
        },
        workspace_id: url.pathname.split("/")[4],
      },
    });
    return;
  }

  await fulfillJson(
    route,
    {
      error: {
        code: "not_mocked",
        message: `No E2E mock for ${request.method()} ${url.pathname}`,
        request_id: "e2e",
      },
    },
    404,
  );
}
