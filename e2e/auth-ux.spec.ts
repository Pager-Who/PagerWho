import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { fulfillJson } from "./support/api";

const verificationToken = "verification-token-123456789012345678901234";

async function mockUnauthenticatedApi(page: Page) {
  await page.route("**/api/v1/auth/me", async (route) => {
    await fulfillJson(route, {
      error: {
        code: "authentication_required",
        message: "Authentication session is required",
        request_id: "e2e",
      },
    }, 401);
  });
}

test("keeps email sign-in available when SSO providers fail and supports retry", async ({ page }) => {
  let providerRequests = 0;

  await mockUnauthenticatedApi(page);
  await page.route("**/api/v1/auth/providers", async (route) => {
    providerRequests += 1;

    if (providerRequests === 1) {
      await fulfillJson(route, {
        error: {
          code: "provider_unavailable",
          message: "Provider discovery failed",
          request_id: "e2e",
        },
      }, 503);
      return;
    }

    await fulfillJson(route, {
      data: {
        active_provider: {
          enabled: true,
          id: "oidc",
          label: "Company SSO",
          login_url: "/api/v1/auth/oidc/start",
        },
        email_password_enabled: true,
      },
    });
  });

  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Could not load sign-in providers" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(page.getByRole("button", { name: "Continue with Company SSO" })).toBeVisible();
});

test("explains when a password reset link has no token", async ({ page }) => {
  await mockUnauthenticatedApi(page);
  await page.route("**/api/v1/auth/providers", async (route) => {
    await fulfillJson(route, {
      data: {
        active_provider: null,
        email_password_enabled: true,
      },
    });
  });

  await page.goto("/login?mode=reset-password");

  await expect(page.getByRole("heading", { name: "Password reset link is invalid" })).toBeVisible();
  await expect(page.getByText("This password reset link is missing or incomplete.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update password" })).toHaveCount(0);
});

test("separates an expired email verification link from sign-in errors", async ({ page }) => {
  await mockUnauthenticatedApi(page);
  await page.route("**/api/v1/auth/providers", async (route) => {
    await fulfillJson(route, {
      data: {
        active_provider: null,
        email_password_enabled: true,
      },
    });
  });
  await page.route("**/api/v1/auth/email-verification/confirm", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await fulfillJson(route, {
      error: {
        code: "email_verification_token_invalid",
        message: "Email verification token is invalid or expired",
        request_id: "e2e",
      },
    }, 400);
  });

  await page.goto(`/login?mode=verify-email&token=${verificationToken}`);

  await expect(page.getByRole("status")).toContainText("Verifying your email");
  await expect(page.getByRole("heading", { name: "Could not verify email" })).toBeVisible();
  await expect(page.getByText("This verification link is invalid or expired.")).toBeVisible();
});

async function mockEmailOnlyProvider(page: Page) {
  await page.route("**/api/v1/auth/providers", async (route) => {
    await fulfillJson(route, {
      data: {
        active_provider: null,
        email_password_enabled: true,
      },
    });
  });
}

test("shows the account-created next step after registration", async ({ page }) => {
  await mockUnauthenticatedApi(page);
  await mockEmailOnlyProvider(page);
  await page.route("**/api/v1/auth/register", async (route) => {
    await fulfillJson(route, {
      data: {
        email_verification_required: true,
        user: {
          email: "new-user@example.com",
          email_verified: false,
          id: "00000000-0000-4000-8000-000000000010",
          name: "New User",
        },
      },
    }, 201);
  });

  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Name").fill("New User");
  await page.getByLabel("Email").fill("new-user@example.com");
  await page.locator('input[autocomplete="new-password"]').first().fill("Password123!");
  await page.getByLabel("Confirm password").fill("Password123!");
  await page.getByRole("button", { name: "Create account", exact: true }).last().click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Verify your email");
});

test("redirects to the projects page after a successful sign-in", async ({ page }) => {
  await mockUnauthenticatedApi(page);
  await mockEmailOnlyProvider(page);
  await page.route("**/api/v1/auth/login", async (route) => {
    await fulfillJson(route, {
      data: {
        session: {
          expires_at: "2026-10-11T00:00:00.000Z",
          id: "00000000-0000-4000-8000-000000000020",
        },
        user: {
          email: "responder@example.com",
          email_verified: true,
          id: "00000000-0000-4000-8000-000000000001",
          name: "Responder",
        },
      },
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("responder@example.com");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/projects\?post_login=1$/);
});

test("shows verification follow-up only when sign-in requires email verification", async ({ page }) => {
  await mockUnauthenticatedApi(page);
  await mockEmailOnlyProvider(page);
  await page.route("**/api/v1/auth/login", async (route) => {
    await fulfillJson(route, {
      error: {
        code: "email_verification_required",
        message: "Verify your email before signing in",
        request_id: "e2e",
      },
    }, 403);
  });
  await page.route("**/api/v1/auth/email-verification/resend", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await fulfillJson(route, {
      data: {
        accepted: true,
      },
    });
  });

  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Resend verification email" })).toHaveCount(0);
  await page.getByLabel("Email").fill("responder@example.com");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("button", { name: "Resend verification email" })).toBeVisible();
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("If the account exists and still needs verification");
});

test("confirms the password-reset request without exposing account existence", async ({ page }) => {
  await mockUnauthenticatedApi(page);
  await mockEmailOnlyProvider(page);
  await page.route("**/api/v1/auth/password-reset/start", async (route) => {
    await fulfillJson(route, {
      data: {
        accepted: true,
      },
    });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill("responder@example.com");
  await page.getByRole("button", { name: "Send reset email" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("password reset email");
});

test("returns to sign-in after a successful password reset", async ({ page }) => {
  await mockUnauthenticatedApi(page);
  await mockEmailOnlyProvider(page);
  await page.route("**/api/v1/auth/password-reset/complete", async (route) => {
    await fulfillJson(route, {
      data: {
        success: true,
      },
    });
  });

  await page.goto(`/login?mode=reset-password&token=${verificationToken}`);
  await page.getByLabel("New password").fill("NewPassword123!");
  await page.getByLabel("Confirm password").fill("NewPassword123!");
  await page.getByRole("button", { name: "Update password" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Password reset complete");
});

test("keeps the sign-in card within a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await mockUnauthenticatedApi(page);
  await mockEmailOnlyProvider(page);

  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
