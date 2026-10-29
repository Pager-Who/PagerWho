import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockEscalationPolicyCreateFlow } from "./support/escalation-policy-mocks";
import { e2eWorkspaceId } from "./support/test-data";

test("creates a repeating escalation policy with on-call steps", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockEscalationPolicyCreateFlow(page);

  await page.goto("/escalation-policies");

  await expect(page.getByRole("heading", { exact: true, name: "Escalation policies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New policy" })).toBeVisible();

  await page.getByLabel("Name").fill("Checkout escalation");

  const scheduleSelects = page.getByRole("combobox", { name: /^Schedule\b/ });
  await scheduleSelects.first().selectOption({ index: 1 });
  await scheduleSelects.nth(1).selectOption({ index: 1 });

  await expect(page.getByText("Checkout responders · Primary responder")).toBeVisible();
  await expect(page.getByText("Checkout responders · Secondary responder")).toBeVisible();
  await expect(page.getByText("repeat 3")).toBeVisible();

  await page.getByRole("button", { name: "Create policy" }).click();

  await expect(page.getByRole("heading", { name: "Checkout escalation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(page.getByText("Repeats until ack or resolve")).toBeVisible();
  await expect(page.getByText("Every 10m")).toBeVisible();
  await expect(page.getByText("Checkout responders · Primary responder")).toBeVisible();
  await expect(page.getByText("Checkout responders · Secondary responder")).toBeVisible();
  await expect(page.getByText("After 5m")).toBeVisible();
});
