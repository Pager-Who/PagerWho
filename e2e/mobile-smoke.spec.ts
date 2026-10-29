import { expect, test } from "@playwright/test";
import { authenticateSession } from "./support/auth";
import { apiPattern, fulfillJson, fulfillUnhandledApi } from "./support/api";
import { mockIncidentLifecycleFlow } from "./support/incident-mocks";
import { mockOnCallScheduleCreateFlow } from "./support/on-call-mocks";
import { mockServiceWebhookFlow } from "./support/service-webhook-mocks";
import { e2eActiveWorkspace, e2eIncidentId, e2eNow, e2eServiceId, e2eWorkspaceId } from "./support/test-data";

test("operations keeps tables within the mobile viewport and shows attempt errors", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  const notificationId = "00000000-0000-4000-8000-000000000801";
  await page.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/v1/me/workspaces") return fulfillJson(route, { data: [e2eActiveWorkspace] });
    if (path === "/api/v1/workers/health") return fulfillJson(route, { data: { status: "ok", checked_at: e2eNow, latest_runs: [] } });
    if (path === "/api/v1/workers/readiness") return fulfillJson(route, { data: { ready: true, checked_at: e2eNow, max_run_age_seconds: 120, stale_workers: [], latest_runs: [] } });
    if (path === "/api/v1/workers/runs" || path === "/api/v1/workers/stuck-escalations" || path === "/api/v1/notifications/dead-letter" || path === "/api/v1/activity-logs") {
      return fulfillJson(route, { data: { items: [], next_cursor: null } });
    }
    if (path === "/api/v1/notifications") {
      return fulfillJson(route, { data: { items: [{
        id: notificationId,
        incident_id: e2eIncidentId,
        policy_step_id: null,
        repeat_iteration: null,
        channel: "email",
        target_type: "user",
        target_id: null,
        target_address: "responder@example.com",
        status: "failed",
        attempt: 1,
        idempotency_key: "mobile-test",
        provider_message_id: null,
        error_message: "Provider unavailable",
        next_retry_at: null,
        sent_at: null,
        created_at: e2eNow,
        updated_at: e2eNow,
      }], next_cursor: null } });
    }
    if (path === `/api/v1/notifications/${notificationId}/attempts`) {
      return fulfillJson(route, { error: { code: "provider_unavailable", message: "Provider unavailable", request_id: "e2e" } }, 503);
    }
    return fulfillUnhandledApi(route);
  });

  await page.goto("/operations");
  await expect(page.getByRole("heading", { name: "System diagnostics" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await page.getByRole("tab", { name: /Notifications/ }).click();
  await page.getByRole("button", { name: "View delivery attempts" }).click();
  await expect(page.getByText("Could not load delivery attempts")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("No attempts")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
});

test("incidents stays usable on a mobile viewport", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page);

  await page.goto("/incidents");

  await expect(page.getByRole("heading", { exact: true, name: "Incidents" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New incident" }).first()).toBeVisible();
  await expect(page.getByText("No open incidents need attention.")).toBeVisible();

  await page.getByRole("button", { name: "New incident" }).first().click();
  await expect(page.getByRole("heading", { name: "New incident" })).toBeVisible();
  const createForm = page.locator("form").filter({ hasText: "New incident" });
  await expect(createForm.getByLabel("Title")).toBeVisible();
  await expect(createForm.getByLabel("Service")).toBeVisible();
  await expect(createForm.getByLabel("Priority")).toBeVisible();
  await expect(createForm.getByLabel("Severity")).toBeVisible();

  await createForm.getByLabel("Title").fill("Mobile checkout alert");
  await createForm.getByLabel("Service").selectOption(e2eServiceId);
  await createForm.getByLabel("Priority").selectOption("P2");
  await createForm.getByLabel("Severity").selectOption("high");
  await createForm.getByRole("button", { name: "Create incident" }).click();
  await expect(page.getByRole("heading", { name: "Mobile checkout alert" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Acknowledge" })).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("acknowledged", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("resolved", { exact: true }).first()).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("incident queue requests open incidents and uses mobile cards", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page, { seedIncident: true });
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/incidents") requests.push(url.searchParams.get("status") ?? "");
  });

  await page.goto("/incidents");
  const card = page.getByRole("button", { name: /Checkout API is failing/ });
  await expect(card).toBeVisible();
  expect(requests).toContain("open");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
});

test("service detail stays usable on a mobile viewport", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockServiceWebhookFlow(page);

  await page.goto(`/services/${e2eServiceId}`);

  await expect(page.getByRole("heading", { name: "Checkout API" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Webhook" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Incidents" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();

  await page.getByRole("tab", { name: "Incidents" }).click();
  await expect(page.getByRole("heading", { exact: true, name: "Active incidents" })).toBeVisible();

  await page.getByRole("tab", { name: "Webhook" }).click();
  await expect(page.getByText("Service webhook", { exact: true })).toBeVisible();
  await expect(page.getByText("Test webhook", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Escalation" }).click();
  await expect(page.getByText("Responder targets", { exact: true })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("on-call empty state stays usable on a mobile viewport", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockOnCallScheduleCreateFlow(page);

  await page.goto("/on-call");

  await expect(page.getByRole("heading", { exact: true, name: "On-call" })).toBeVisible();
  await expect(page.getByText("No on-call schedules have been configured.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create schedule" })).toBeVisible();

  await page.getByRole("button", { name: "Create schedule" }).click();
  await expect(page.getByRole("heading", { name: "Create a schedule" })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByLabel("Timezone")).toBeVisible();
  await expect(page.getByLabel("Rotation type")).toBeVisible();
  await expect(page.getByLabel("Rotation interval")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("global navigation and settings stay usable on a mobile viewport", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page);

  await page.goto("/overview");

  await expect(page.getByRole("heading", { exact: true, name: "Overview" })).toBeVisible();
  const navigationButton = page.getByRole("button", { name: "Primary navigation" });
  await navigationButton.click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { exact: true, name: "Overview" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { exact: true, name: "Incidents" })).toBeVisible();

  await page.getByRole("button", { name: "User menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "User settings" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Projects" }).click();

  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "Choose how to start" })).toBeVisible();

  await page.goto("/overview");
  await expect(page.getByRole("heading", { exact: true, name: "Overview" })).toBeVisible();
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "User settings" }).click();

  await expect(page).toHaveURL(/\/user-settings$/);
  await expect(page.getByRole("heading", { name: "User settings" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Preferences" })).toBeVisible();
  await expect(page.getByLabel("Language")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("overview response actions stay usable on a mobile viewport", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page, { seedIncident: true });
  let triageRequestCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/incidents/") && request.url().endsWith("/triage")) {
      triageRequestCount += 1;
    }
  });

  await page.goto("/overview");

  await expect(page.getByRole("heading", { exact: true, name: "Active response" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Checkout API is failing/ })).toBeVisible();

  const actionCenterButton = page.getByRole("button", { name: /Action Center, 1 operational item/ });
  await actionCenterButton.click();
  await expect(page.getByRole("dialog", { name: "Action Center" })).toContainText("Checkout API is failing");
  await actionCenterButton.click();

  await page.getByRole("link", { name: /Checkout API is failing/ }).click();
  await expect(page.getByRole("heading", { name: "Checkout API is failing" })).toBeVisible();
  expect(triageRequestCount).toBe(0);
  await page.getByRole("button", { name: "Change priority" }).click();
  await page.getByLabel("New priority").selectOption("P2");
  await page.getByRole("button", { name: "Save priority" }).click();
  await expect(page.getByText("P2", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("acknowledged", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("resolved", { exact: true }).first()).toBeVisible();

  await page.goto("/overview");
  await expect(page.getByText("Response queue is clear", { exact: true })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("incident detail history and escalation stay usable on a mobile viewport", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockIncidentLifecycleFlow(page, { seedIncident: true });

  await page.goto(`/incidents/${e2eIncidentId}`);
  await expect(page.getByRole("heading", { name: "Checkout API is failing" })).toBeVisible();

  await page.getByRole("tab", { name: /Timeline/ }).click();
  await expect(page.getByText("incident_created", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /Notifications/ }).click();
  await expect(page.getByText("No notifications", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Escalation" }).click();
  await expect(page.getByRole("heading", { name: "Manual escalation" })).toBeVisible();
  await page.getByLabel("Reason").fill("No response from the primary responder.");
  await page.getByRole("button", { name: "Escalate next step" }).click();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
