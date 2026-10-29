import type { ErrorRequestHandler } from "express";

import { apiLogger } from "../../logger";
import { HttpError } from "../errors/http-error";

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (isQuotaError(error)) {
    res.status(403).json({
      error: {
        code: "quota_exceeded",
        message: error.message,
        details: error.details,
        request_id: res.locals.requestId,
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        request_id: res.locals.requestId,
      },
    });
    return;
  }

  apiLogger.error("Unhandled API error", {
    error,
    request_id: res.locals.requestId,
  });

  res.status(500).json({
    error: {
      code: "internal_server_error",
      message: "Internal server error",
      request_id: res.locals.requestId,
    },
  });
};

function isQuotaError(error: unknown): error is Error & {
  details: {
    current: number;
    limit: number;
    resource: string;
  };
} {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "quota_exceeded"
    && "details" in error
    && typeof error.details === "object"
    && error.details !== null
    && error instanceof Error;
}
