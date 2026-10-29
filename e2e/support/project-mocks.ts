import type { Page } from "@playwright/test";
import { apiPattern, fulfillJson, fulfillUnhandledApi } from "./api";
import {
  e2eInviteId,
  e2eInvitedWorkspace,
  e2eNow,
  e2ePendingInvite,
  e2eUserId,
  e2eWorkspaceId,
} from "./test-data";

export async function mockProjectInviteFlow(page: Page) {
  let accepted = false;

  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path === "/api/v1/me/workspaces") {
      return fulfillJson(route, {
        data: accepted ? [e2eInvitedWorkspace] : [],
      });
    }

    if (method === "GET" && path === "/api/v1/me/invites") {
      return fulfillJson(route, {
        data: accepted ? [] : [e2ePendingInvite],
      });
    }

    if (method === "POST" && path === `/api/v1/me/invites/${e2eInviteId}/accept`) {
      accepted = true;

      return fulfillJson(route, {
        data: {
          workspace_id: e2eWorkspaceId,
          user_id: e2eUserId,
          role: "responder",
          created_at: e2eNow,
          updated_at: e2eNow,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/incidents") {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/services") {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    return fulfillUnhandledApi(route);
  });
}
