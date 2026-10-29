import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockIncidentLifecycleFlow } from "./support/incident-mocks";
import { e2eWorkspaceId } from "./support/test-data";

test("responds to an active incident from the overview", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page, { seedIncident: true });
  let triageRequestCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/incidents/") && request.url().endsWith("/triage")) {
      triageRequestCount += 1;
    }
  });

  await page.goto("/overview");

  await expect(page.getByRole("heading", { exact: true, name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { exact: true, name: "Active response" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Checkout API is failing/ })).toBeVisible();

  const actionCenterButton = page.getByRole("button", { name: /Action Center, 1 operational item/ });
  await actionCenterButton.click();
  const actionCenter = page.getByRole("dialog", { name: "Action Center" });
  await expect(actionCenter).toBeVisible();
  await expect(actionCenter.getByText(/Open incidents/)).toBeVisible();
  await expect(actionCenter.getByText("Checkout API is failing", { exact: true })).toBeVisible();
  await actionCenterButton.click();

  await page.getByRole("link", { name: /Checkout API is failing/ }).click();
  await expect(page).toHaveURL(/\/incidents\/00000000-0000-4000-8000-000000000401$/);
  await expect(page.getByRole("heading", { name: "Checkout API is failing" })).toBeVisible();
  expect(triageRequestCount).toBe(0);

  await page.getByRole("button", { name: "Change priority" }).click();
  await page.getByLabel("New priority").selectOption("P2");
  await page.getByRole("button", { name: "Save priority" }).click();
  await expect(page.getByText("P2", { exact: true }).first()).toBeVisible();

  await page.getByRole("tab", { name: /Timeline/ }).click();
  await expect(page.getByText("incident_priority_changed", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /Overview/ }).click();

  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("acknowledged", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("resolved", { exact: true }).first()).toBeVisible();

  await page.goto("/overview");
  await expect(page.getByText("Response queue is clear", { exact: true })).toBeVisible();
  await expect(page.getByText("No open incidents in the selected project.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Action Center" }).click();
  await expect(page.getByRole("dialog", { name: "Action Center" })).toContainText("Nothing needs attention");
});
