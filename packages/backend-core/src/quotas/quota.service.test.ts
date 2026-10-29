import type { PrismaClient } from "@im/db";
import { describe, expect, it, vi } from "vitest";

import { QuotaService, readInstallationLimits } from "./quota.service";

describe("installation limits", () => {
  it("defaults to unlimited resource counts and 365 days of retention", () => {
    expect(readInstallationLimits({})).toEqual({
      escalation_policies: null, members: null, on_call_schedules: null,
      retention_days: 365, services: null, workspaces: null,
    });
  });

  it("accepts explicit limits and zero for unlimited counts", () => {
    expect(readInstallationLimits({ PAGERWHO_LIMIT_MEMBERS: "20", PAGERWHO_LIMIT_SERVICES: "0", PAGERWHO_RETENTION_DAYS: "90" }))
      .toMatchObject({ members: 20, services: null, retention_days: 90 });
  });

  it.each(["", "-1", "1.5", "NaN", "Infinity", "9007199254740992"])("rejects invalid resource limit %s", (value) => {
    expect(() => readInstallationLimits({ PAGERWHO_LIMIT_MEMBERS: value })).toThrow("PAGERWHO_LIMIT_MEMBERS");
  });

  it.each(["", "0", "-1", "1.5", "Infinity", "36501"])("rejects invalid retention %s", (value) => {
    expect(() => readInstallationLimits({ PAGERWHO_RETENTION_DAYS: value })).toThrow("PAGERWHO_RETENTION_DAYS");
  });

  it("does not query workspace counts when unlimited", async () => {
    const count = vi.fn();
    const service = new QuotaService({ workspaceMember: { count } } as unknown as PrismaClient, {});
    await expect(service.assertCanCreateWorkspace("user-id")).resolves.toBeUndefined();
    expect(count).not.toHaveBeenCalled();
  });

  it("enforces the configured workspace limit without a commercial plan", async () => {
    const count = vi.fn().mockResolvedValue(2);
    const service = new QuotaService({ workspaceMember: { count } } as unknown as PrismaClient, { PAGERWHO_LIMIT_WORKSPACES: "2" });
    await expect(service.assertCanCreateWorkspace("user-id")).rejects.toMatchObject({
      code: "quota_exceeded", details: { current: 2, limit: 2, resource: "workspaces" },
    });
  });

  it("applies active overrides and ignores expired or invalid expirations", async () => {
    const count = vi.fn().mockResolvedValue(3);
    const service = new QuotaService({
      workspaceQuotaSettings: { findUnique: vi.fn().mockResolvedValue({
        updatedAt: new Date(), updatedByUserId: null,
        quotaOverrides: {
          services: { limit: 8, expires_at: new Date(Date.now() + 60_000).toISOString() },
          members: { limit: 1, expires_at: "2000-01-01T00:00:00Z" },
          on_call_schedules: { limit: 1, expires_at: "invalid-date" },
        },
      }) },
      workspaceMember: { count }, workspaceInvite: { count }, service: { count },
      onCallSchedule: { count }, escalationPolicy: { count },
    } as unknown as PrismaClient, { PAGERWHO_LIMIT_SERVICES: "2", PAGERWHO_LIMIT_MEMBERS: "10" });
    const usage = await service.getWorkspaceUsage("workspace-id");
    expect(usage.limits).toMatchObject({ services: 8, members: 10, on_call_schedules: null });
    expect(usage.quota_settings.quota_overrides).toHaveLength(1);
    await expect(service.assertCanCreateWorkspaceResource({ workspaceId: "workspace-id", resource: "services" })).resolves.toBeUndefined();
  });

  it("uses the installation retention cutoff for every workspace", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { notificationLog: { deleteMany }, workflowRun: { deleteMany }, workflowEvent: { deleteMany }, incident: { deleteMany }, activityLog: { deleteMany } };
    const service = new QuotaService({ workspace: { findMany: vi.fn().mockResolvedValue([{ id: "workspace-id" }]) },
      $transaction: (callback: (db: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient, { PAGERWHO_RETENTION_DAYS: "30" });
    const now = new Date("2026-10-27T00:00:00Z");
    await expect(service.runRetention(now)).resolves.toMatchObject({ processed_workspaces: 1 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2026-09-27T00:00:00Z") }, incident: { workspaceId: "workspace-id" } } });
  });
});
