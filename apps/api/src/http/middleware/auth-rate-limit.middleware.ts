import crypto from "node:crypto";
import type { RequestHandler } from "express";

import { HttpError } from "../errors/http-error";

type AuthRateLimitKind = "login" | "register" | "password_reset" | "email_verification" | "oidc";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();
const rateLimitWindowMs = 15 * 60 * 1000;
const limits: Record<AuthRateLimitKind, number> = {
  email_verification: 5,
  login: 10,
  oidc: 10,
  password_reset: 5,
  register: 5,
};

export function authRateLimit(kind: AuthRateLimitKind): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    pruneExpiredBuckets(now);
    const keys = getRateLimitKeys(kind, req);
    const limit = limits[kind];
    const blockedBucket = keys
      .map((key) => buckets.get(key))
      .find((bucket) => bucket && bucket.resetAt > now && bucket.count >= limit);

    if (blockedBucket) {
      const retryAfterSeconds = Math.max(1, Math.ceil((blockedBucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", retryAfterSeconds);
      next(new HttpError(429, "auth_rate_limited", "Too many authentication attempts. Try again later."));
      return;
    }

    for (const key of keys) {
      const bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
      } else {
        bucket.count += 1;
      }
    }

    next();
  };
}

function getRateLimitKeys(kind: AuthRateLimitKind, req: Parameters<RequestHandler>[0]) {
  const keys = [`${kind}:ip:${hashKey(req.ip || "unknown")}`];
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

  if (email) {
    keys.push(`${kind}:account:${hashKey(email)}`);
  }

  return keys;
}

function hashKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
