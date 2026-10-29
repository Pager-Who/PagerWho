import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockIncidentLifecycleFlow } from "./support/incident-mocks";
import { e2eServiceId, e2eWorkspaceId } from "./support/test-data";

test("creates, acknowledges, and resolves a manual incident", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page);

  await page.goto("/incidents");

  await expect(page.getByRole("heading", { exact: true, name: "Incidents" })).toBeVisible();

  await page.getByRole("button", { name: "New incident" }).first().click();

  const createForm = page.locator("form").filter({ hasText: "New incident" });
  await createForm.getByLabel("Title").fill("Checkout API latency");
  await createForm.getByLabel("Service").selectOption(e2eServiceId);
  await createForm.getByLabel("Priority").selectOption("P1");
  await createForm.getByLabel("Severity").selectOption("critical");
  await createForm.getByLabel("Description").fill("p95 latency is above the customer checkout threshold.");
  await createForm.getByRole("button", { name: "Create incident" }).click();

  await expect(page).toHaveURL(/\/incidents\/00000000-0000-4000-8000-000000000401$/);
  await expect(page.getByRole("heading", { name: "Checkout API latency" })).toBeVisible();
  await expect(page.getByText("triggered", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Acknowledge" }).click();

  await expect(page.getByRole("button", { name: "Acknowledge" })).toBeHidden();
  await expect(page.getByText("acknowledged", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Resolve" }).click();

  await expect(page.getByRole("button", { name: "Resolve" })).toBeHidden();
  await expect(page.getByText("resolved", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "← Incidents" }).click();

  await expect(page).toHaveURL(/\/incidents$/);
  await expect(page.getByText("No triggered or acknowledged incidents need attention.")).toBeVisible();

  await page.getByRole("button", { name: /Resolved/ }).click();

  await expect(page.getByRole("row", { name: /Checkout API latency/ })).toBeVisible();
});
