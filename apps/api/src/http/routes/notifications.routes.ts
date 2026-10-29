import { Router } from "express";

import {
  getNotificationHandler,
  listDeadLetterNotificationsHandler,
  listNotificationAttemptsHandler,
  listNotificationsHandler,
} from "../handlers/notifications.handler";

export const notificationsRoutes = Router();

notificationsRoutes.get("/", listNotificationsHandler);
notificationsRoutes.get("/dead-letter", listDeadLetterNotificationsHandler);
notificationsRoutes.get("/:notificationId", getNotificationHandler);
notificationsRoutes.get("/:notificationId/attempts", listNotificationAttemptsHandler);
