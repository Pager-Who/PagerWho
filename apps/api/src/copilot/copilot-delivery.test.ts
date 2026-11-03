import { randomUUID } from "node:crypto";
import { WorkspaceError } from "@im/backend-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ member: vi.fn(), permission: vi.fn(), incidents: vi.fn(), escalation: vi.fn(), logs: vi.fn() }));
vi.mock("@im/db", () => ({ prisma: {
  incident: { findMany: mocks.incidents }, incidentEscalationState: { findUnique: mocks.escalation },
  notificationLog: { findMany: mocks.logs },
} }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.member, assertWorkspacePermission: mocks.permission })),
}));

import { explainIncidentDelivery } from "./copilot-delivery";

const workspace = "22222222-2222-4222-8222-222222222222";
const actor = "11111111-1111-4111-8111-111111111111";
const incidentId = "44444444-4444-4444-8444-444444444444";
const incident = (id = incidentId) => ({ id, title: "Checkout alert", status: "triggered", serviceId: randomUUID(),
  createdAt: new Date("2030-01-07T00:00:00Z") });
const request = (question = "Why did Checkout alert not notify?", selected?: string) => ({ question, workspace_id: workspace,
  ...(selected ? { structured_input: { values: { lookup_incident: selected } } } : {}) });
const inspect = (args: unknown, selected?: string) => explainIncidentDelivery(args, request(undefined, selected), actor);

