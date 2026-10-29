import cors from "cors";
import express from "express";

import { errorMiddleware } from "./http/middleware/error.middleware";
import { authContextMiddleware } from "./http/middleware/auth-context.middleware";
import { notFoundMiddleware } from "./http/middleware/not-found.middleware";
import { requestIdMiddleware } from "./http/middleware/request-id.middleware";
import { requestLoggingMiddleware } from "./http/middleware/request-logging.middleware";
import { trustedOriginMiddleware } from "./http/middleware/trusted-origin.middleware";
import { buildOriginPolicy, isOriginAllowed, normalizeOrigin } from "./http/security/origin-policy";
import { registerRoutes } from "./http/routes";
import { registerOpenApiRoutes } from "./openapi/routes";

export function createApp() {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);
  app.use(cors({
    credentials: true,
    origin: resolveCorsOrigin(),
  }));
  app.use(trustedOriginMiddleware);
  app.use(express.json({ limit: "1mb" }));
  app.use(authContextMiddleware);

  app.get("/health", (_req, res) => {
    res.json({ data: { status: "ok" } });
  });

  registerOpenApiRoutes(app);
  registerRoutes(app);
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

export function resolveCorsOrigin() {
  const policy = buildOriginPolicy();

  return (requestOrigin: string | undefined, callback: (error: Error | null, origin?: boolean | string) => void) => {
    if (!requestOrigin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(requestOrigin);

    if (!normalizedOrigin || !isOriginAllowed(normalizedOrigin, policy)) {
      callback(null, false);
      return;
    }

    callback(null, normalizedOrigin);
  };
}
