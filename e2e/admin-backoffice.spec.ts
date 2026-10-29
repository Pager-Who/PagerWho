import type {
  PlatformDiagnosticItem,
  PlatformInspectorResourceType,
  PlatformOverview,
  PlatformUserDetail,
  PlatformWorkspaceDetail,
} from "../packages/contracts/src/platform";
import { expect, test, type Page } from "@playwright/test";

import { authenticateSession } from "./support/auth";
import { e2eIncidentId, e2eNow, e2eOwnerUserId, e2eUserId, e2eWorkspaceId } from "./support/test-data";

const workspace: PlatformWorkspaceDetail = {
  created_at: e2eNow,
  created_by_user_id: e2eOwnerUserId,
  id: e2eWorkspaceId,
  invites: [],
  member_count: 2,
  members: [{
    created_at: e2eNow,
    email: "owner@example.com",
    name: "Owner",
    role: "owner",
    roles: ["project_admin", "service_admin", "incident_admin", "on_call_admin"],
    suspended_at: null,
    updated_at: e2eNow,
    user_id: e2eOwnerUserId,
  }],
  name: "Core Platform",
  notification_provider_settings: [],
  open_incident_count: 2,
  operational_timeline: [],
  quota_health: [{ resource: "on_call_schedules", current: 1, limit: null, remaining: null, state: "unlimited" }],
  recent_activity: [],
  resource_counts: { escalation_policies: 1, incidents: 2, on_call_schedules: 1, services: 1, workflows: 1 },
  service_count: 1,
  slug: "core-platform",
  suspended_at: null,
  suspended_by_user_id: null,
  suspension_reason: null,
  updated_at: e2eNow,
  usage: {
    quota_settings: { updated_at: e2eNow, updated_by_user_id: e2eOwnerUserId, quota_overrides: [] },
    exceeded: { escalation_policies: false, members: false, on_call_schedules: false, services: false, workspaces: false },
    limits: { escalation_policies: null, members: null, on_call_schedules: null, retention_days: 365, services: null, workspaces: null },
    usage: { active_members: 2, escalation_policies: 1, members: 2, on_call_schedules: 1, pending_invites: 0, services: 1, workspaces: 1 },
    workspace_id: e2eWorkspaceId,
  },
};

const account: PlatformUserDetail = {
  active_session_count: 1,
  auth_methods: ["password"],
  created_at: e2eNow,
  email: "responder@example.com",
  email_verified: true,
  id: e2eUserId,
  last_login_at: e2eNow,
  name: "Responder",
  notification_contacts: [],
  notification_preferences: [],
  platform_roles: [],
  recent_activity: [],
  security_timeline: [],
  sessions: [{
    id: "00000000-0000-4000-8000-000000000011",
    created_at: e2eNow,
    expires_at: "2027-01-01T00:00:00.000Z",
    ip_address: null,
    is_active: true,
    user_agent: `Synthetic desktop browser/${"test-client-".repeat(20)}`,
  }],
  suspended_at: null,
  suspended_by_user_id: null,
  suspension_reason: null,
  updated_at: e2eNow,
  workspace_count: 1,
  workspace_memberships: [{
    workspace_id: e2eWorkspaceId,
    workspace_name: workspace.name,
    role: "responder",
    roles: ["incident_responder"],
    created_at: e2eNow,
    updated_at: e2eNow,
  }],
};

const diagnostic: PlatformDiagnosticItem = {
  id: "00000000-0000-4000-8000-000000000021",
  kind: "notification",
  status: "dead_letter",
  title: "Email delivery failed",
  detail: `Provider rejected delivery: ${"synthetic-error-detail-".repeat(15)}`,
  workspace_id: e2eWorkspaceId,
  workspace_name: workspace.name,
  incident_id: e2eIncidentId,
  incident_title: "Checkout API latency",
  channel: "email",
  attempt: 3,
  occurred_at: e2eNow,
  request_id: "synthetic-correlation-id-for-notification-delivery-1234567890",
  can_retry: true,
};

