import { describe, expect, it } from "vitest";

import { isPriorityWithinThreshold } from "./escalation.service";

describe("isPriorityWithinThreshold", () => {
  it("pages only for incidents at or above the channel threshold", () => {
    expect(isPriorityWithinThreshold("P1", "P2")).toBe(true);
    expect(isPriorityWithinThreshold("P2", "P2")).toBe(true);
    expect(isPriorityWithinThreshold("P3", "P2")).toBe(false);
  });

  it("pages for every priority without a threshold", () => {
    expect(isPriorityWithinThreshold("P5", null)).toBe(true);
  });
});
