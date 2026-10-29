import type { PrismaClient } from "@im/db";
import { describe, expect, it, vi } from "vitest";

import { ServiceCatalogService } from "./service.service";

describe("ServiceCatalogService.listServices", () => {
  it.each(["impacted", "normal"] as const)("filters %s health before pagination", async (health) => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ServiceCatalogService({ service: { findMany } } as unknown as PrismaClient);

    await service.listServices({ health, limit: 100 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        incidents: {
          [health === "impacted" ? "some" : "none"]: {
            status: { in: ["triggered", "acknowledged"] },
            severity: { in: ["critical", "high", "medium"] },
          },
        },
      },
      take: 101,
    }));
  });
});
