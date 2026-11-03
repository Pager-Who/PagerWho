import { WorkspaceError } from "@im/backend-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  member: vi.fn(), permission: vi.fn(), roles: vi.fn(), providers: vi.fn(), resolve: vi.fn(),
  services: vi.fn(), policies: vi.fn(), schedules: vi.fn(), memberships: vi.fn(), teams: vi.fn(),
  override: vi.fn(), preferences: vi.fn(), contacts: vi.fn(),
}));
vi.mock("@im/db", () => ({ prisma: {
  service: { findMany: mocks.services }, escalationPolicy: { findMany: mocks.policies },
  onCallSchedule: { findMany: mocks.schedules }, workspaceMember: { findMany: mocks.memberships },
  team: { findMany: mocks.teams }, onCallOverride: { findFirst: mocks.override },
  userNotificationPreference: { findMany: mocks.preferences }, userNotificationContact: { findMany: mocks.contacts },
} }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  WorkspaceService: vi.fn(() => ({ assertMember: mocks.member, assertWorkspacePermission: mocks.permission,
    listMemberRoleKeys: mocks.roles, listNotificationProviderSettings: mocks.providers })),
  OnCallService: vi.fn(() => ({ resolveScheduleLayerUserIdInTransaction: mocks.resolve })),
}));

import { inspectProjectSettings } from "./copilot-audit";

const workspace = "22222222-2222-4222-8222-222222222222";
const actor = "11111111-1111-4111-8111-111111111111";
const serviceId = "44444444-4444-4444-8444-444444444444";
const policyId = "55555555-5555-4555-8555-555555555555";
const scheduleId = "66666666-6666-4666-8666-666666666666";
const responderId = "33333333-3333-4333-8333-333333333333";
const request = { question: "Check alert settings", workspace_id: workspace };
const inspect = (args: unknown = {}) => inspectProjectSettings(args, request, actor);

