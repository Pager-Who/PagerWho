import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@im/db", async () => ({ prisma: { copilotProposal: (await import("./copilot-proposals.fixtures")).fakeCopilotProposalStore() } }));

import { consumeProposal, rememberProposal } from "./copilot-proposals";

const draft = { id: "model-id", actions: [], goal: "test", summary: "test", risks: [], missing_inputs: [] };

describe("server-owned approvals", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects tampering and other actors, then allows the owner exactly once", async () => {
    const proposal = await rememberProposal(draft, "actor", "snapshot");
    expect(proposal.id).not.toBe(draft.id);
    await expect(consumeProposal(proposal, "other")).rejects.toMatchObject({ code: "copilot_proposal_expired" });
    await expect(consumeProposal({ ...proposal, summary: "tampered" }, "actor")).rejects.toMatchObject({ code: "copilot_proposal_changed" });
    expect((await consumeProposal(proposal, "actor")).fingerprint).toBe("snapshot");
    await expect(consumeProposal(proposal, "actor")).rejects.toMatchObject({ code: "copilot_proposal_expired" });
  });

  it("lets only one of two concurrent approvals execute", async () => {
    const proposal = await rememberProposal(draft, "actor", "snapshot");
    const results = await Promise.allSettled([consumeProposal(proposal, "actor"), consumeProposal(proposal, "actor")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("expires after ten minutes", async () => {
    vi.useFakeTimers();
    const proposal = await rememberProposal(draft, "actor", "snapshot");
    vi.advanceTimersByTime(10 * 60_000);
    await expect(consumeProposal(proposal, "actor")).rejects.toMatchObject({ code: "copilot_proposal_expired" });
  });

  it("limits pending proposals per user", async () => {
    for (let index = 0; index < 20; index++) await rememberProposal(draft, "busy-actor", "snapshot");
    await expect(rememberProposal(draft, "busy-actor", "snapshot")).rejects.toMatchObject({ code: "copilot_proposal_limit" });
  });
});
