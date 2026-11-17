import { randomUUID } from "node:crypto";

import { WorkspaceError } from "@im/backend-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertMember: vi.fn(), permission: vi.fn(), resolve: vi.fn(),
  services: vi.fn(), service: vi.fn(), schedules: vi.fn(), schedule: vi.fn(), rotation: vi.fn(), override: vi.fn(),
  policies: vi.fn(), policy: vi.fn(), members: vi.fn(), member: vi.fn(), team: vi.fn(), incidents: vi.fn(),
}));
vi.mock("@im/db", () => ({ prisma: {
  service: { findMany: mocks.services, findFirst: mocks.service },
  onCallSchedule: { findMany: mocks.schedules, findFirst: mocks.schedule },
  onCallRotation: { findFirst: mocks.rotation }, onCallOverride: { findFirst: mocks.override },
  escalationPolicy: { findMany: mocks.policies, findFirst: mocks.policy },
  workspaceMember: { findMany: mocks.members, findFirst: mocks.member },
  team: { findFirst: mocks.team }, incident: { findMany: mocks.incidents },
} }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.assertMember, assertWorkspacePermission: mocks.permission })),
  OnCallService: vi.fn(() => ({ resolveScheduleLayerUserIdInTransaction: mocks.resolve })),
}));

import { executeProjectQuery } from "./copilot-query";

const workspace = "22222222-2222-4222-8222-222222222222";
const actor = "11111111-1111-4111-8111-111111111111";
const serviceId = "44444444-4444-4444-8444-444444444444";
const scheduleId = "66666666-6666-4666-8666-666666666666";
const userId = "33333333-3333-4333-8333-333333333333";
const request = (question: string, values?: Record<string, string>) => ({ question, workspace_id: workspace,
  ...(values ? { structured_input: { values } } : {}) });
const query = (name: Parameters<typeof executeProjectQuery>[0], args: unknown, question = "show project data", values?: Record<string, string>) =>
  executeProjectQuery(name, args, request(question, values), actor);

