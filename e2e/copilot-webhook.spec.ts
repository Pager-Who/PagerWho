import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { apiPattern, fulfillJson, fulfillUnhandledApi, mockCopilotAvailable } from "./support/api";
import { e2eActiveWorkspace, e2eWorkspaceId } from "./support/test-data";

test("Copilot labels webhook payload advice as an untested preview", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await page.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname === "/api/v1/me/workspaces")
      return fulfillJson(route, { data: [e2eActiveWorkspace] });
    if (route.request().method() === "POST" && url.pathname === "/api/v1/copilot/ask")
      return fulfillJson(route, { data: {
        answer: "Add a title to the JSON payload. Copy the endpoint from the service settings.", kind: "message", mode: "ai",
        sources: [{ path: "/services", title: "Service webhooks", snippet: "Copy the enabled endpoint URL." }],
        query_receipts: [{ operation: "inspect_webhook_payload", queried_at: "2030-01-07T00:00:00Z",
          at: "2030-01-07T00:00:00Z", timezone: "UTC", local_time: "2030-01-07 00:00:00",
          scope: `project:${e2eWorkspaceId}; sample:present; format:generic`, returned_count: 1,
          has_more: false, delivery_verified: false }],
      } });
    return fulfillUnhandledApi(route);
  });
  await mockCopilotAvailable(page);
  await page.goto("/overview");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Copilot", exact: true });
  const composer = panel.getByRole("textbox", { name: "Ask Copilot", exact: true });
  await composer.fill('Check webhook payload {"severity":"high"}');
  await composer.press("Enter");
  await expect(panel.getByText("This checks payload format only. No webhook request or incident was created.")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Service webhooks" })).toHaveAttribute("href", "/services");
});
