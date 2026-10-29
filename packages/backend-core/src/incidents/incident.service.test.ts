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
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      take: 101,
    }));
  });
});
