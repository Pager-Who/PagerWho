import { Router } from "express";

import {
  getPlatformMeHandler,
  getPlatformDiagnosticsHandler,
  getPlatformInspectorHandler,
  listPlatformResourcesHandler,
  getPlatformOverviewHandler,
  getPlatformUserHandler,
  getPlatformWorkspaceHandler,
  listPlatformUsersHandler,
  listPlatformWorkspacesHandler,
  restorePlatformUserHandler,
  revokePlatformUserSessionsHandler,
  restorePlatformWorkspaceHandler,
  retryPlatformNotificationHandler,
  sendPlatformUserAuthEmailHandler,
  suspendPlatformUserHandler,
  suspendPlatformWorkspaceHandler,
  updatePlatformWorkspaceMemberRolesHandler,
  updateWorkspaceQuotaOverrideHandler,
} from "../handlers/platform.handler";

export const platformRoutes = Router();

platformRoutes.get("/me", getPlatformMeHandler);
platformRoutes.get("/overview", getPlatformOverviewHandler);
platformRoutes.get("/diagnostics", getPlatformDiagnosticsHandler);
platformRoutes.get("/inspect", getPlatformInspectorHandler);
platformRoutes.get("/resources", listPlatformResourcesHandler);
platformRoutes.post("/diagnostics/notifications/:notificationId/retry", retryPlatformNotificationHandler);
platformRoutes.get("/users", listPlatformUsersHandler);
platformRoutes.get("/users/:userId", getPlatformUserHandler);
platformRoutes.post("/users/:userId/suspend", suspendPlatformUserHandler);
platformRoutes.post("/users/:userId/restore", restorePlatformUserHandler);
platformRoutes.post("/users/:userId/sessions/revoke", revokePlatformUserSessionsHandler);
platformRoutes.post("/users/:userId/auth-email", sendPlatformUserAuthEmailHandler);
platformRoutes.get("/workspaces", listPlatformWorkspacesHandler);
platformRoutes.get("/workspaces/:workspaceId", getPlatformWorkspaceHandler);
platformRoutes.patch("/workspaces/:workspaceId/quota-override", updateWorkspaceQuotaOverrideHandler);
platformRoutes.post("/workspaces/:workspaceId/suspend", suspendPlatformWorkspaceHandler);
platformRoutes.post("/workspaces/:workspaceId/restore", restorePlatformWorkspaceHandler);
platformRoutes.patch("/workspaces/:workspaceId/members/:userId/roles", updatePlatformWorkspaceMemberRolesHandler);
