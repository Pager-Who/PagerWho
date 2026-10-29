import type { NotificationLog } from "@im/contracts";
import { DeadLetterNotificationQuerySchema, NotificationLogQuerySchema, UuidSchema } from "@im/contracts";
import { NotificationService } from "@im/backend-core";
import { prisma } from "@im/db";
import type { RequestHandler } from "express";

import { assertActorWorkspaceMember, getActorWorkspaceIds } from "../auth/workspace-access";
import { HttpError } from "../errors/http-error";
import { mapWorkspaceError } from "./workspaces.handler";

const notificationService = new NotificationService(prisma);

export const listNotificationsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = NotificationLogQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_notification_filter", "Invalid notification filter", parsedQuery.error.flatten());
    }

    const workspaceIds = await resolveNotificationReadWorkspaceIds(req, parsedQuery.data.incident_id);
    const notifications = await notificationService.listNotifications(parsedQuery.data, {
      workspaceIds,
    });
    res.json({
      data: {
        ...notifications,
        items: notifications.items.map(maskNotification),
      },
    });
  } catch (error) {
    next(mapNotificationError(error));
  }
};

export const getNotificationHandler: RequestHandler = async (req, res, next) => {
  try {
    const notificationId = parseNotificationId(req.params.notificationId);
    await assertNotificationMemberAccess(req, notificationId);

    const notification = await notificationService.getNotification(notificationId);

    if (!notification) {
      throw new HttpError(404, "notification_not_found", "Notification not found");
    }

    res.json({ data: maskNotification(notification) });
  } catch (error) {
    next(mapNotificationError(error));
  }
};

export const listDeadLetterNotificationsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = DeadLetterNotificationQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_dead_letter_filter", "Invalid dead-letter notification filter", parsedQuery.error.flatten());
    }

    const workspaceIds = await resolveNotificationReadWorkspaceIds(req, parsedQuery.data.incident_id);
    const notifications = await notificationService.listDeadLetterNotifications(parsedQuery.data, {
      workspaceIds,
    });
    res.json({
      data: {
        ...notifications,
        items: notifications.items.map(maskNotification),
      },
    });
  } catch (error) {
    next(mapNotificationError(error));
  }
};

export const listNotificationAttemptsHandler: RequestHandler = async (req, res, next) => {
  try {
    const notificationId = parseNotificationId(req.params.notificationId);
    await assertNotificationMemberAccess(req, notificationId);

    const notification = await notificationService.getNotification(notificationId);

    if (!notification) {
      throw new HttpError(404, "notification_not_found", "Notification not found");
    }

    const attempts = await notificationService.listDeliveryAttempts(notificationId);
    res.json({ data: attempts });
  } catch (error) {
    next(mapNotificationError(error));
  }
};

function parseNotificationId(value: string | undefined) {
  const parsedNotificationId = UuidSchema.safeParse(value);

  if (!parsedNotificationId.success) {
    throw new HttpError(400, "invalid_notification_id", "Invalid notification id", parsedNotificationId.error.flatten());
  }

  return parsedNotificationId.data;
}

async function resolveNotificationReadWorkspaceIds(req: Parameters<RequestHandler>[0], incidentId: string | undefined) {
  if (!incidentId) {
    return getActorWorkspaceIds(req);
  }

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

  await assertActorWorkspaceMember(req, incident.workspaceId);

  return [incident.workspaceId];
}

async function assertNotificationMemberAccess(req: Parameters<RequestHandler>[0], notificationId: string) {
  const notification = await prisma.notificationLog.findUnique({
    where: {
      id: notificationId,
    },
    select: {
      incident: {
        select: {
          workspaceId: true,
        },
      },
    },
  });

  if (!notification) {
    throw new HttpError(404, "notification_not_found", "Notification not found");
  }

  await assertActorWorkspaceMember(req, notification.incident.workspaceId);
}

function mapNotificationError(error: unknown) {
  return mapWorkspaceError(error);
}

function maskNotification(notification: NotificationLog): NotificationLog {
  return {
    ...notification,
    target_address: maskNotificationTargetAddress(notification.target_address),
  };
}

function maskNotificationTargetAddress(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value);
      return `${url.origin}/***`;
    } catch {
      return "***";
    }
  }

  const [localPart, domain] = value.split("@");

  if (localPart && domain) {
    return `${localPart.slice(0, 2)}***@${domain}`;
  }

  return value ? "***" : "";
}
