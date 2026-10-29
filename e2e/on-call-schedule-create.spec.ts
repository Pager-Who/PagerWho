import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockOnCallScheduleCreateFlow } from "./support/on-call-mocks";
import { e2eWorkspaceId } from "./support/test-data";

test("creates an on-call schedule with primary and secondary rotations", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockOnCallScheduleCreateFlow(page);

  await page.goto("/on-call");

  await expect(page.getByRole("heading", { exact: true, name: "On-call" })).toBeVisible();
  await expect(page.getByText("No on-call schedules have been configured.")).toBeVisible();

  await page.getByRole("button", { name: "Create schedule" }).click();

  await expect(page.getByRole("heading", { name: "Create a schedule" })).toBeVisible();
  await page.getByLabel("Name").fill("Checkout responders");
  await page.getByLabel("Timezone").fill("Asia/Seoul");
  await page.getByLabel("Rotation type").selectOption("weekly");
  await page.getByLabel("Rotation interval").fill("1");

  const primaryRotation = page.getByText("Primary rotation", { exact: true }).locator("xpath=ancestor::section[1]");
  await primaryRotation.getByRole("combobox").selectOption({ label: "Primary Responder (primary@example.com)" });
  await expect(primaryRotation.getByText("Primary Responder")).toBeVisible();

  const secondaryRotation = page.getByText("Secondary rotation", { exact: true }).locator("xpath=ancestor::section[1]");
  await secondaryRotation.getByRole("combobox").selectOption({ label: "Secondary Responder (secondary@example.com)" });
  await expect(secondaryRotation.getByText("Secondary Responder")).toBeVisible();

  await page.getByRole("button", { name: "Create schedule" }).click();

  const detailHeader = page.locator("header").filter({ hasText: "Schedule detail" });
  await expect(detailHeader.getByRole("heading", { name: "Checkout responders" })).toBeVisible();
  await expect(page.getByText("Schedule detail")).toBeVisible();
  await expect(page.getByText("Asia/Seoul · weekly")).toBeVisible();
  await expect(page.getByText("Primary Responder").first()).toBeVisible();
  await expect(page.getByText("Secondary Responder").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});
