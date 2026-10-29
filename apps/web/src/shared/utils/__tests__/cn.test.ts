import { describe, expect, it } from "vitest";

import { cn } from "../cn";

describe("cn", () => {
  it("joins two class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("ignores falsy values", () => {
    expect(cn("foo", false, undefined, null, "bar")).toBe("foo bar");
  });

  it("handles conditional expression", () => {
    const active = true;
    expect(cn("base", active && "active")).toBe("base active");
    expect(cn("base", !active && "inactive")).toBe("base");
  });

  it("preserves all classes including conflicts (no twMerge)", () => {
    expect(cn("p-2", "p-4")).toBe("p-2 p-4");
  });

  it("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });
});
