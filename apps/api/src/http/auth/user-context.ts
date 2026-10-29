import type { AuthSource } from "@im/contracts";
import type { Request } from "express";

import { HttpError } from "../errors/http-error";

type RequestWithAuthContext = Request & {
  actorUserId?: string;
  authSource?: AuthSource;
};

export function getRequiredActorUserId(req: Request): string {
  const authReq = req as RequestWithAuthContext;

  if (authReq.actorUserId) {
    return authReq.actorUserId;
  }

  throw new HttpError(401, "authentication_required", "Authentication session is required");
}

export function getActorAuthSource(req: Request) {
  return (req as RequestWithAuthContext).authSource ?? "session";
}
