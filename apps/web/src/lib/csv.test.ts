import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("emits header + rows", () => {
    const out = toCsv([{ a: 1, b: "two" }, { a: 3, b: "four" }]);
    expect(out).toBe("a,b\n1,two\n3,four\n");
  });

  it("escapes commas and quotes", () => {
    const out = toCsv([{ x: 'has, comma', y: 'has "quote"' }]);
    expect(out).toContain('"has, comma","has ""quote"""');
  });

  it("handles null/undefined as empty", () => {
    const out = toCsv([{ a: null, b: undefined, c: 1 }]);
    expect(out).toBe("a,b,c\n,,1\n");
  });

  it("serializes Date as ISO", () => {
    const d = new Date("2025-05-30T12:00:00.000Z");
    const out = toCsv([{ at: d }]);
    expect(out).toContain("2025-05-30T12:00:00.000Z");
  });
});
