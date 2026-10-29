import type { AuthSource } from "@im/contracts";
import type { RequestHandler } from "express";

import { resolveAuthSession } from "../auth/auth-session";

type RequestWithAuthContext = Parameters<RequestHandler>[0] & {
  actorUserId?: string;
  authSource?: AuthSource;
};

export const authContextMiddleware: RequestHandler = async (req, _res, next) => {
  try {
    const session = await resolveAuthSession(req);

    if (session) {
      const authReq = req as RequestWithAuthContext;
      authReq.actorUserId = session.userId;
      authReq.authSource = "session";
    }

    next();
  } catch (error) {
    next(error);
  }
};
