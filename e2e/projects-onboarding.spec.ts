import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockProjectInviteFlow } from "./support/project-mocks";
import { e2eWorkspaceId } from "./support/test-data";

test("prioritizes pending project invitations before project creation", async ({ page }) => {
  await authenticateSession(page);
  await mockProjectInviteFlow(page);

  await page.goto("/projects");

  await expect(page.getByRole("heading", { name: "Choose how to start" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accept an invitation to continue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pending invitations" })).toBeVisible();
  const inviteRow = page.getByRole("row", { name: /responder pending Accept Decline/ });
  await expect(inviteRow).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create instead" })).toBeVisible();

  await inviteRow.getByRole("button", { name: "Accept" }).click();

  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { exact: true, name: "Overview" })).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem("pagerwho.currentProjectId"))).resolves.toBe(e2eWorkspaceId);
});
