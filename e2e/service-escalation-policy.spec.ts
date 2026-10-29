import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockServiceEscalationPolicyFlow } from "./support/service-escalation-mocks";
import { e2eWorkspaceId } from "./support/test-data";

test("connects a service to an escalation policy and shows responder targets", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockServiceEscalationPolicyFlow(page);

  await page.goto("/services/00000000-0000-4000-8000-000000000301");

  await expect(page.getByRole("heading", { name: "Checkout API" })).toBeVisible();

  await page.getByRole("tab", { name: "Escalation" }).click();

  await expect(page.getByText("Select an escalation policy for this service.")).toBeVisible();

  await page.getByLabel("Escalation policy").selectOption({ label: "Checkout escalation" });

  await expect(page.getByText("Checkout responders · Primary responder").first()).toBeVisible();
  await expect(page.getByText("Checkout responders · Secondary responder").first()).toBeVisible();
  const responderTargets = page.getByRole("heading", { name: "Responder targets" }).locator("xpath=ancestor::section[1]");
  await expect(responderTargets.getByText("Primary Responder", { exact: true })).toBeVisible();
  await expect(responderTargets.getByText("Secondary Responder", { exact: true })).toBeVisible();
  await expect(page.getByText("After 5m")).toBeVisible();

  await page.getByRole("tab", { name: "Overview" }).click();

  await expect(page.getByText("Checkout escalation").first()).toBeVisible();
});
