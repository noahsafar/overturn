import { describe, it, expect } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to limit then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const r = rateLimit(key, { limit: 3, windowMs: 1000 });
      expect(r.allowed).toBe(true);
    }
    const blocked = rateLimit(key, { limit: 3, windowMs: 1000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after window", async () => {
    const key = `reset-${Math.random()}`;
    for (let i = 0; i < 2; i++) rateLimit(key, { limit: 2, windowMs: 30 });
    const blocked = rateLimit(key, { limit: 2, windowMs: 30 });
    expect(blocked.allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    const ok = rateLimit(key, { limit: 2, windowMs: 30 });
    expect(ok.allowed).toBe(true);
  });
});
