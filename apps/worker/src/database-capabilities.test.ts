import { describe, expect, it } from "vitest";

import { detectWorkerDatabaseCapabilities } from "./database-capabilities";

describe("detectWorkerDatabaseCapabilities", () => {
  it("enables legacy workers when all required tables exist", async () => {
    const db = {
      $queryRaw: async () => [{
        escalation_table: "incident_escalation_states",
        workflow_events_table: "workflow_events",
        workflow_runs_table: "workflow_runs",
      }],
    } as never;

    await expect(detectWorkerDatabaseCapabilities(db)).resolves.toEqual({
      escalation: true,
      workflow: true,
    });
  });

  it("disables legacy workers when the simplified schema removed their tables", async () => {
    const db = {
      $queryRaw: async () => [{
        escalation_table: null,
        workflow_events_table: null,
        workflow_runs_table: null,
      }],
    } as never;

    await expect(detectWorkerDatabaseCapabilities(db)).resolves.toEqual({
      escalation: false,
      workflow: false,
    });
  });
});
