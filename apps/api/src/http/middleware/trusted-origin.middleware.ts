import type { RequestHandler } from "express";

import { HttpError } from "../errors/http-error";
import { isOriginAllowed, normalizeOrigin } from "../security/origin-policy";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const trustedOriginMiddleware: RequestHandler = (req, _res, next) => {
  if (safeMethods.has(req.method) || isWebhookIngestionPath(req.path)) {
    next();
    return;
  }

  const requestOrigin = readRequestOrigin(req);

  if (!requestOrigin) {
    next(new HttpError(403, "missing_origin", "Origin or Referer header is required"));
    return;
  }

  if (!isOriginAllowed(requestOrigin)) {
    next(new HttpError(403, "untrusted_origin", "Request origin is not allowed"));
    return;
  }

  next();
};

function readRequestOrigin(req: Parameters<RequestHandler>[0]) {
  const origin = req.header("origin");

  if (origin) {
    return normalizeOrigin(origin);
  }

  const referer = req.header("referer");

  if (!referer) {
    return null;
  }

  try {
    return normalizeOrigin(new URL(referer).origin);
  } catch {
    return null;
  }
}

function isWebhookIngestionPath(path: string) {
  return /^\/api\/v1\/webhooks\/[0-9a-f-]+$/i.test(path);
}
