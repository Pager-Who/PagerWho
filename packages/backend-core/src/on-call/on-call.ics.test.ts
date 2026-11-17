import { describe, expect, it } from "vitest";

import { buildOnCallIcs } from "./on-call.ics";
import { resolveCoverageSegments } from "./on-call.service";

const hour = 60 * 60 * 1000;

describe("buildOnCallIcs", () => {
  it("renders shifts with UTC times, escaped text, and a reminder alarm", () => {
    const ics = buildOnCallIcs([
      {
        schedule_id: "11111111-1111-4111-8111-111111111111",
        schedule_name: "Payments, core; API",
        workspace_id: "22222222-2222-4222-8222-222222222222",
        timezone: "Asia/Seoul",
        layer: "primary",
        starts_at: "2026-11-18T00:00:00.000Z",
        ends_at: "2026-11-19T00:00:00.000Z",
      },
    ], new Date("2026-11-17T09:30:00.000Z"));

    expect(ics).toContain("DTSTART:20261118T000000Z\r\n");
    expect(ics).toContain("DTEND:20261119T000000Z\r\n");
    expect(ics).toContain("SUMMARY:On-call (Primary): Payments\\, core\\; API\r\n");
    expect(ics).toContain("TRIGGER:-PT15M\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
  });
});

describe("resolveCoverageSegments", () => {
  it("places a mid-hour handoff to the minute and merges runs", () => {
    const from = Date.UTC(2026, 10, 17, 0, 0);
    const handoff = Date.UTC(2026, 10, 17, 2, 30);
    const segments = resolveCoverageSegments((at) => (at < handoff ? "a" : "b"), from, from + 5 * hour);

    expect(segments).toEqual([
      { start: from, end: handoff, userId: "a" },
      { start: handoff, end: from + 5 * hour, userId: "b" },
    ]);
  });

  it("splits on override edges that are not hour aligned", () => {
    const from = Date.UTC(2026, 10, 17, 0, 0);
    const overrideStart = new Date(Date.UTC(2026, 10, 17, 1, 10));
    const overrideEnd = new Date(Date.UTC(2026, 10, 17, 1, 40));
    const resolveAt = (at: number) => (at >= overrideStart.getTime() && at < overrideEnd.getTime() ? "override" : "a");

    expect(resolveCoverageSegments(resolveAt, from, from + 3 * hour, [{ startsAt: overrideStart, endsAt: overrideEnd }]))
      .toEqual([
        { start: from, end: overrideStart.getTime(), userId: "a" },
        { start: overrideStart.getTime(), end: overrideEnd.getTime(), userId: "override" },
        { start: overrideEnd.getTime(), end: from + 3 * hour, userId: "a" },
      ]);
  });
});
