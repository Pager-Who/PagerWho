import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { mockIncidentLifecycleFlow } from "./support/incident-mocks";
import { e2eWorkspaceId } from "./support/test-data";

for (const width of [390, 1440]) {
  test(`incident workspace navigation remains usable at ${width}px without the retired assistant`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticateSession(page, { workspaceId: e2eWorkspaceId });
    await mockIncidentLifecycleFlow(page);
    const assistantRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/v1/copilot")) assistantRequests.push(request.method());
    });
    await page.goto("/incidents");
    await expect(page.getByRole("heading", { name: "Incidents", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copilot", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Documentation", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`incident-workspace-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "New incident" }).first().click();
    await expect(page.locator("form").filter({ hasText: "New incident" }).getByLabel("Title")).toBeVisible();
    expect(assistantRequests).toEqual([]);
  });
}