describe("project-scoped read-only Copilot tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.services.mockResolvedValue([]); mocks.schedules.mockResolvedValue([]); mocks.policies.mockResolvedValue([]);
    mocks.members.mockResolvedValue([]); mocks.incidents.mockResolvedValue([]);
    mocks.schedule.mockResolvedValue(null); mocks.rotation.mockResolvedValue(null); mocks.override.mockResolvedValue(null);
    mocks.service.mockResolvedValue(null); mocks.policy.mockResolvedValue(null); mocks.member.mockResolvedValue(null);
  });

  it("scopes open incidents, limits results, and carries a cursor and evidence", async () => {
    const rows = [0, 1, 2].map((index) => ({ id: randomUUID(), title: `Incident ${index}`, status: "triggered", severity: "high",
      priority: "P1", createdAt: new Date(`2030-01-0${index + 1}T00:00:00Z`), serviceId }));
    mocks.incidents.mockResolvedValue(rows);
    const first = await query("list_project_incidents", { limit: 2 });
    if ("clarification" in first) throw new Error("Unexpected clarification");
    expect(first.receipt).toMatchObject({ returned_count: 2, has_more: true, delivery_verified: false });
    expect(first.receipt.next_cursor).toBeTruthy();
    expect(first.sources).toContainEqual(expect.objectContaining({ path: `/incidents/${rows[0]!.id}` }));
    expect(mocks.incidents.mock.calls[0]![0]).toMatchObject({ where: { workspaceId: workspace, status: { in: ["triggered", "acknowledged"] } }, take: 3 });
    await query("list_project_incidents", { limit: 2, cursor: first.receipt.next_cursor });
    expect(mocks.incidents.mock.calls[1]![0].where.OR).toBeDefined();
    expect(mocks.incidents.mock.calls[1]![0].where.workspaceId).toBe(workspace);
  });

  it("asks for a specific same-name resource and honors only an in-project selection", async () => {
    const another = randomUUID();
    mocks.services.mockResolvedValue([{ id: serviceId, name: "checkout" }, { id: another, name: "checkout" }]);
    mocks.service.mockResolvedValue({ id: another, name: "checkout", description: null, teamId: null, escalationPolicyId: null });
    const ambiguous = await query("get_service_routing", { name: "checkout" }, "show checkout routing");
    expect("clarification" in ambiguous && ambiguous.clarification.clarification?.fields[0]?.options).toHaveLength(2);
    const selected = await query("get_service_routing", { name: "checkout" }, "show checkout routing", { lookup_service: another });
    // Selection itself is scoped; an unrelated ID cannot be accepted.
    expect("clarification" in selected).toBe(false);
    const foreign = await query("get_service_routing", { name: "checkout" }, "show checkout routing", { lookup_service: randomUUID() });
    expect("clarification" in foreign).toBe(true);
  });

  it("rejects read-only permission failures without returning project data", async () => {
    mocks.permission.mockRejectedValueOnce(new WorkspaceError("workspace_permission_required", "private project details"));
    await expect(query("list_project_incidents", {})).rejects.toMatchObject({ statusCode: 403, code: "copilot_query_forbidden" });
    expect(mocks.incidents).not.toHaveBeenCalled();
  });

  it("computes schedule overrides and displays the requested instant in its timezone", async () => {
    mocks.schedules.mockResolvedValue([{ id: scheduleId, name: "primary-weekly" }]);
    mocks.schedule.mockResolvedValue({ id: scheduleId, name: "primary-weekly", timezone: "Asia/Seoul" });
    mocks.override.mockImplementation(async ({ where }: { where: { layer: string } }) => where.layer === "primary" ? { userId } : null);
    mocks.rotation.mockResolvedValue({ startsAt: new Date("2030-01-08T00:00:00Z") });
    mocks.member.mockResolvedValue({ user: { id: userId, name: "Mina" } });
    const result = await query("get_project_on_call", { name: "primary-weekly", at: "2030-01-07T09:00:00+09:00" }, "who is primary-weekly on call?");
    if ("clarification" in result) throw new Error("Unexpected clarification");
    expect(result.data).toMatchObject({ primary: { id: userId }, secondary: null });
    expect(result.receipt).toMatchObject({ timezone: "Asia/Seoul", at: "2030-01-07T00:00:00.000Z" });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.override.mock.calls[0]![0].where).toMatchObject({ scheduleId, startsAt: { lte: new Date("2030-01-07T00:00:00Z") } });
  });

  it("resolves service policy steps without exposing external target secrets or claiming delivery", async () => {
    mocks.services.mockResolvedValue([{ id: serviceId, name: "checkout" }]);
    mocks.service.mockResolvedValue({ id: serviceId, name: "checkout", escalationPolicyId: serviceId, description: null, teamId: null });
    mocks.policy.mockResolvedValue({ id: serviceId, name: "policy", repeatEnabled: false, repeatIntervalSeconds: null, repeatLimit: null,
      steps: [{ id: randomUUID(), stepOrder: 1, delaySeconds: 0, targetType: "user", targetId: userId },
        { id: randomUUID(), stepOrder: 2, delaySeconds: 300, targetType: "webhook", targetId: "secret-in-target" }] });
    mocks.member.mockResolvedValue({ user: { id: userId, name: "Mina" } });
    const result = await query("get_service_routing", { name: "checkout" }, "who gets checkout alerts?");
    if ("clarification" in result) throw new Error("Unexpected clarification");
    expect(result.data).toMatchObject({ delivery_verified: false, policy: { steps: [
      { recipients: [{ id: userId }], resolution: "configured_user" }, { resolution: "external_target_not_inspected" },
    ] } });
    expect(JSON.stringify(result)).not.toContain("secret-in-target");
    expect(mocks.policy.mock.calls[0]![0].where).toEqual({ workspaceId: workspace, id: serviceId });
  });

  it("rejects malformed times, cursors and reversed time ranges", async () => {
    await expect(query("get_project_on_call", { name: "schedule", at: "2030-01-07T09:00:00" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(query("find_project_resources", { kind: "service", cursor: "invalid" })).rejects.toMatchObject({ code: "copilot_invalid_cursor" });
    await expect(query("list_project_incidents", { since: "2030-01-08T00:00:00Z", until: "2030-01-07T00:00:00Z" }))
      .rejects.toMatchObject({ code: "copilot_invalid_range" });
    expect(mocks.incidents).not.toHaveBeenCalled();
  });
});
