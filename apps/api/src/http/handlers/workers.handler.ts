import {
  StuckEscalationQuerySchema,
  WorkerReadinessQuerySchema,
  WorkerRunLogQuerySchema,
} from "@im/contracts";
import { PlatformError, PlatformService, WorkerObservabilityService } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { assertActorWorkspaceMember, getActorWorkspaceIds } from "../auth/workspace-access";
import { getRequiredActorUserId } from "../auth/user-context";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const platformService = new PlatformService(prisma);
const workerObservabilityService = new WorkerObservabilityService(prisma);

export const getWorkerHealthHandler: RequestHandler = async (_req, res, next) => {
  try {
    const health = await workerObservabilityService.getHealth();
    res.status(health.status === "unhealthy" ? 503 : 200).json({ data: health });
  } catch (error) {
    next(error);
  }
};

export const getWorkerReadinessHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = WorkerReadinessQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_worker_readiness_query", "Invalid worker readiness query", parsedQuery.error.flatten());
    }

    const readiness = await workerObservabilityService.getReadiness({
      maxRunAgeSeconds: parsedQuery.data.max_run_age_seconds,
    });
    const statusCode = readiness.ready || parsedQuery.data.response_status === "always_200" ? 200 : 503;

    res.status(statusCode).json({ data: readiness });
  } catch (error) {
    next(error);
  }
};

export const listWorkerRunsHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    await platformService.assertPlatformAdmin(actorUserId);

    const parsedQuery = WorkerRunLogQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_worker_run_filter", "Invalid worker run filter", parsedQuery.error.flatten());
    }

    const runs = await workerObservabilityService.listRunLogs(parsedQuery.data);
    res.json({ data: runs });
  } catch (error) {
    next(mapWorkerError(error));
  }
};

export const listStuckEscalationsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = StuckEscalationQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_stuck_escalation_filter", "Invalid stuck escalation filter", parsedQuery.error.flatten());
    }

    const workspaceIds = parsedQuery.data.workspace_id
      ? undefined
      : await getActorWorkspaceIds(req);

    if (parsedQuery.data.workspace_id) {
      await assertActorWorkspaceMember(req, parsedQuery.data.workspace_id);
    }

    const stuckEscalations = await workerObservabilityService.listStuckEscalations(parsedQuery.data, {
      ...(workspaceIds ? { workspaceIds } : {}),
    });
    res.json({ data: stuckEscalations });
  } catch (error) {
    next(mapWorkspaceError(error));
  }
};

function mapWorkerError(error: unknown) {
  if (error instanceof PlatformError && error.code === "platform_admin_required") {
    return new HttpError(403, error.code, error.message);
  }

  return error;
}
