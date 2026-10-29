import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockOnCallOverrideCreateFlow } from "./support/on-call-mocks";
import { e2eWorkspaceId } from "./support/test-data";

test("creates a schedule override for an existing on-call schedule", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockOnCallOverrideCreateFlow(page);

  await page.goto("/on-call");

  await expect(page.getByRole("heading", { exact: true, name: "On-call" })).toBeVisible();
  await expect(page.getByText("Checkout responders").first()).toBeVisible();

  await page.getByRole("tab", { name: /Overrides/ }).click();

  await expect(page.getByRole("heading", { name: "Create an override" })).toBeVisible();
  const overrideForm = page.locator("form").filter({ hasText: "Temporary coverage change" });
  await overrideForm.getByLabel("Schedule").selectOption({ label: "Checkout responders" });
  await overrideForm.getByLabel("Layer").selectOption("primary");
  await overrideForm.getByLabel("User").selectOption({ label: "Secondary Responder" });
  await overrideForm.getByLabel("Starts at").fill("2026-06-16T10:00");
  await overrideForm.getByLabel("Ends at").fill("2026-06-16T12:00");

  await overrideForm.getByRole("button", { name: "Create override" }).click();

  await expect(page.getByRole("tab", { name: /Overrides 1/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Checkout responders primary Secondary Responder/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Jun 16, 2026/ })).toBeVisible();
});