const overview: PlatformOverview = {
  counts: {
    active_sessions: 1, api_5xx_24h: 2, average_notification_latency_ms_24h: 1250,
    failed_notifications_24h: 3, failed_worker_runs_24h: 1, new_users_24h: 1,
    notification_success_rate_24h: 97.5, users: 2,
    suspended_users: 0, workspaces: 1, suspended_workspaces: 0,
    open_incidents: 2, notification_dead_letters: 1,
  },
  deployment_version: "0123456789abcdef0123456789abcdef01234567",
  notification_trend: Array.from({ length: 24 }, (_, hour) => ({
    bucket: `2026-06-16T${String(hour).padStart(2, "0")}:00:00.000Z`,
    sent: 120 + hour, failed: hour % 4, average_latency_ms: 1250,
  })),
  attention: [{
    id: diagnostic.id, kind: "notification", status: "dead_letter", title: diagnostic.title,
    detail: "The delivery exhausted its retry attempts.", workspace_id: e2eWorkspaceId,
    incident_id: e2eIncidentId, created_at: e2eNow,
  }, {
    id: "00000000-0000-4000-8000-000000000022", kind: "worker", status: "failed",
    title: "Escalation worker failed", detail: "Synthetic worker failure", workspace_id: null,
    incident_id: null, created_at: e2eNow,
  }],
};

test("redirects non-admin accounts without requesting platform data", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await mockAdminApi(page, { admin: false });
  const platformRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/platform/")) platformRequests.push(request.url());
  });
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("tab", { name: "Data inspector" })).toHaveCount(0);
  expect(platformRequests).toEqual([]);
});