describe("incident delivery explanation evidence", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.incidents.mockResolvedValue([incident()]); mocks.escalation.mockResolvedValue(null); mocks.logs.mockResolvedValue([]); });

  it("requires incident and notification permissions before reading a scoped incident", async () => {
    mocks.permission.mockRejectedValueOnce(new WorkspaceError("workspace_permission_required", "private"));
    await expect(inspect({ id: incidentId })).rejects.toMatchObject({ statusCode: 403, code: "copilot_delivery_forbidden" });
    expect(mocks.incidents).not.toHaveBeenCalled();
  });

  it("does not infer a cause from missing escalation or notification records", async () => {
    const result = await inspect({ id: incidentId });
    if ("clarification" in result) throw new Error("Unexpected clarification");
    expect(result.data).toMatchObject({ outcome: "no_notification_records", escalation: null, notifications: [] });
    expect(result.receipt).toMatchObject({ returned_count: 0, has_more: false, delivery_verified: false });
    expect(mocks.incidents.mock.calls[0]![0].where).toMatchObject({ workspaceId: workspace, id: incidentId });
    expect(mocks.logs.mock.calls[0]![0].where).toMatchObject({ incidentId });
  });

  it("distinguishes scheduled escalation with no generated notification from a missing record", async () => {
    mocks.escalation.mockResolvedValue({ policyId: randomUUID(), currentStep: 1, repeatIteration: 0, status: "active",
      nextRunAt: new Date("2999-01-01T00:00:00Z"), updatedAt: new Date("2030-01-07T00:00:00Z") });
    const result = await inspect({ id: incidentId });
    if ("clarification" in result) throw new Error("Unexpected clarification");
    expect(result.data).toMatchObject({ outcome: "scheduled_no_log_yet", notifications: [], escalation: { status: "active" } });
  });

  it("asks which incident when exact titles collide and accepts only a listed selection", async () => {
    const second = randomUUID();
    mocks.incidents.mockResolvedValue([incident(), incident(second)]);
    const ambiguous = await inspect({ title: "Checkout alert" });
    expect("clarification" in ambiguous && ambiguous.clarification.clarification?.fields[0]?.options).toHaveLength(2);
    const chosen = await inspect({ title: "Checkout alert" }, second);
    expect("clarification" in chosen).toBe(false);
    const foreign = await inspect({ title: "Checkout alert" }, randomUUID());
    expect("clarification" in foreign).toBe(true);
  });

  it("classifies retries and attempts without returning raw errors, addresses or provider IDs", async () => {
    const secret = "secret@example.test token=private";
    mocks.escalation.mockResolvedValue({ policyId: randomUUID(), currentStep: 2, repeatIteration: 0, status: "active",
      nextRunAt: new Date("2030-01-08T00:00:00Z"), updatedAt: new Date("2030-01-07T00:00:00Z"), policySnapshot: { secret } });
    mocks.logs.mockResolvedValue([{ id: randomUUID(), policyStepId: randomUUID(), repeatIteration: 0, channel: "email", targetType: "user",
      targetAddress: secret, targetId: randomUUID(), providerMessageId: secret, status: "retrying", attempt: 1,
      errorMessage: `429 rate limited; ${secret}`, nextRetryAt: new Date("2030-01-07T01:00:00Z"), sentAt: null,
      createdAt: new Date("2030-01-07T00:00:00Z"), deliveryAttempts: [{ id: randomUUID(), attempt: 1, status: "failed",
        errorMessage: `429 ${secret}`, startedAt: new Date("2030-01-07T00:00:00Z"), completedAt: new Date("2030-01-07T00:00:01Z") }] }]);
    const result = await inspect({ id: incidentId });
    if ("clarification" in result) throw new Error("Unexpected clarification");
    expect(result.data).toMatchObject({ outcome: "retrying", notifications: [{ status: "retrying", error_category: "rate_limited",
      suggested_check: expect.stringContaining("rate limits"), attempts: [{ status: "failed", error_category: "rate_limited" }] }] });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(mocks.escalation.mock.calls[0]![0].select).not.toHaveProperty("policySnapshot");
    expect(mocks.logs.mock.calls[0]![0].select).not.toHaveProperty("targetAddress");
  });

  it("distinguishes provider acceptance, failed, skipped and pending statuses", async () => {
    const log = (status: string, errorMessage: string | null = null) => ({ id: randomUUID(), policyStepId: null,
      repeatIteration: null, channel: "slack", targetType: "user", status, attempt: 1, errorMessage,
      nextRetryAt: null, sentAt: status === "sent" ? new Date("2030-01-07T00:00:01Z") : null,
      createdAt: new Date("2030-01-07T00:00:00Z"), deliveryAttempts: [] });
    for (const [status, outcome] of [["sent", "provider_accepted"], ["failed", "failed_or_mixed"],
      ["skipped", "skipped_or_mixed"], ["pending", "pending_or_sending"]] as const) {
      mocks.logs.mockResolvedValueOnce([log(status, status === "failed" ? "unrelated private failure" : null)]);
      const result = await inspect({ id: incidentId });
      if ("clarification" in result) throw new Error("Unexpected clarification");
      expect(result.data).toMatchObject({ outcome });
      if (status === "failed") expect(JSON.stringify(result)).not.toContain("unrelated private failure");
    }
  });

  it("marks a bounded page as partial and carries a scoped keyset cursor", async () => {
    const logs = Array.from({ length: 3 }, (_, index) => ({ id: randomUUID(), policyStepId: null,
      repeatIteration: null, channel: "email", targetType: "user", status: "failed", attempt: 1,
      errorMessage: null, nextRetryAt: null, sentAt: null, createdAt: new Date(`2030-01-0${index + 1}T00:00:00Z`),
      deliveryAttempts: [] }));
    mocks.logs.mockResolvedValue(logs);
    const first = await inspect({ id: incidentId, limit: 2 });
    if ("clarification" in first) throw new Error("Unexpected clarification");
    expect(first.receipt).toMatchObject({ has_more: true, returned_count: 2 });
    await inspect({ id: incidentId, limit: 2, cursor: first.receipt.next_cursor });
    expect(mocks.logs.mock.calls[1]![0].where).toMatchObject({ incidentId, OR: expect.any(Array) });
    await expect(inspect({ id: incidentId, cursor: "bad" })).rejects.toMatchObject({ code: "copilot_invalid_cursor" });
  });

  it("marks truncated attempt history without treating visible attempts as the complete history", async () => {
    mocks.logs.mockResolvedValue([{ id: randomUUID(), policyStepId: null, repeatIteration: 0, channel: "email", targetType: "user",
      status: "failed", attempt: 8, errorMessage: "unknown private error", nextRetryAt: null, sentAt: null,
      createdAt: new Date("2030-01-07T00:00:00Z"), deliveryAttempts: Array.from({ length: 6 }, (_, index) => ({
        id: randomUUID(), attempt: index + 1, status: "failed", errorMessage: null,
        startedAt: new Date("2030-01-07T00:00:00Z"), completedAt: new Date("2030-01-07T00:00:01Z"),
      })) }]);
    const result = await inspect({ id: incidentId });
    if ("clarification" in result) throw new Error("Unexpected clarification");
    expect(result.receipt).toMatchObject({ has_more: true });
    expect(result.data).toMatchObject({ notifications: [{ has_more_attempts: true, error_category: "unclassified_provider_error" }] });
    expect(JSON.stringify(result)).not.toContain("unknown private error");
  });
});
