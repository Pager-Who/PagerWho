import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockIncidentLifecycleFlow } from "./support/incident-mocks";
import { e2eIncidentId, e2eWorkspaceId } from "./support/test-data";

test("reviews incident history and runs manual escalation actions", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page, { seedIncident: true });

  await page.goto(`/incidents/${e2eIncidentId}`);

  await expect(page.getByRole("heading", { name: "Checkout API is failing" })).toBeVisible();

  await page.getByRole("tab", { name: /Timeline/ }).click();
  await expect(page.getByText("incident_created", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /Notifications/ }).click();
  await expect(page.getByText("No notifications", { exact: true })).toBeVisible();
  await expect(page.getByText("No notifications have been recorded.", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Escalation" }).click();
  await expect(page.getByRole("heading", { name: "Manual escalation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run current step" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Escalate next step" })).toBeVisible();

  await page.getByLabel("Reason").fill("Primary responder did not confirm ownership.");
  await page.getByRole("button", { name: "Run current step" }).click();
  await expect(page.getByRole("button", { name: "Run current step" })).toBeVisible();

  await page.getByRole("button", { name: "Escalate next step" }).click();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

  await page.getByRole("tab", { name: /Timeline/ }).click();
  await expect(page.getByText("manual_escalation", { exact: true }).first()).toBeVisible();
});
