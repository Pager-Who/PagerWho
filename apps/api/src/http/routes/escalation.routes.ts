import { Router } from "express";

import {
  createEscalationPolicyHandler,
  deleteEscalationPolicyHandler,
  getEscalationPolicyHandler,
  listEscalationPoliciesHandler,
  updateEscalationPolicyHandler,
} from "../handlers/escalation.handler";

export const escalationRoutes = Router();

escalationRoutes.get("/", listEscalationPoliciesHandler);
escalationRoutes.post("/", createEscalationPolicyHandler);
escalationRoutes.get("/:policyId", getEscalationPolicyHandler);
escalationRoutes.put("/:policyId", updateEscalationPolicyHandler);
escalationRoutes.delete("/:policyId", deleteEscalationPolicyHandler);
