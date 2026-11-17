import type { PrismaClient } from "@im/db";
import { describe, expect, it, vi } from "vitest";

import { IncidentService } from "./incident.service";

describe("IncidentService.listIncidents", () => {
  it("filters open incidents before pagination and prioritizes urgent incidents", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new IncidentService({ incident: { findMany } } as unknown as PrismaClient);

    await service.listIncidents({ status: "open", limit: 100, workspace_id: "11111111-1111-4111-8111-111111111111" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: "11111111-1111-4111-8111-111111111111",
        status: { in: ["triggered", "acknowledged"] },
      }),
      orderBy: [{ priority: "asc" }, { status: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      take: 101,
    }));
  });
});

describe("IncidentService queue helpers", () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const responderId = "33333333-3333-4333-8333-333333333333";

  it("applies title search and assignee filters to the list", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new IncidentService({ incident: { findMany } } as unknown as PrismaClient);

    await service.listIncidents({ workspace_id: workspaceId, q: "checkout", acknowledged_by: responderId });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        acknowledgedById: responderId,
        title: { contains: "checkout", mode: "insensitive" },
      }),
    }));
  });

  it("counts every status and critical open incidents for the same filters", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { status: "triggered", _count: { _all: 4 } },
      { status: "resolved", _count: { _all: 9 } },
    ]);
    const count = vi.fn().mockResolvedValue(2);
    const service = new IncidentService({ incident: { groupBy, count } } as unknown as PrismaClient);

    await expect(service.countIncidents({ workspace_id: workspaceId, priority: "P1" })).resolves.toEqual({
      triggered: 4,
      acknowledged: 0,
      resolved: 9,
      critical_open: 2,
    });
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId, priority: "P1" } }));
    expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ workspaceId, status: { in: ["triggered", "acknowledged"] } }) });
  });

  it("reassigns only acknowledged incidents", async () => {
    const update = vi.fn();
    const tx = {
      user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, name: "Dana" })) },
      incident: {
        findUnique: vi.fn().mockResolvedValue({ id: "incident-1", status: "triggered", acknowledgedById: null, workspaceId }),
        update,
      },
    };
    const service = new IncidentService({ $transaction: (run: (client: typeof tx) => unknown) => run(tx) } as unknown as PrismaClient);

    await expect(service.reassignIncident("incident-1", "actor", responderId)).rejects.toMatchObject({ code: "invalid_incident_transition" });
    expect(update).not.toHaveBeenCalled();
  });
});
