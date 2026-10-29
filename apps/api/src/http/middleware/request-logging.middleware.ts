import type { RequestHandler } from "express";

import { apiLogger } from "../../logger";
import { recordActivityLog } from "@im/backend-core";
import { prisma } from "@im/db";

export const requestLoggingMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = performance.now();

  res.on("finish", () => {
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const fields = {
      request_id: res.locals.requestId,
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: durationMs,
    };

    if (res.statusCode >= 500) {
      apiLogger.error("HTTP request completed", fields);
      void recordActivityLog(prisma, {
        action: "api.request_failed",
        message: "API request completed with a server error",
        metadata: {
          duration_ms: durationMs,
          method: req.method,
          path: req.path,
          request_id: res.locals.requestId,
          status_code: res.statusCode,
        },
        resourceType: "api_request",
      }).catch(() => undefined);
      return;
    }

    if (res.statusCode >= 400) {
      apiLogger.warn("HTTP request completed", fields);
      return;
    }

    apiLogger.info("HTTP request completed", fields);
  });

  next();
};
