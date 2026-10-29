import crypto from "node:crypto";

import { prisma } from "@im/db";
import type { Request, Response } from "express";

import { HttpError } from "../errors/http-error";

export const authSessionCookieName = "pagerwho_session";

type CreateAuthSessionResult = {
  expiresAt: Date;
  id: string;
  token: string;
};

type ResolvedAuthSession = {
  expiresAt: Date;
  id: string;
  userId: string;
};

const defaultSessionTtlSeconds = 60 * 60 * 24 * 30;

export async function createAuthSession(userId: string, req: Request): Promise<CreateAuthSessionResult> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + getSessionTtlSeconds() * 1000);
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: req.header("user-agent") ?? null,
      ipAddress: req.ip ?? null,
    },
  });

  return {
    expiresAt,
    id: session.id,
    token,
  };
}

export async function resolveAuthSession(req: Request): Promise<ResolvedAuthSession | null> {
  const token = getAuthSessionToken(req);

  if (!token) {
    return null;
  }

  const session = await prisma.authSession.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
    select: {
      expiresAt: true,
      id: true,
      revokedAt: true,
      user: {
        select: {
          suspendedAt: true,
        },
      },
      userId: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.user.suspendedAt) {
    throw new HttpError(403, "user_suspended", "User account is suspended");
  }

  if (session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  return {
    expiresAt: session.expiresAt,
    id: session.id,
    userId: session.userId,
  };
}

export async function revokeAuthSession(req: Request): Promise<boolean> {
  const token = getAuthSessionToken(req);

  if (!token) {
    return false;
  }

  const result = await prisma.authSession.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count > 0;
}

export function setAuthSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(authSessionCookieName, token, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
  });
}

export function clearAuthSessionCookie(res: Response) {
  res.clearCookie(authSessionCookieName, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
  });
}

function getAuthSessionToken(req: Request) {
  return parseCookieHeader(req.header("cookie"))[authSessionCookieName];
}

function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getSessionTtlSeconds() {
  const raw = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? defaultSessionTtlSeconds);

  if (!Number.isFinite(raw) || raw <= 0) {
    return defaultSessionTtlSeconds;
  }

  return Math.floor(raw);
}

function shouldUseSecureCookies() {
  return process.env.AUTH_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
}

function parseCookieHeader(cookieHeader: string | undefined) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }

  return cookies;
}