describe("read-only project configuration audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.services.mockResolvedValue([]); mocks.policies.mockResolvedValue([]); mocks.schedules.mockResolvedValue([]);
    mocks.memberships.mockResolvedValue([{ userId: responderId }]); mocks.teams.mockResolvedValue([]);
    mocks.override.mockResolvedValue(null); mocks.preferences.mockResolvedValue([]); mocks.contacts.mockResolvedValue([]);
    mocks.roles.mockResolvedValue(["project_viewer"]); mocks.providers.mockResolvedValue([]);
  });

  it("reports a service with no policy and marks provider inspection incomplete for a viewer", async () => {
    mocks.services.mockResolvedValue([{ id: serviceId, name: "checkout", escalationPolicyId: null }]);
    const result = await inspect();
    expect(result.data).toMatchObject({ status: "findings", provider_check: { status: "not_permitted" },
      findings: [{ code: "service_without_policy", level: "missing", path: `/services/${serviceId}` }] });
    expect(result.receipt).toMatchObject({ operation: "inspect_project_settings", delivery_verified: false, returned_count: 1 });
    expect(mocks.providers).not.toHaveBeenCalled();
    expect(mocks.services.mock.calls[0]![0]).toMatchObject({ where: { workspaceId: workspace }, take: 201 });
  });

  it("distinguishes a clean observed route from uninspected channels", async () => {
    mocks.services.mockResolvedValue([{ id: serviceId, name: "checkout", escalationPolicyId: policyId }]);
    mocks.policies.mockResolvedValue([{ id: policyId, name: "page", steps: [{ id: "step", stepOrder: 1, targetType: "user", targetId: responderId }] }]);
    expect((await inspect()).data).toMatchObject({ status: "incomplete", findings: [] });
    mocks.roles.mockResolvedValue(["project_owner"]);
    mocks.providers.mockResolvedValue([{ provider: "email", enabled: true, configured: true }]);
    mocks.preferences.mockResolvedValue([{ userId: responderId, channel: "email", enabled: true }]);
    const result = await inspect();
    expect(result.data).toMatchObject({ status: "no_observed_gaps", findings: [], provider_check: {
      status: "checked", providers: [{ provider: "email", ready: true }],
    } });
    expect(JSON.stringify(result)).not.toContain("smtp_password");
  });

  it("finds empty team, unavailable user and missing schedule target without reading foreign resources", async () => {
    mocks.policies.mockResolvedValue([{ id: policyId, name: "page", steps: [
      { id: "a", stepOrder: 1, targetType: "team", targetId: serviceId },
      { id: "b", stepOrder: 2, targetType: "user", targetId: serviceId },
      { id: "c", stepOrder: 3, targetType: "primary_on_call", targetId: scheduleId },
    ] }]);
    const result = await inspect();
    expect((result.data as { findings: Array<{ code: string }> }).findings.map((item) => item.code)).toEqual([
      "policy_team_empty", "policy_user_unavailable", "policy_schedule_unavailable",
    ]);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("honors an active override and reports a configured layer with no coverage after it ends", async () => {
    mocks.schedules.mockResolvedValue([{ id: scheduleId, name: "primary-weekly", rotations: [{ layer: "primary",
      startsAt: new Date("2030-01-08T00:00:00Z"), participants: [{ userId: responderId }] }] }]);
    mocks.policies.mockResolvedValue([{ id: policyId, name: "page", steps: [{ id: "a", stepOrder: 1,
      targetType: "primary_on_call", targetId: scheduleId }] }]);
    mocks.override.mockResolvedValue({ userId: responderId });
    const covered = await inspect({ at: "2030-01-07T09:00:00+09:00", timezone: "Asia/Seoul" });
    expect(covered.data).toMatchObject({ findings: [] });
    expect(covered.receipt).toMatchObject({ at: "2030-01-07T00:00:00.000Z", timezone: "Asia/Seoul" });
    mocks.override.mockResolvedValue(null);
    const gap = await inspect({ at: "2030-01-07T09:00:00+09:00" });
    expect((gap.data as { findings: Array<{ code: string }> }).findings.map((item) => item.code)).toEqual(["on_call_coverage_gap"]);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("uses the backend rotation resolver for an eligible participant after the start time", async () => {
    mocks.schedules.mockResolvedValue([{ id: scheduleId, name: "primary-weekly", rotations: [{ layer: "primary",
      startsAt: new Date("2030-01-06T00:00:00Z"), participants: [{ userId: responderId }] }] }]);
    mocks.resolve.mockResolvedValue(responderId);
    const result = await inspect({ at: "2030-01-07T09:00:00+09:00" });
    expect(result.data).toMatchObject({ status: "incomplete", findings: [] });
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), scheduleId, "primary", new Date("2030-01-07T00:00:00Z"));
  });

  it("checks enabled provider and contact flags without returning contact values", async () => {
    mocks.roles.mockResolvedValue(["project_owner"]);
    mocks.services.mockResolvedValue([{ id: serviceId, name: "checkout", escalationPolicyId: policyId }]);
    mocks.policies.mockResolvedValue([{ id: policyId, name: "page", steps: [{ id: "a", stepOrder: 1,
      targetType: "user", targetId: responderId }] }]);
    mocks.providers.mockResolvedValue([{ provider: "twilio", enabled: true, configured: true, details: { secret: "do-not-send" } }]);
    mocks.preferences.mockResolvedValue([{ userId: responderId, channel: "sms", enabled: true }]);
    mocks.contacts.mockResolvedValue([{ userId: responderId, type: "phone_sms", verifiedAt: null, address: "private" }]);
    const result = await inspect();
    expect((result.data as { findings: Array<{ code: string }> }).findings.map((item) => item.code)).toContain("responder_channel_unready");
    expect(JSON.stringify(result)).not.toContain("do-not-send");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(mocks.contacts.mock.calls[0]![0])).not.toContain("address");
  });

  it("rejects insufficient read permission and oversized snapshots rather than claiming completeness", async () => {
    mocks.permission.mockRejectedValueOnce(new WorkspaceError("workspace_permission_required", "private"));
    await expect(inspect()).rejects.toMatchObject({ statusCode: 403, code: "copilot_audit_forbidden" });
    expect(mocks.services).not.toHaveBeenCalled();
    mocks.services.mockResolvedValue(Array.from({ length: 201 }, (_, index) => ({ id: String(index), name: "x", escalationPolicyId: null })));
    await expect(inspect()).rejects.toMatchObject({ statusCode: 413, code: "copilot_audit_too_large" });
  });

  it("distinguishes an empty project and rejects local times without offsets", async () => {
    expect((await inspect()).data).toMatchObject({ status: "incomplete", findings: [] });
    await expect(inspect({ at: "2030-01-07T09:00:00" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
