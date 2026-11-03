import { expect, test } from "@playwright/test";

import { authenticateSession } from "./support/auth";
import { apiPattern, fulfillJson, fulfillUnhandledApi, mockCopilotAvailable } from "./support/api";
import { e2eActiveWorkspace, e2eServiceId, e2eWorkspaceId } from "./support/test-data";

function buildCopilotProposalResponse(workspaceId: string, taskId?: string) {
  return {
    data: {
      answer: "Review this plan before applying it.",
      kind: "proposal",
      mode: "direct",
      proposal: {
        actions: [
          {
            after: [JSON.stringify({ name: "Checkout API", workspace_id: workspaceId })],
            before: [],
            id: "create-checkout-service",
            input: { name: "Checkout API" },
            label: "Create Checkout API",
            risks: [],
            type: "create_service",
          },
        ],
        goal: "Set up Checkout API",
        id: "proposal-service-setup",
        missing_inputs: [],
        risks: [],
        summary: "Create the service used by incoming incidents.",
        ...(taskId ? { task_id: taskId } : {}),
        workspace_id: workspaceId,
      },
      sources: [],
    },
  };
}

test("Copilot keeps the AI workspace usable on mobile and supports the composer flow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  await page.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === "GET" && url.pathname === "/api/v1/me/workspaces") {
      return fulfillJson(route, { data: [e2eActiveWorkspace] });
    }

    if (route.request().method() === "POST" && url.pathname === "/api/v1/copilot/ask") {
      return fulfillJson(route, {
        data: {
          answer: "Use the Incidents page to review active alerts and assign an owner.",
          kind: "message",
          mode: "ai",
          sources: [],
        },
      });
    }

    return fulfillUnhandledApi(route);
  });

  await mockCopilotAvailable(page);
  await page.goto("/overview");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();

  const panel = page.getByRole("dialog", { name: "Copilot", exact: true });
  await expect(panel.getByRole("button", { name: "Close Copilot", exact: true })).toBeFocused();
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/AI operations assistant/)).toBeVisible();
  await expect(panel.getByText("Core Platform", { exact: true })).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Ask Copilot", exact: true })).toBeVisible();
  await expect(panel.getByText("Try asking", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  const composer = panel.getByRole("textbox", { name: "Ask Copilot", exact: true });
  await composer.fill("How do I review incidents?");
  await composer.press("Enter");
  await expect(panel.getByText("Use the Incidents page to review active alerts and assign an owner.", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/copilot-mobile.png", animations: "disabled" });

  await page.getByRole("button", { name: "Close Copilot", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("button", { name: "Copilot", exact: true })).toBeFocused();
});

test("Copilot guides required clarification input before showing an approval plan", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });
  let askCount = 0;

  await page.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === "GET" && url.pathname === "/api/v1/me/workspaces") {
      return fulfillJson(route, { data: [e2eActiveWorkspace] });
    }

    if (route.request().method() === "POST" && url.pathname === "/api/v1/copilot/ask") {
      askCount += 1;

      if (askCount === 1) {
        return fulfillJson(route, {
          data: {
            answer: "I need the service name before I can prepare the setup.",
            clarification: {
              fields: [
                {
                  description: "The service that should receive incidents.",
                  id: "service_name",
                  input_type: "text",
                  label: "Service name",
                  required: true,
                },
              ],
              reason: "A service name is required.",
              task_id: "task-service-setup",
            },
            kind: "clarification",
            mode: "direct",
            sources: [],
          },
        });
      }

      expect(route.request().postDataJSON()).toMatchObject({
        structured_input: {
          task_id: "task-service-setup",
          values: { service_name: "Checkout API" },
        },
      });

      return fulfillJson(route, buildCopilotProposalResponse(e2eWorkspaceId, "task-service-setup"));
    }

    return fulfillUnhandledApi(route);
  });

  await mockCopilotAvailable(page);
  await page.goto("/overview");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();

  const panel = page.getByRole("dialog", { name: "Copilot", exact: true });
  const composer = panel.getByRole("textbox", { name: "Ask Copilot", exact: true });
  await composer.fill("Set up a service");
  await composer.press("Enter");

  const clarification = panel.getByText("I need the service name before I can prepare the setup.", { exact: true }).locator("..")
    .getByRole("button", { name: "Continue", exact: true });
  await expect(clarification).toBeDisabled();

  await panel.getByRole("textbox", { name: "Service name", exact: true }).fill("Checkout API");
  await expect(clarification).toBeEnabled();
  await clarification.click();

  await expect(panel.getByText("Review this plan before applying it.", { exact: true })).toBeVisible();
  await expect(panel.getByText("Awaiting approval", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Apply approved plan", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await panel.getByRole("button", { name: "Apply approved plan", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/copilot-proposal-desktop.png", animations: "disabled" });
});

