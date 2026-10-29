import { Router } from "express";

import {
  checkUserPhoneVerificationHandler,
  listUsersHandler,
  startUserPhoneVerificationHandler,
  updateUserNotificationPreferencesHandler,
} from "../handlers/users.handler";

export const usersRoutes = Router();

usersRoutes.get("/", listUsersHandler);
usersRoutes.put("/:userId/notification-preferences", updateUserNotificationPreferencesHandler);
usersRoutes.post("/:userId/phone-verification/start", startUserPhoneVerificationHandler);
usersRoutes.post("/:userId/phone-verification/check", checkUserPhoneVerificationHandler);
