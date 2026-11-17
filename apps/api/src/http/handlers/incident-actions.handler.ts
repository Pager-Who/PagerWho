import type { IncidentActionLink } from "@im/contracts";
import { IncidentService, verifyIncidentActionToken, WorkspaceError, WorkspaceService } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { apiLogger } from "../../logger";
import { HttpError } from "../errors/http-error";

// Signed acknowledge links from notifications. The token itself is the credential (no session),
// so every request re-checks that the responder can still act on the incident.
const incidentService = new IncidentService(prisma);
const workspaceService = new WorkspaceService(prisma);

type ResolvedActionLink = {
  link: IncidentActionLink;
  incidentId: string;
  userId: string;
};

export const getIncidentActionLinkHandler: RequestHandler = async (req, res, next) => {
  try {
    const { link } = await resolveActionLink(req.params.token);
    res.json({ data: link });
  } catch (error) {
    next(error);
  }
};

export const acknowledgeIncidentActionLinkHandler: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await acknowledgeLink(req.params.token) });
  } catch (error) {
    next(error);
  }
};

// Twilio <Gather> callback: the responder pressed a key during the incident phone call.
export const voiceIncidentActionLinkHandler: RequestHandler = async (req, res) => {
  const digits = typeof req.body?.Digits === "string" ? req.body.Digits : "";
  let spoken: string;

  if (digits !== "1") {
    spoken = "No action was taken. Goodbye.";
  } else {
    try {
      const link = await acknowledgeLink(req.params.token);
      spoken = link.incident.status === "resolved"
        ? "This incident is already resolved. Goodbye."
        : "The incident has been acknowledged. Goodbye.";
    } catch (error) {
      apiLogger.warn("Voice acknowledge failed", { code: error instanceof HttpError ? error.code : "unexpected" });
      spoken = "The incident could not be acknowledged. Please open Pager Who. Goodbye.";
    }
  }

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>${spoken}</Say></Response>`);
};

async function acknowledgeLink(token: string | undefined) {
  const { incidentId, link, userId } = await resolveActionLink(token);
  if (link.incident.status !== "triggered") return link;

  await incidentService.acknowledgeIncident(incidentId, userId);
  return (await resolveActionLink(token)).link;
}

async function resolveActionLink(token: string | undefined): Promise<ResolvedActionLink> {
  const verified = token ? verifyIncidentActionToken(token) : null;

  if (!verified) {
    throw new HttpError(404, "incident_action_link_invalid", "This link is invalid or has expired");
  }

  const [incident, user] = await Promise.all([
    prisma.incident.findUnique({
      where: { id: verified.incidentId },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        severity: true,
        priority: true,
        status: true,
        createdAt: true,
        service: { select: { name: true } },
        workspace: { select: { suspendedAt: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: verified.userId },
      select: { name: true, suspendedAt: true },
    }),
  ]);

  if (!incident || !user) {
    throw new HttpError(404, "incident_action_link_invalid", "This link is invalid or has expired");
  }

  if (user.suspendedAt || incident.workspace.suspendedAt) {
    throw forbiddenLinkError();
  }

  try {
    await workspaceService.assertWorkspacePermission(incident.workspaceId, verified.userId, "incident.respond");
  } catch (error) {
    if (error instanceof WorkspaceError) throw forbiddenLinkError();
    throw error;
  }

  return {
    incidentId: incident.id,
    userId: verified.userId,
    link: {
      incident: {
        id: incident.id,
        title: incident.title,
        service_name: incident.service.name,
        severity: incident.severity,
        priority: incident.priority,
        status: incident.status,
        created_at: incident.createdAt.toISOString(),
      },
      responder_name: user.name,
      expires_at: verified.expiresAt.toISOString(),
    },
  };
}

function forbiddenLinkError() {
  return new HttpError(403, "incident_action_link_forbidden", "You can no longer respond to this incident");
}
