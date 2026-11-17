import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  listUserShifts: vi.fn(),
  listUserWorkspaces: vi.fn(),
}));

vi.mock("@im/db", () => ({
  prisma: { user: { findUnique: mocks.findUser } },
}));
vi.mock("@im/backend-core", async (original) => ({
  ...await original<typeof import("@im/backend-core")>(),
  OnCallService: vi.fn(() => ({ listUserShifts: mocks.listUserShifts })),
  WorkspaceService: vi.fn(() => ({ listUserWorkspaces: mocks.listUserWorkspaces })),
}));

import { getCalendarFeedIcsHandler } from "./calendar-feed.handler";

const userId = "11111111-1111-4111-8111-111111111111";
const token = crypto.randomBytes(32).toString("base64url");

describe("on-call calendar feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({ id: userId, suspendedAt: null });
    mocks.listUserWorkspaces.mockResolvedValue([{ id: "22222222-2222-4222-8222-222222222222" }]);
    mocks.listUserShifts.mockResolvedValue([]);
  });

  async function invoke(feedToken: string) {
    const next = vi.fn();
    const send = vi.fn();
    const res = { send, status: vi.fn(() => res), type: vi.fn(() => res), set: vi.fn(() => res) };
    await getCalendarFeedIcsHandler({ params: { token: feedToken } } as never, res as never, next);
    return { next, res, send };
  }

  it("looks the user up by token hash and serves a calendar", async () => {
    const result = await invoke(token);

    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { calendarFeedTokenHash: crypto.createHash("sha256").update(token).digest("hex") },
    }));
    expect(mocks.listUserShifts).toHaveBeenCalledWith(userId, expect.objectContaining({
      workspaceIds: ["22222222-2222-4222-8222-222222222222"],
    }));
    expect(result.res.type).toHaveBeenCalledWith("text/calendar; charset=utf-8");
    expect(result.send).toHaveBeenCalledWith(expect.stringContaining("BEGIN:VCALENDAR"));
  });

  it("returns 404 for malformed tokens, unknown tokens, and suspended users", async () => {
    const malformed = await invoke("short");
    expect(malformed.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(mocks.findUser).not.toHaveBeenCalled();

    mocks.findUser.mockResolvedValueOnce(null);
    expect((await invoke(token)).next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));

    mocks.findUser.mockResolvedValueOnce({ id: userId, suspendedAt: new Date() });
    expect((await invoke(token)).next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(mocks.listUserShifts).not.toHaveBeenCalled();
  });
});
