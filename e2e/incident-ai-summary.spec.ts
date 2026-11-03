import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { fulfillJson, mockCopilotAvailable } from "./support/api";
import { mockIncidentLifecycleFlow } from "./support/incident-mocks";
import { e2eIncidentId, e2eNow, e2eWorkspaceId } from "./support/test-data";

const response = {
  incident_id: e2eIncidentId, locale: "en", model: "example-model", generated_at: e2eNow,
  source_updated_at: e2eNow, context_truncated: false,
  summary: "Checkout failures were reported. The cause and customer impact are not verified.",
  checklist: ["Verify customer impact.", "Inspect relevant application logs.", "Check recent deployments."],
  evidence: { title: "Checkout API is failing", description: null, severity: "critical", priority: "P1", status: "triggered",
    service: "Checkout API", owner_team: null, responder: null, created_at: e2eNow, acknowledged_at: null, resolved_at: null, history: [] },
};

for (const width of [390, 1280]) test(`generates an advisory summary on demand at ${width}px without changing the incident`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page, { seedIncident: true });
  let calls = 0;
  const writes: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET" && /\/incidents\//.test(request.url())) writes.push(new URL(request.url()).pathname); });
  await page.route("**/api/v1/incidents/*/ai-summary", async (route) => {
    calls++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ locale: "en" });
    await fulfillJson(route, { data: response });
  });
  await mockCopilotAvailable(page);
  await page.goto(`/incidents/${e2eIncidentId}`);
  const panel = page.getByRole("region", { name: "AI incident summary", exact: true });
  await expect(panel).toBeVisible();
  expect(calls).toBe(0);
  await panel.getByRole("button", { name: "Generate AI summary", exact: true }).click();
  await expect(panel.getByText(response.summary, { exact: true })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Recorded facts" })).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await expect(panel.getByText(/Root cause, impact, metrics and logs are not verified/)).toBeVisible();
  expect(writes).toEqual([`/api/v1/incidents/${e2eIncidentId}/ai-summary`]);
  await expect(panel.getByRole("button", { name: "Regenerate summary" })).toBeEnabled();
  const overflow = await panel.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
});

test("recovers from a provider error and marks an old summary as stale", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page, { seedIncident: true });
  let calls = 0;
  await page.route("**/api/v1/incidents/*/ai-summary", async (route) => {
    if (++calls === 1) return fulfillJson(route, { error: { code: "copilot_unavailable", message: "Copilot is temporarily unavailable." } }, 502);
    return fulfillJson(route, { data: { ...response, source_updated_at: "2020-01-01T00:00:00.000Z" } });
  });
  await mockCopilotAvailable(page);
  await page.goto(`/incidents/${e2eIncidentId}`);
  const panel = page.getByRole("region", { name: "AI incident summary", exact: true });
  await panel.getByRole("button", { name: "Generate AI summary" }).click();
  await expect(panel.getByText("Could not generate incident summary", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(panel.getByText(response.summary, { exact: true })).toBeVisible();
  await expect(panel.getByText("This incident has changed. Regenerate the summary before using it.")).toBeVisible();
});

test("hides AI features when the server has no Copilot model provider configured", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page, { seedIncident: true });
  const copilotCalls: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/ai-summary") || path.startsWith("/api/v1/copilot/ask")) copilotCalls.push(path);
  });
  await mockCopilotAvailable(page, false);
  await page.goto(`/incidents/${e2eIncidentId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "AI incident summary", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copilot", exact: true })).toHaveCount(0);
  expect(copilotCalls).toEqual([]);
});
