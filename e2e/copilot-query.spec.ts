import { expect, test } from "@playwright/test";

import { authenticateSession } from "./support/auth";
import { apiPattern, fulfillJson, fulfillUnhandledApi, mockCopilotAvailable } from "./support/api";
import { e2eActiveWorkspace, e2eWorkspaceId } from "./support/test-data";

const incidentId = "44444444-4444-4444-8444-444444444444";

test("Copilot displays query evidence and keeps the cursor in the next question", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await page.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname === "/api/v1/me/workspaces")
      return fulfillJson(route, { data: [e2eActiveWorkspace] });
    if (route.request().method() === "POST" && url.pathname === "/api/v1/copilot/ask") {
      return fulfillJson(route, { data: {
        answer: "One open incident is shown. More results are available.", kind: "message", mode: "ai",
        sources: [{ path: `/incidents/${incidentId}`, title: "Checkout alert", snippet: "triggered; high" }],
        query_receipts: [{ operation: "list_project_incidents", queried_at: "2030-01-07T00:00:00Z",
          at: "2030-01-07T00:00:00Z", timezone: "UTC", local_time: "2030-01-07 00:00:00",
          scope: `project:${e2eWorkspaceId}; status:open; limit:1`, returned_count: 1, has_more: true,
          next_cursor: "opaque-cursor", delivery_verified: false }],
      } });
    }
    return fulfillUnhandledApi(route);
  });
  await mockCopilotAvailable(page);
  await page.goto("/overview");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Copilot", exact: true });
  const composer = panel.getByRole("textbox", { name: "Ask Copilot", exact: true });
  await composer.fill("Show open incidents");
  await composer.press("Enter");
  await expect(panel.getByRole("link", { name: "Checkout alert" })).toHaveAttribute("href", `/incidents/${incidentId}`);
  await panel.getByText("Query details").click();
  await expect(panel.getByText(`project:${e2eWorkspaceId}; status:open; limit:1`)).toBeVisible();
  await expect(panel.getByText(/Partial results/)).toBeVisible();
  await composer.fill("Next page");
  const nextRequest = page.waitForRequest((request) => request.method() === "POST"
    && new URL(request.url()).pathname === "/api/v1/copilot/ask"
    && (request.postDataJSON() as { question?: string }).question === "Next page");
  await composer.press("Enter");
  const body = (await nextRequest).postDataJSON() as { history?: Array<{ content: string }> };
  expect(body.history?.some((message) => message.content.includes("opaque-cursor"))).toBe(true);
});
