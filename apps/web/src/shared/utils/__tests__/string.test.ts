import { describe, expect, it } from "vitest";

import { shortId } from "../string";

describe("shortId", () => {
  it("returns first 8 characters of UUID", () => {
    expect(shortId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400");
  });

  it("returns full string when shorter than 8 chars", () => {
    expect(shortId("abc")).toBe("abc");
  });

  it("returns exactly 8 chars for 8-char input", () => {
    expect(shortId("12345678")).toBe("12345678");
  });

  it("returns empty string for empty input", () => {
    expect(shortId("")).toBe("");
  });
});
