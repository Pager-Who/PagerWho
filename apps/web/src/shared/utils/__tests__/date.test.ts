import { describe, expect, it } from "vitest";

import { formatDateTime, formatDurationSeconds, formatRelativeTime } from "../date";

describe("formatDateTime", () => {
  it("returns '-' for null", () => {
    expect(formatDateTime(null)).toBe("-");
  });

  it("returns '-' for undefined", () => {
    expect(formatDateTime(undefined)).toBe("-");
  });

  it("returns '-' for invalid date string", () => {
    expect(formatDateTime("not-a-date")).toBe("-");
  });

  it("formats valid ISO string", () => {
    const result = formatDateTime("2024-06-01T12:00:00.000Z");
    expect(result).not.toBe("-");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("accepts Date object", () => {
    const result = formatDateTime(new Date("2024-06-01T12:00:00.000Z"));
    expect(result).not.toBe("-");
  });
});

describe("formatRelativeTime", () => {
  it("returns '-' for null", () => {
    expect(formatRelativeTime(null)).toBe("-");
  });

  it("returns '-' for undefined", () => {
    expect(formatRelativeTime(undefined)).toBe("-");
  });

  it("returns '-' for invalid date string", () => {
    expect(formatRelativeTime("not-a-date")).toBe("-");
  });

  it("shows 'now' or seconds for very recent date", () => {
    const now = new Date();
    const result = formatRelativeTime(now, now);
    expect(result).not.toBe("-");
  });

  it("shows a non-empty result for ~5 minutes ago", () => {
    const now = new Date("2024-06-01T12:00:00.000Z");
    const fiveMinutesAgo = new Date("2024-06-01T11:55:00.000Z");
    const result = formatRelativeTime(fiveMinutesAgo, now);
    expect(result).not.toBe("-");
    expect(result).toMatch(/5/);
  });

  it("shows a non-empty result for ~2 hours ago", () => {
    const now = new Date("2024-06-01T12:00:00.000Z");
    const twoHoursAgo = new Date("2024-06-01T10:00:00.000Z");
    const result = formatRelativeTime(twoHoursAgo, now);
    expect(result).not.toBe("-");
    expect(result).toMatch(/2/);
  });

  it("shows a non-empty result for ~3 days ago", () => {
    const now = new Date("2024-06-01T12:00:00.000Z");
    const threeDaysAgo = new Date("2024-05-29T12:00:00.000Z");
    const result = formatRelativeTime(threeDaysAgo, now);
    expect(result).not.toBe("-");
    expect(result).toMatch(/3/);
  });

  it("shows a non-empty result for future date", () => {
    const now = new Date("2024-06-01T12:00:00.000Z");
    const inTenMinutes = new Date("2024-06-01T12:10:00.000Z");
    const result = formatRelativeTime(inTenMinutes, now);
    expect(result).not.toBe("-");
    expect(result).toMatch(/10/);
  });
});

describe("formatDurationSeconds", () => {
  it("returns '-' for null", () => {
    expect(formatDurationSeconds(null)).toBe("-");
  });

  it("returns '-' for undefined", () => {
    expect(formatDurationSeconds(undefined)).toBe("-");
  });

  it("shows seconds for < 60s", () => {
    expect(formatDurationSeconds(45)).toBe("45s");
  });

  it("shows 0s for 0", () => {
    expect(formatDurationSeconds(0)).toBe("0s");
  });

  it("shows minutes only when no remainder", () => {
    expect(formatDurationSeconds(120)).toBe("2m");
  });

  it("shows minutes and seconds when remainder exists", () => {
    expect(formatDurationSeconds(125)).toBe("2m 5s");
  });

  it("shows hours only when no minute remainder", () => {
    expect(formatDurationSeconds(7200)).toBe("2h");
  });

  it("shows hours and minutes when remainder exists", () => {
    expect(formatDurationSeconds(7500)).toBe("2h 5m");
  });

  it("boundary: exactly 59s stays in seconds", () => {
    expect(formatDurationSeconds(59)).toBe("59s");
  });

  it("boundary: exactly 60s becomes 1m", () => {
    expect(formatDurationSeconds(60)).toBe("1m");
  });

  it("boundary: exactly 3600s becomes 1h", () => {
    expect(formatDurationSeconds(3600)).toBe("1h");
  });
});
