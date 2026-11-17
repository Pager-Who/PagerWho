import { expect, test } from "@playwright/test";

import { apiPattern, fulfillJson } from "./support/api";
import { e2eIncidentId, e2eNow } from "./support/test-data";

const token = "AQAAAAAAAEAAgAAAAAAAAAQBAAAAAAAAQACAAAAAAAAAAWW5AAAAAAAAAAAAAAAAAAAAAAAA";

test("acknowledges an incident from a notification link without signing in", async ({ page }) => {
  let status: "triggered" | "acknowledged" = "triggered";
  let ackRequests = 0;

  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === `/api/v1/incident-actions/${token}/ack` && request.method() === "POST") {
      ackRequests += 1;
      status = "acknowledged";
    } else if (path !== `/api/v1/incident-actions/${token}`) {
      return fulfillJson(route, { error: { code: "authentication_required", message: "Authentication session is required" } }, 401);
    }

    return fulfillJson(route, {
      data: {
        incident: {
          id: e2eIncidentId,
          title: "Checkout API is failing",
          service_name: "Checkout API",
          severity: "critical",
          priority: "P1",
          status,
          created_at: e2eNow,
        },
        responder_name: "Dana Responder",
        expires_at: e2eNow,
      },
    });
  });

  await page.goto(`/ack/${token}`);

  await expect(page.getByRole("heading", { name: "Checkout API is failing" })).toBeVisible();
  // Opening the link must never acknowledge by itself (mail and chat link scanners prefetch GETs).
  expect(ackRequests).toBe(0);

  await page.getByRole("button", { name: "Acknowledge as Dana Responder" }).click();

  await expect(page.getByRole("status").filter({ hasText: "This incident is acknowledged." })).toBeVisible();
  expect(ackRequests).toBe(1);
  await expect(page.getByRole("link", { name: "Open incident in Pager Who" })).toHaveAttribute("href", `/incidents/${e2eIncidentId}`);
});

test("explains an expired or invalid acknowledge link", async ({ page }) => {
  await page.route(apiPattern, (route) => fulfillJson(route, {
    error: { code: "incident_action_link_invalid", message: "This link is invalid or has expired" },
  }, 404));

  await page.goto(`/ack/${token}`);

  await expect(page.getByText("Could not open this link")).toBeVisible();
  await expect(page.getByText("This link is invalid or has expired")).toBeVisible();
});
