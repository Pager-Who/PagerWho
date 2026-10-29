import type { RequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@im/db";

import {
  listAuthProvidersHandler,
  loginHandler,
  startPasswordResetHandler,
  startOidcLoginHandler,
} from "./auth.handler";
import { sendAuthEmail } from "../auth/auth-email";
import { hashPassword } from "../auth/password-credentials";
import { errorMiddleware } from "../middleware/error.middleware";

vi.mock("@im/db", () => ({
  Prisma: {},
  prisma: {
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    authSession: {
      create: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    platformAdminRole: {
      findMany: vi.fn(),
    },
    userIdentity: {},
  },
}));

vi.mock("../auth/auth-email", () => ({
  sendAuthEmail: vi.fn(),
}));

vi.mock("@im/backend-core", () => ({
  recordActivityLog: vi.fn(),
}));

describe("auth handlers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(prisma as never));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("returns no active auth provider when OIDC is not configured", async () => {
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.OIDC_REDIRECT_URI;

    const response = await invokeHandler(listAuthProvidersHandler);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        active_provider: null,
        email_password_enabled: true,
      },
    });
  });

  it("returns the configured active auth provider", async () => {
    setOidcEnv();

    const response = await invokeHandler(listAuthProvidersHandler);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        active_provider: {
          enabled: true,
          id: "google",
          label: "Google",
          login_url: "/api/v1/auth/oidc/start",
        },
        email_password_enabled: true,
      },
    });
  });

  it("starts OIDC authorization with state, nonce, and PKCE", async () => {
    setOidcEnv();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({
        authorization_endpoint: "https://accounts.example.test/oauth2/v2/auth",
        issuer: "https://accounts.example.test",
        jwks_uri: "https://accounts.example.test/oauth2/v3/certs",
        token_endpoint: "https://accounts.example.test/token",
      }),
      ok: true,
    })));

    const response = await invokeHandler(startOidcLoginHandler, {
      query: {
        return_to: "/incidents",
      },
    });

    expect(response.status).toBe(302);
    expect(response.cookies).toHaveProperty("pagerwho_oidc");
    expect(response.redirectUrl).toBeDefined();

    const redirectUrl = new URL(response.redirectUrl ?? "");
    expect(redirectUrl.origin).toBe("https://accounts.example.test");
    expect(redirectUrl.searchParams.get("client_id")).toBe("test-client-id");
    expect(redirectUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(redirectUrl.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/api/v1/auth/oidc/callback");
    expect(redirectUrl.searchParams.get("response_type")).toBe("code");
    expect(redirectUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(redirectUrl.searchParams.get("state")).toBeTruthy();
    expect(redirectUrl.searchParams.get("nonce")).toBeTruthy();
    expect(redirectUrl.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("creates a session for an unverified email/password login", async () => {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "new-user@example.com",
      emailVerifiedAt: null,
      id: "11111111-1111-4111-8111-111111111111",
      name: "New User",
      suspendedAt: null,
      passwordCredential: {
        passwordHash: await hashPassword("Password123!"),
      },
    } as never);
    vi.mocked(prisma.authSession.create).mockResolvedValue({
      expiresAt,
      id: "22222222-2222-4222-8222-222222222222",
    } as never);

    const response = await invokeHandler(loginHandler, {
      body: {
        email: "new-user@example.com",
        password: "Password123!",
      },
    });

    expect(response.status).toBe(200);
    expect(response.cookies).toHaveProperty("pagerwho_session");
    expect(response.body).toMatchObject({
      data: {
        user: {
          email_verified: false,
        },
      },
    });
    expect(prisma.authSession.create).toHaveBeenCalledOnce();
  });

  it("creates a session for a verified email/password login", async () => {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "verified-user@example.com",
      emailVerifiedAt: new Date(),
      id: "11111111-1111-4111-8111-111111111111",
      name: "Verified User",
      suspendedAt: null,
      passwordCredential: {
        passwordHash: await hashPassword("Password123!"),
      },
    } as never);
    vi.mocked(prisma.authSession.create).mockResolvedValue({
      expiresAt,
      id: "22222222-2222-4222-8222-222222222222",
    } as never);

    const response = await invokeHandler(loginHandler, {
      body: {
        email: "verified-user@example.com",
        password: "Password123!",
      },
    });

    expect(response.status).toBe(200);
    expect(response.cookies).toHaveProperty("pagerwho_session");
    expect(response.body).toMatchObject({
      data: {
        user: {
          email_verified: true,
        },
      },
    });
  });

  it("blocks login for a suspended user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "suspended@example.com",
      emailVerifiedAt: new Date(),
      id: "11111111-1111-4111-8111-111111111111",
      name: "Suspended User",
      passwordCredential: {
        passwordHash: await hashPassword("Password123!"),
      },
      suspendedAt: new Date("2026-06-20T00:00:00.000Z"),
    } as never);

    const response = await invokeHandler(loginHandler, {
      body: {
        email: "suspended@example.com",
        password: "Password123!",
      },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: {
        code: "user_suspended",
      },
    });
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("does not send another password reset email during the three-minute cooldown", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "user@example.com",
      emailVerifiedAt: new Date(),
      id: "11111111-1111-4111-8111-111111111111",
      name: "Example User",
      passwordCredential: {
        userId: "11111111-1111-4111-8111-111111111111",
      },
      suspendedAt: null,
    } as never);
    vi.mocked(prisma.passwordResetToken.findFirst).mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
    } as never);

    const response = await invokeHandler(startPasswordResetHandler, {
      body: {
        email: "user@example.com",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { accepted: true } });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendAuthEmail).not.toHaveBeenCalled();
  });

  it("invalidates older tokens and sends a password reset email after the cooldown", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "user@example.com",
      emailVerifiedAt: new Date(),
      id: "11111111-1111-4111-8111-111111111111",
      name: "Example User",
      passwordCredential: {
        userId: "11111111-1111-4111-8111-111111111111",
      },
      suspendedAt: null,
    } as never);
    vi.mocked(prisma.passwordResetToken.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({} as never);

    const response = await invokeHandler(startPasswordResetHandler, {
      body: {
        email: "user@example.com",
      },
    });

    expect(response.status).toBe(200);
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "11111111-1111-4111-8111-111111111111",
        usedAt: null,
      },
    });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledOnce();
    expect(sendAuthEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: "user@example.com",
      kind: "password_reset",
    }));
  });
});

