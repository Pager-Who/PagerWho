import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockServiceWebhookFlow } from "./support/service-webhook-mocks";
import { e2eServiceId, e2eWorkspaceId } from "./support/test-data";

test("sends a service webhook test event and opens the created incident", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockServiceWebhookFlow(page);

  await page.goto(`/services/${e2eServiceId}`);

  await expect(page.getByRole("heading", { name: "Checkout API" })).toBeVisible();

  await page.getByRole("tab", { name: "Webhook" }).click();

  await expect(page.getByText("Service webhook", { exact: true })).toBeVisible();
  await expect(page.getByText("Test webhook", { exact: true })).toBeVisible();
  await expect(page.getByText(/\/api\/v1\/webhooks\/00000000-0000-4000-8000-000000000601/)).toBeVisible();

  await page.getByRole("textbox", { name: "Payload JSON", exact: true }).fill(JSON.stringify({
    title: "Checkout API latency spike",
    description: "p95 latency is above threshold from E2E webhook.",
    severity: "critical",
    priority: "P1",
    event_key: "service-webhook-smoke-e2e",
    source: "service-detail-test",
  }, null, 2));
  await page.getByRole("button", { name: "Send test webhook" }).click();

  await expect(page.getByText("Webhook accepted")).toBeVisible();
  await expect(page.getByText("created", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Checkout API latency spike" })).toBeVisible();

  await page.getByRole("link", { name: "Checkout API latency spike" }).click();

  await expect(page).toHaveURL(/\/incidents\/00000000-0000-4000-8000-000000000401$/);
  await expect(page.getByRole("heading", { name: "Checkout API latency spike" })).toBeVisible();
  await expect(page.getByText("triggered", { exact: true }).first()).toBeVisible();
});
