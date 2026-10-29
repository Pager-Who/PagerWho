import type { Express } from "express";

import { activityLogsRoutes } from "./activity-logs.routes";
import { auditLogsRoutes } from "./audit-logs.routes";
import { authRoutes } from "./auth.routes";
import { escalationRoutes } from "./escalation.routes";
import { incidentsRoutes } from "./incidents.routes";
import { meRoutes } from "./me.routes";
import { notificationsRoutes } from "./notifications.routes";
import { onCallRoutes } from "./on-call.routes";
import { platformRoutes } from "./platform.routes";
import { servicesRoutes } from "./services.routes";
import { teamsRoutes } from "./teams.routes";
import { usersRoutes } from "./users.routes";
import { webhooksRoutes } from "./webhooks.routes";
import { workersRoutes } from "./workers.routes";
import { workflowRunsRoutes, workflowsRoutes } from "./workflows.routes";
import { workspacesRoutes } from "./workspaces.routes";

export function registerRoutes(app: Express) {
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/activity-logs", activityLogsRoutes);
  app.use("/api/v1/audit-logs", auditLogsRoutes);
  app.use("/api/v1/me", meRoutes);
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/users", usersRoutes);
  app.use("/api/v1/teams", teamsRoutes);
  app.use("/api/v1/services", servicesRoutes);
  app.use("/api/v1/incidents", incidentsRoutes);
  app.use("/api/v1/webhooks", webhooksRoutes);
  app.use("/api/v1/on-call", onCallRoutes);
  app.use("/api/v1/escalation-policies", escalationRoutes);
  app.use("/api/v1/notifications", notificationsRoutes);
  app.use("/api/v1/platform", platformRoutes);
  app.use("/api/v1/workers", workersRoutes);
  app.use("/api/v1/workflows", workflowsRoutes);
  app.use("/api/v1/workflow-runs", workflowRunsRoutes);
}
