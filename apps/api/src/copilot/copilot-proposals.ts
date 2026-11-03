import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { CopilotProposalSchema, type CopilotProposal } from "@im/contracts";
import { prisma, type Prisma } from "@im/db";

import { HttpError } from "../http/errors/http-error";

// Stored in PostgreSQL so a proposal made on one API replica can be approved on another.
const ttlMs = 10 * 60_000;
const maxPendingPerActor = 20;
const expired = () => new HttpError(409, "copilot_proposal_expired", "This proposal is expired, already used, or belongs to another session. Request a new proposal.");

export async function rememberProposal(proposal: CopilotProposal, actorUserId: string, fingerprint: string) {
  const now = new Date();
  await prisma.copilotProposal.deleteMany({ where: { expiresAt: { lte: now } } });
  if (await prisma.copilotProposal.count({ where: { actorUserId } }) >= maxPendingPerActor) {
    throw new HttpError(429, "copilot_proposal_limit", "Too many pending Copilot proposals. Try again later.");
  }
  const stored = CopilotProposalSchema.parse({ ...proposal, id: randomUUID() });
  await prisma.copilotProposal.create({ data: {
    id: stored.id, actorUserId, fingerprint, proposal: stored as Prisma.InputJsonObject, expiresAt: new Date(now.getTime() + ttlMs),
  } });
  return stored;
}

export async function consumeProposal(proposal: CopilotProposal, actorUserId: string) {
  const where = { id: proposal.id, actorUserId, expiresAt: { gt: new Date() } };
  const entry = await prisma.copilotProposal.findFirst({ where });
  if (!entry) throw expired();
  const stored = CopilotProposalSchema.parse(entry.proposal);
  if (!isDeepStrictEqual(CopilotProposalSchema.parse(proposal), stored)) {
    throw new HttpError(409, "copilot_proposal_changed", "The proposal changed. Request a new proposal before approving.");
  }
  // The conditional delete is the single-use gate: only one concurrent request (on any replica) removes the row.
  const { count } = await prisma.copilotProposal.deleteMany({ where });
  if (count !== 1) throw expired();
  return { actorUserId, proposal: stored, fingerprint: entry.fingerprint };
}
