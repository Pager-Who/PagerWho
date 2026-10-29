import type { RequestHandler } from "express";

export const notFoundMiddleware: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "route_not_found",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      request_id: res.locals.requestId,
    },
  });
};