async function invokeHandler(
  handler: RequestHandler,
  input: {
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
): Promise<{
  body: unknown;
  cookies: Record<string, string>;
  redirectUrl: string | null;
  status: number;
}> {
  const req = {
    body: input.body ?? {},
    header(name: string) {
      return input.headers?.[name.toLowerCase()];
    },
    ip: "127.0.0.1",
    query: input.query ?? {},
  };
  const res = createResponse();
  const next = vi.fn((error?: unknown) => {
    if (error) {
      errorMiddleware(error, req as never, res as never, vi.fn());
    }
  });

  await handler(req as never, res as never, next);

  return {
    body: res.body,
    cookies: res.cookies,
    redirectUrl: res.redirectUrl,
    status: res.statusCode,
  };
}

function createResponse() {
  return {
    body: null as unknown,
    cookies: {} as Record<string, string>,
    locals: {
      requestId: "test-request-id",
    },
    redirectUrl: null as string | null,
    statusCode: 200,
    clearCookie(name: string) {
      delete this.cookies[name];
      return this;
    },
    cookie(name: string, value: string) {
      this.cookies[name] = value;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    redirect(url: string) {
      this.statusCode = 302;
      this.redirectUrl = url;
      return this;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

function setOidcEnv() {
  process.env.AUTH_STATE_SECRET = "test-auth-state-secret-at-least-32-chars";
  process.env.OIDC_CLIENT_ID = "test-client-id";
  process.env.OIDC_CLIENT_SECRET = "test-client-secret";
  process.env.OIDC_ISSUER_URL = "https://accounts.example.test";
  process.env.OIDC_PROVIDER_ID = "google";
  process.env.OIDC_PROVIDER_LABEL = "Google";
  process.env.OIDC_REDIRECT_URI = "http://127.0.0.1:3000/api/v1/auth/oidc/callback";
  process.env.WEB_APP_URL = "http://127.0.0.1:5173";
}
