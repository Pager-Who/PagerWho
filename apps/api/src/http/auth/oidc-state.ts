import crypto from "node:crypto";

import type { Request, Response } from "express";

import { HttpError } from "../errors/http-error";
import { getAuthStateSecret } from "./oidc-config";

export type OidcStatePayload = {
  codeVerifier: string;
  issuedAt: number;
  nonce: string;
  returnTo: string | null;
  state: string;
};

const oidcStateCookieName = "pagerwho_oidc";
const stateTtlMs = 10 * 60 * 1000;

export function createOidcStatePayload(returnTo: string | null): OidcStatePayload {
  return {
    codeVerifier: createRandomValue(),
    issuedAt: Date.now(),
    nonce: createRandomValue(),
    returnTo,
    state: createRandomValue(),
  };
}

export function setOidcStateCookie(res: Response, payload: OidcStatePayload) {
  const secret = getRequiredStateSecret();
  const serializedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(serializedPayload, secret);

  res.cookie(oidcStateCookieName, `${serializedPayload}.${signature}`, {
    httpOnly: true,
    maxAge: stateTtlMs,
    path: "/api/v1/auth/oidc",
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
  });
}

export function consumeOidcStateCookie(req: Request, res: Response) {
  const rawCookie = parseCookieHeader(req.header("cookie"))[oidcStateCookieName];
  clearOidcStateCookie(res);

  if (!rawCookie) {
    throw new HttpError(400, "oidc_state_missing", "OIDC state cookie is missing");
  }

  const [serializedPayload, signature] = rawCookie.split(".");

  if (!serializedPayload || !signature) {
    throw new HttpError(400, "oidc_state_invalid", "OIDC state cookie is invalid");
  }

  const expectedSignature = sign(serializedPayload, getRequiredStateSecret());

  if (!constantTimeEqual(signature, expectedSignature)) {
    throw new HttpError(400, "oidc_state_invalid", "OIDC state signature is invalid");
  }

  const payload = parsePayload(serializedPayload);

  if (Date.now() - payload.issuedAt > stateTtlMs) {
    throw new HttpError(400, "oidc_state_expired", "OIDC state has expired");
  }

  return payload;
}

export function clearOidcStateCookie(res: Response) {
  res.clearCookie(oidcStateCookieName, {
    httpOnly: true,
    path: "/api/v1/auth/oidc",
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
  });
}

export function createCodeChallenge(codeVerifier: string) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

function createRandomValue() {
  return crypto.randomBytes(32).toString("base64url");
}

function getRequiredStateSecret() {
  const secret = getAuthStateSecret();

  if (!secret) {
    throw new HttpError(503, "oidc_state_secret_not_configured", "OIDC state secret is not configured");
  }

  return secret;
}

function parsePayload(serializedPayload: string): OidcStatePayload {
  try {
    const parsed = JSON.parse(Buffer.from(serializedPayload, "base64url").toString("utf8")) as Partial<OidcStatePayload>;

    if (
      typeof parsed.codeVerifier !== "string"
      || typeof parsed.issuedAt !== "number"
      || typeof parsed.nonce !== "string"
      || typeof parsed.state !== "string"
      || (parsed.returnTo !== null && parsed.returnTo !== undefined && typeof parsed.returnTo !== "string")
    ) {
      throw new Error("Invalid OIDC state payload");
    }

    return {
      codeVerifier: parsed.codeVerifier,
      issuedAt: parsed.issuedAt,
      nonce: parsed.nonce,
      returnTo: parsed.returnTo ?? null,
      state: parsed.state,
    };
  } catch {
    throw new HttpError(400, "oidc_state_invalid", "OIDC state cookie is invalid");
  }
}

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function constantTimeEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return valueBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
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
