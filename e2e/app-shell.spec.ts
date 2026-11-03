import { expect, test } from "@playwright/test";
import { mockCopilotAvailable } from "./support/api";
import { authenticateSession } from "./support/auth";
import { mockIncidentLifecycleFlow } from "./support/incident-mocks";
import { e2eWorkspaceId } from "./support/test-data";

for (const width of [390, 1440]) {
  test(`incident workspace navigation remains usable at ${width}px without a Copilot provider`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticateSession(page, { workspaceId: e2eWorkspaceId });
    await mockIncidentLifecycleFlow(page);
    const copilotWrites: string[] = [];
    page.on("request", (request) => {
      // Only the read-only status check is allowed when Copilot is not configured.
      if (new URL(request.url()).pathname.startsWith("/api/v1/copilot") && request.method() !== "GET") copilotWrites.push(request.method());
    });
    await mockCopilotAvailable(page, false);
    await page.goto("/incidents");
    await expect(page.getByRole("heading", { name: "Incidents", exact: true })).toBeVisible();
    const copilotButton = page.getByRole("button", { name: "Copilot", exact: true });
    await expect(copilotButton).toBeVisible();
    await copilotButton.click();
    const copilotPanel = page.getByRole("dialog", { name: "Copilot" });
    await expect(copilotPanel.getByRole("status", { name: "Copilot setup required" })).toBeVisible();
    await expect(copilotPanel.getByText("COPILOT_API_KEY", { exact: true })).toBeVisible();
    await expect(copilotPanel.getByRole("textbox")).toBeDisabled();
    await copilotPanel.getByRole("button", { name: "Close Copilot" }).click();
    await expect(page.getByRole("link", { name: "Documentation", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`incident-workspace-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "New incident" }).first().click();
    await expect(page.locator("form").filter({ hasText: "New incident" }).getByLabel("Title")).toBeVisible();
    expect(copilotWrites).toEqual([]);
  });
}

test("opens a usable Copilot when the server has a model provider configured", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page);
  await mockCopilotAvailable(page);
  await page.goto("/incidents");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const copilotPanel = page.getByRole("dialog", { name: "Copilot" });
  await expect(copilotPanel.getByRole("textbox")).toBeEnabled();
  await expect(copilotPanel.getByRole("status", { name: "Copilot setup required" })).toHaveCount(0);
});
