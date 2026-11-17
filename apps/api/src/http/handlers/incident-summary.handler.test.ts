import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ summarize: vi.fn() }));
vi.mock("../../copilot/incident-summary", () => ({ summarizeIncident: mocks.summarize }));
vi.mock("@im/db", () => ({ prisma: {} }));
vi.mock("./workspaces.handler", () => ({ mapWorkspaceError: (error: unknown) => error }));
vi.mock("@im/backend-core", async (original) => ({ ...await original<typeof import("@im/backend-core")>(),
  IncidentService: vi.fn(() => ({})), EscalationService: vi.fn(() => ({})), WorkspaceService: vi.fn(() => ({})),
}));

import { summarizeIncidentHandler } from "./incidents.handler";

describe("incident summary HTTP boundary", () => {
  const id = "44444444-4444-4444-8444-444444444444";
  beforeEach(() => vi.clearAllMocks());
  async function invoke(input: { actorUserId?: string; incidentId?: string; body?: unknown }) {
    const req = { actorUserId: input.actorUserId, params: { incidentId: input.incidentId ?? id }, body: input.body };
    const next = vi.fn(); const json = vi.fn();
    await summarizeIncidentHandler(req as never, { json } as never, next);
    return { next, json };
  }
  it("requires authentication before invoking the summary service", async () => {
    const result = await invoke({});
    expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(mocks.summarize).not.toHaveBeenCalled();
  });
  it.each([{ incidentId: "invalid" }, { body: { locale: "ja" } }, { body: { title: "spoofed facts" } }])("rejects invalid request %j", async (input) => {
    const result = await invoke({ actorUserId: "authenticated-actor", ...input });
    expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(mocks.summarize).not.toHaveBeenCalled();
  });
  it("uses authenticated identity and defaults locale to English", async () => {
    mocks.summarize.mockResolvedValue({ summary: "Reviewed" });
    const result = await invoke({ actorUserId: "authenticated-actor" });
    expect(mocks.summarize).toHaveBeenCalledWith(id, "authenticated-actor", "en");
    expect(result.json).toHaveBeenCalledWith({ data: { summary: "Reviewed" } });
    expect(result.next).not.toHaveBeenCalled();
  });
});