for (const width of [390, 768, 1440]) {
  test(`admin sections fit a ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticateSession(page, { userId: e2eOwnerUserId });
    await mockAdminApi(page);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: workspace.name, exact: true })).toBeVisible();

    for (const section of ["Workspaces", "Overview", "Accounts", "Diagnostics", "Data inspector"]) {
      await test.step(section, async () => {
        await page.getByRole("tab", { name: section, exact: true }).click();
        await expect(page.getByRole("tab", { name: section, exact: true })).toHaveAttribute("aria-selected", "true");
        if (section === "Overview") await expect(page.getByText("Escalation worker failed", { exact: true })).toBeVisible();
        if (section === "Accounts") await expect(page.getByText(account.email, { exact: true }).first()).toBeVisible();
        if (section === "Diagnostics") await expect(page.getByText(diagnostic.incident_title!, { exact: true })).toBeVisible();
        if (section === "Data inspector") await expect(page.getByText("No resource selected", { exact: true })).toBeVisible();
        await expectNoDocumentOverflow(page);
        await page.screenshot({ path: testInfo.outputPath(`${section.replaceAll(" ", "-").toLowerCase()}-${width}.png`), fullPage: true });
        if (section === "Workspaces") {
          for (const detailTab of ["Resource limits", "Access", "Providers", "Timeline", "Summary"]) {
            await page.getByRole("tab", { name: detailTab, exact: true }).click();
            await expectNoDocumentOverflow(page);
            if (detailTab === "Resource limits") {
              await expect(page.getByText("Plan management", { exact: true })).toHaveCount(0);
              await page.screenshot({ path: testInfo.outputPath(`resource-limits-${width}.png`), fullPage: true });
            }
          }
        }
        if (section === "Accounts") {
          await page.getByRole("button", { name: /Responder/ }).click();
          await expect(page.getByRole("heading", { name: account.name, exact: true })).toBeVisible();
          await expectNoDocumentOverflow(page);
          await page.screenshot({ path: testInfo.outputPath(`account-detail-${width}.png`), fullPage: true });
        }
      });
    }
    expect(pageErrors).toEqual([]);
  });
}

test("pages workspace results and resets pagination when searching", async ({ page }) => {
  await authenticateSession(page, { userId: e2eOwnerUserId });
  await mockAdminApi(page);
  const requests: string[] = [];
  await page.route("**/api/v1/platform/workspaces?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    const search = url.searchParams.get("search");
    const secondPage = Boolean(url.searchParams.get("cursor"));
    await route.fulfill({ json: { data: {
      items: search ? [] : [{ ...workspace, name: secondPage ? "Second page workspace" : workspace.name }],
      next_cursor: search || secondPage ? null : workspace.id,
    } } });
  });
  await page.goto("/admin");
  const next = page.getByRole("button", { name: "Next", exact: true });
  const previous = page.getByRole("button", { name: "Previous", exact: true });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(page.getByRole("button", { name: /Second page workspace/ })).toBeVisible();
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(page.getByRole("button", { name: /Core Platform/ })).toBeVisible();
  await next.click();
  await expect(page.getByRole("button", { name: /Second page workspace/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Search workspaces" }).fill("missing workspace");
  await expect(page.getByText("No workspaces", { exact: true })).toBeVisible();
  await expect(previous).toBeDisabled();
  const lastQuery = new URLSearchParams(requests.at(-1));
  expect(lastQuery.get("search")).toBe("missing workspace");
  expect(lastQuery.has("cursor")).toBe(false);
});

test("supports keyboard tabs and Korean admin controls on a narrow screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await authenticateSession(page, { userId: e2eOwnerUserId });
  await mockAdminApi(page);
  await page.goto("/admin");
  const workspaceTab = page.getByRole("tab", { name: "Workspaces", exact: true });
  await workspaceTab.focus();
  await workspaceTab.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeFocused();
  await page.getByRole("tab", { name: "Overview", exact: true }).press("Home");
  await expect(workspaceTab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("combobox", { name: "Display language", exact: true }).selectOption("ko");
  await expect(page.getByRole("heading", { name: "워크스페이스", exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "리소스 한도", exact: true }).click();
  await page.getByRole("button", { name: "워크스페이스 정지", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "워크스페이스 정지", exact: true });
  await expect(dialog.getByRole("textbox", { name: "관리 사유", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "변경 적용", exact: true })).toBeDisabled();
  await expectNoDocumentOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("korean-confirmation-390.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("searches and inspects familiar records without typing an ID", async ({ page }) => {
  await authenticateSession(page, { userId: e2eOwnerUserId });
  await mockAdminApi(page);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Data inspector", exact: true }).click();
  await page.getByLabel("Resource type", { exact: true }).selectOption("incident");
  await page.getByRole("button", { name: /Checkout API latency/ }).click();
  await expect(page.getByRole("heading", { name: "Checkout API latency", exact: true })).toBeVisible();
  await page.getByLabel("Resource type", { exact: true }).selectOption("workspace");
  await expect(page.getByRole("heading", { name: "Checkout API latency", exact: true })).toHaveCount(0);
  await expect(page.getByText("No resource selected", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("not-a-real-resource");
  await page.getByRole("textbox", { name: "Search", exact: true }).press("Enter");
  await expect(page.getByText("No results", { exact: true })).toBeVisible();
});

test("worker attention items open the relevant diagnostics", async ({ page }) => {
  await authenticateSession(page, { userId: e2eOwnerUserId });
  await mockAdminApi(page);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: /Escalation worker failed/ }).click();
  await expect(page.getByRole("tab", { name: "Diagnostics", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Type", { exact: true })).toHaveValue("worker");
  await expect(page.getByLabel("Workspace", { exact: true })).toHaveValue("");
});

test("shows an actionable empty workspace list", async ({ page }) => {
  await authenticateSession(page, { userId: e2eOwnerUserId });
  await mockAdminApi(page, { emptyWorkspaces: true });
  await page.goto("/admin");
  await expect(page.getByText("No workspaces", { exact: true })).toBeVisible();
  await expect(page.getByText("No workspace selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
});

test("shows load failures without presenting them as an empty list", async ({ page }) => {
  await authenticateSession(page, { userId: e2eOwnerUserId });
  await mockAdminApi(page, { failWorkspaces: true });
  await page.goto("/admin");
  await expect(page.getByText("Could not load workspaces", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("No workspaces", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
});

test("requires an audit reason, permits cancellation, and preserves failed changes for retry", async ({ page }) => {
  await authenticateSession(page, { userId: e2eOwnerUserId });
  await mockAdminApi(page);
  const requests: unknown[] = [];
  await page.route(`**/api/v1/platform/workspaces/${e2eWorkspaceId}/suspend`, async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) return route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "Please try this operation again.", request_id: "synthetic-mutation" } } });
    return route.fulfill({ json: { data: { ...workspace, suspended_at: e2eNow, suspension_reason: "Support investigation" } } });
  });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Resource limits", exact: true }).click();
  await page.getByRole("button", { name: "Suspend workspace", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Suspend workspace", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(workspace.name, { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply change", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend workspace", exact: true })).toBeFocused();
  expect(requests).toEqual([]);

  await page.getByRole("button", { name: "Suspend workspace", exact: true }).click();
  await dialog.getByLabel("Admin reason", { exact: true }).fill("  ");
  await expect(dialog.getByRole("button", { name: "Apply change", exact: true })).toBeDisabled();
  await dialog.getByLabel("Admin reason", { exact: true }).fill("ab");
  await expect(dialog.getByRole("button", { name: "Apply change", exact: true })).toBeDisabled();
  await dialog.getByLabel("Admin reason", { exact: true }).fill("  Support investigation  ");
  await dialog.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(dialog.getByText("Please try this operation again.", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Admin reason", { exact: true })).toHaveValue("  Support investigation  ");
  await dialog.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(requests).toEqual([{ reason: "Support investigation" }, { reason: "Support investigation" }]);
});

async function expectNoDocumentOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

async function mockAdminApi(page: Page, options: { admin?: boolean; emptyWorkspaces?: boolean; failWorkspaces?: boolean } = {}) {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const admin = options.admin ?? true;
    const fulfill = (data: unknown) => route.fulfill({ json: { data } });
    if (path === "/auth/me") return fulfill({
      auth_source: "session", is_platform_admin: admin, platform_roles: admin ? ["platform_admin"] : [],
      user: { email: "owner@example.com", email_verified: true, id: admin ? e2eOwnerUserId : e2eUserId, name: admin ? "Owner" : account.name },
    });
    if (path === "/platform/me") return fulfill({ is_platform_admin: admin, roles: admin ? ["platform_admin"] : [] });
    if (path === "/platform/overview") return fulfill(overview);
    if (path === "/platform/users") return fulfill({ items: [account], next_cursor: null });
    if (path === `/platform/users/${e2eUserId}`) return fulfill(account);
    if (path === "/platform/workspaces") {
      if (options.failWorkspaces) return route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "Workspace service is temporarily unavailable", request_id: "synthetic-request" } } });
      const search = url.searchParams.get("search")?.toLowerCase();
      return fulfill({ items: options.emptyWorkspaces || (search && !workspace.name.toLowerCase().includes(search)) ? [] : [workspace], next_cursor: null });
    }
    if (path === `/platform/workspaces/${e2eWorkspaceId}`) return fulfill(workspace);
    if (path === "/platform/diagnostics") return fulfill({ items: url.searchParams.get("kind") === "worker" ? [] : [diagnostic] });
    if (path === "/platform/resources") {
      const resource = resourceFor(url.searchParams.get("resource_type") as PlatformInspectorResourceType);
      const search = url.searchParams.get("search")?.toLowerCase();
      return fulfill({ items: search && !resource.title.toLowerCase().includes(search) ? [] : [resource] });
    }
    if (path === "/platform/inspect") {
      const resource = resourceFor(url.searchParams.get("resource_type") as PlatformInspectorResourceType);
      return fulfill({ ...resource, workspace_id: e2eWorkspaceId, updated_at: e2eNow, relationships: [], data: { id: resource.id, title: resource.title, status: resource.status } });
    }
    // Keep these tests independent of a running API, including after redirects.
    if (path === "/workspaces") return fulfill({ items: [{ ...workspace, role: "owner", roles: ["project_admin"] }], next_cursor: null });
    if (path === `/workspaces/${e2eWorkspaceId}`) return fulfill({ ...workspace, role: "owner", roles: ["project_admin"] });
    return route.fulfill({ status: 404, json: { error: { code: "not_found", message: "No fixture for this endpoint", request_id: "synthetic-request" } } });
  });
}

function resourceFor(type: PlatformInspectorResourceType) {
  return {
    id: type === "workspace" ? e2eWorkspaceId : type === "incident" ? e2eIncidentId : e2eUserId,
    resource_type: type,
    title: type === "workspace" ? workspace.name : type === "incident" ? "Checkout API latency" : account.name,
    subtitle: type === "user" ? account.email : "Synthetic operational record",
    status: type === "incident" ? "triggered" : "active",
    workspace_name: workspace.name,
    created_at: e2eNow,
  };
}
