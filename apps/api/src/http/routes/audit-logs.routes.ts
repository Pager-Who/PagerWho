import { Router } from "express";

import { listAuditLogsHandler } from "../handlers/audit-logs.handler";

export const auditLogsRoutes = Router();

auditLogsRoutes.get("/", listAuditLogsHandler);