test("Copilot shows execution progress and results after approving a plan", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });

  await page.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === "GET" && url.pathname === "/api/v1/me/workspaces") {
      return fulfillJson(route, { data: [e2eActiveWorkspace] });
    }

    if (route.request().method() === "POST" && url.pathname === "/api/v1/copilot/ask") {
      return fulfillJson(route, buildCopilotProposalResponse(e2eWorkspaceId));
    }

    if (route.request().method() === "POST" && url.pathname === "/api/v1/copilot/execute") {
      expect(route.request().postDataJSON()).toMatchObject({ approval: true });
      await new Promise((resolve) => setTimeout(resolve, 250));
      return fulfillJson(route, {
        data: {
          answer: "The service is ready.",
          kind: "execution_result",
          mode: "direct",
          results: [
            {
              action_id: "create-checkout-service",
              entity_id: e2eServiceId,
              entity_type: "service",
              label: "Create Checkout API",
              message: "Service created successfully.",
              status: "succeeded",
              type: "create_service",
            },
          ],
          sources: [],
        },
      });
    }

    return fulfillUnhandledApi(route);
  });

  await mockCopilotAvailable(page);
  await page.goto("/overview");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();

  const panel = page.getByRole("dialog", { name: "Copilot", exact: true });
  await panel.getByRole("textbox", { name: "Ask Copilot", exact: true }).fill("Set up Checkout API");
  await panel.getByRole("textbox", { name: "Ask Copilot", exact: true }).press("Enter");
  await expect(panel.getByText("Awaiting approval", { exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "Apply approved plan", exact: true }).click();
  await expect(panel.getByText("Applying", { exact: true })).toBeVisible();
  await expect(panel.getByText("Execution results", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText("Service created successfully.", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole("button", { name: "Apply approved plan", exact: true })).toHaveCount(0);
});

test("Copilot explains a failed execution without hiding the result state", async ({ page }) => {
  await authenticateSession(page, { workspaceId: e2eWorkspaceId });

  await page.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === "GET" && url.pathname === "/api/v1/me/workspaces") {
      return fulfillJson(route, { data: [e2eActiveWorkspace] });
    }

    if (route.request().method() === "POST" && url.pathname === "/api/v1/copilot/ask") {
      return fulfillJson(route, buildCopilotProposalResponse(e2eWorkspaceId));
    }

    if (route.request().method() === "POST" && url.pathname === "/api/v1/copilot/execute") {
      return fulfillJson(route, {
        error: {
          code: "copilot_execution_failed",
          message: "The service could not be created.",
          request_id: "e2e",
        },
      }, 500);
    }

    return fulfillUnhandledApi(route);
  });

  await mockCopilotAvailable(page);
  await page.goto("/overview");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();

  const panel = page.getByRole("dialog", { name: "Copilot", exact: true });
  await panel.getByRole("textbox", { name: "Ask Copilot", exact: true }).fill("Set up Checkout API");
  await panel.getByRole("textbox", { name: "Ask Copilot", exact: true }).press("Enter");
  await panel.getByRole("button", { name: "Apply approved plan", exact: true }).click();

  await expect(panel.getByText("Execution needs attention", { exact: true })).toBeVisible();
  const failedResults = panel.getByRole("status", { name: "Execution needs attention" });
  await expect(failedResults.getByText("The service could not be created.", { exact: true })).toBeVisible();
  await expect(failedResults.getByText("failed · create service", { exact: true })).toBeVisible();
});
