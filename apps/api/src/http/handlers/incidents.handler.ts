import {
  CreateIncidentRequestSchema,
  IncidentActionRequestSchema,
  IncidentFilterSchema,
  IncidentNotificationsQuerySchema,
  IncidentTimelineQuerySchema,
  ManualEscalationRequestSchema,
  UpdateIncidentPriorityRequestSchema,
  UuidSchema,
} from "@im/contracts";
import {
  EscalationError,
  EscalationService,
  IncidentError,
  IncidentService,
  WorkspaceError,
  WorkspaceService,
} from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { getRequiredActorUserId } from "../auth/user-context";
import { assertActorWorkspaceMember, getActorWorkspaceIds } from "../auth/workspace-access";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const incidentService = new IncidentService(prisma);
const escalationService = new EscalationService(prisma);
const workspaceService = new WorkspaceService(prisma);

export const listIncidentsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = IncidentFilterSchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_incident_filter", "Invalid incident filter", parsedQuery.error.flatten());
    }

    const workspaceIds = parsedQuery.data.workspace_id
      ? undefined
      : await getActorWorkspaceIds(req);

    if (parsedQuery.data.workspace_id) {
      await assertActorWorkspaceMember(req, parsedQuery.data.workspace_id);
    }

    const incidentsPage = await incidentService.listIncidents({
      ...parsedQuery.data,
      ...(workspaceIds ? { workspaceIds } : {}),
    });
    res.json({ data: incidentsPage });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const createIncidentHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = CreateIncidentRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_incident_request", "Invalid incident request", parsedBody.error.flatten());
    }

    const service = await prisma.service.findUnique({
      where: {
        id: parsedBody.data.service_id,
      },
      select: {
        workspaceId: true,
      },
    });

    if (!service) {
      throw new HttpError(404, "service_not_found", "Service not found");
    }

    await workspaceService.assertWorkspacePermission(service.workspaceId, getRequiredActorUserId(req), "incident.create");

    const incident = await incidentService.createManualIncident(parsedBody.data);
    res.status(201).json({ data: incident });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const getIncidentHandler: RequestHandler = async (req, res, next) => {
  try {
    const incidentId = parseIncidentId(req.params.incidentId);
    await assertIncidentMemberAccess(incidentId, getRequiredActorUserId(req));

    const incident = await incidentService.getIncident(incidentId);

    if (!incident) {
      throw new HttpError(404, "incident_not_found", "Incident not found");
    }

    res.json({ data: incident });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const getIncidentDetailHandler: RequestHandler = async (req, res, next) => {
  try {
    const incidentId = parseIncidentId(req.params.incidentId);
    await assertIncidentMemberAccess(incidentId, getRequiredActorUserId(req));

    const detail = await incidentService.getIncidentDetail(incidentId);

    if (!detail) {
      throw new HttpError(404, "incident_not_found", "Incident not found");
    }

    res.json({ data: detail });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const acknowledgeIncidentHandler: RequestHandler = async (req, res, next) => {
  try {
    const incidentId = parseIncidentId(req.params.incidentId);
    const parsedBody = IncidentActionRequestSchema.safeParse(req.body ?? {});

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_incident_action", "Invalid incident action", parsedBody.error.flatten());
    }

    const actorUserId = getRequiredActorUserId(req);
    await assertIncidentActionAccess(incidentId, actorUserId);

    const incident = await incidentService.acknowledgeIncident(incidentId, actorUserId);
    res.json({ data: incident });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const resolveIncidentHandler: RequestHandler = async (req, res, next) => {
  try {
    const incidentId = parseIncidentId(req.params.incidentId);
    const parsedBody = IncidentActionRequestSchema.safeParse(req.body ?? {});

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_incident_action", "Invalid incident action", parsedBody.error.flatten());
    }

    const actorUserId = getRequiredActorUserId(req);
    await assertIncidentActionAccess(incidentId, actorUserId);

    const incident = await incidentService.resolveIncident(incidentId, actorUserId);
    res.json({ data: incident });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const updateIncidentPriorityHandler: RequestHandler = async (req, res, next) => {
  try {
    const incidentId = parseIncidentId(req.params.incidentId);
    const parsedBody = UpdateIncidentPriorityRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_incident_priority_request", "Invalid incident priority request", parsedBody.error.flatten());
    }

    const actorUserId = getRequiredActorUserId(req);
    await assertIncidentActionAccess(incidentId, actorUserId);

    const incident = await incidentService.updateIncidentPriority(incidentId, parsedBody.data.priority, actorUserId);
    res.json({ data: incident });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const triggerManualEscalationHandler: RequestHandler = async (req, res, next) => {
  try {
    const incidentId = parseIncidentId(req.params.incidentId);
    const parsedBody = ManualEscalationRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_manual_escalation_request", "Invalid manual escalation request", parsedBody.error.flatten());
    }

    const actorUserId = getRequiredActorUserId(req);
    await assertIncidentActionAccess(incidentId, actorUserId);

    const state = await escalationService.triggerManualEscalation(incidentId, parsedBody.data, actorUserId);
    res.json({ data: state });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const getIncidentTimelineHandler: RequestHandler = async (req, res, next) => {
  try {
    const incidentId = parseIncidentId(req.params.incidentId);
    await assertIncidentMemberAccess(incidentId, getRequiredActorUserId(req));

    const parsedQuery = IncidentTimelineQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_timeline_query", "Invalid timeline query", parsedQuery.error.flatten());
    }

    const timelinePage = await incidentService.listTimelineEntries(incidentId, parsedQuery.data);
    res.json({ data: timelinePage });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const getIncidentNotificationsHandler: RequestHandler = async (req, res, next) => {
  try {
    const incidentId = parseIncidentId(req.params.incidentId);
    await assertIncidentMemberAccess(incidentId, getRequiredActorUserId(req));

    const parsedQuery = IncidentNotificationsQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_incident_notifications_query", "Invalid incident notifications query", parsedQuery.error.flatten());
    }

    const notifications = await incidentService.listNotifications(incidentId, parsedQuery.data);
    res.json({ data: notifications });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

export const getIncidentEscalationHandler: RequestHandler = async (req, res, next) => {
  try {
    const incidentId = parseIncidentId(req.params.incidentId);
    await assertIncidentMemberAccess(incidentId, getRequiredActorUserId(req));

    const escalationState = await incidentService.getEscalationState(incidentId);
    res.json({ data: escalationState });
  } catch (error) {
    next(mapIncidentError(error));
  }
};

function parseIncidentId(value: string | undefined) {
  const parsedIncidentId = UuidSchema.safeParse(value);

  if (!parsedIncidentId.success) {
    throw new HttpError(400, "invalid_incident_id", "Invalid incident id", parsedIncidentId.error.flatten());
  }

  return parsedIncidentId.data;
}

async function assertIncidentMemberAccess(incidentId: string, actorUserId: string) {
  const incident = await prisma.incident.findUnique({
    where: {
      id: incidentId,
    },
    select: {
      workspaceId: true,
    },
  });

  if (!incident) {
    throw new HttpError(404, "incident_not_found", "Incident not found");
  }

  return workspaceService.assertMember(incident.workspaceId, actorUserId);
}

async function assertIncidentActionAccess(incidentId: string, actorUserId: string) {
  await assertIncidentMemberAccess(incidentId, actorUserId);
  const incident = await prisma.incident.findUnique({
    where: {
      id: incidentId,
    },
    select: {
      workspaceId: true,
    },
  });

  if (!incident) {
    throw new HttpError(404, "incident_not_found", "Incident not found");
  }

  await workspaceService.assertWorkspacePermission(incident.workspaceId, actorUserId, "incident.respond");
}

function mapIncidentError(error: unknown) {
  if (error instanceof WorkspaceError) {
    return mapWorkspaceError(error);
  }

  if (error instanceof IncidentError) {
    if (error.code === "incident_not_found" || error.code === "service_not_found" || error.code === "actor_not_found") {
      return new HttpError(404, error.code, error.message);
    }

    if (error.code === "invalid_incident_transition") {
      return new HttpError(409, error.code, error.message);
    }
  }

  if (error instanceof EscalationError) {
    if (
      error.code === "actor_not_found"
      || error.code === "incident_not_found"
      || error.code === "incident_escalation_state_not_found"
      || error.code === "escalation_policy_not_found"
    ) {
      return new HttpError(404, error.code, error.message);
    }

    if (
      error.code === "invalid_incident_state"
      || error.code === "invalid_manual_escalation_action"
      || error.code === "invalid_escalation_policy"
    ) {
      return new HttpError(409, error.code, error.message);
    }
  }

  return error;
}
