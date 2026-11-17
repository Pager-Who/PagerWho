import { describe, expect, it } from "vitest";

import { searchProductDocs } from "./copilot-product-docs";

describe("public product guide search", () => {
  it.each([
    ["en", "on-call", "on-call"],
    ["ko", "온콜", "on-call"],
    ["zh-CN", "值班", "on-call"],
  ] as const)("%s: returns a localized guide and a safe source path", (locale, query, slug) => {
    const result = searchProductDocs({ query }, locale);
    expect(result.sources.some((source) => source.path === `/docs/${slug}`)).toBe(true);
    expect(result.sources.every((source) => /^\/docs\/[a-z0-9-]+$/.test(source.path))).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(4);
  });

  it("returns no invented guide for an unrelated query", () => {
    expect(searchProductDocs({ query: "zxqv97251" }, "en")).toMatchObject({ data: [], sources: [] });
  });

  it("rejects arbitrary paths and unbounded queries", () => {
    expect(() => searchProductDocs({ query: "on-call", path: "../../.env" }, "en")).toThrow();
    expect(() => searchProductDocs({ query: "x".repeat(201) }, "en")).toThrow();
  });
});
