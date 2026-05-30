import { describe, it, expect } from "vitest";
import { PROMPTS, render } from "./index.js";

describe("prompt registry", () => {
  it("loads all three v1 templates", () => {
    expect(PROMPTS.strategize.version).toBe("v1");
    expect(PROMPTS.strategize.body).toMatch(/healthcare appeals strategist/);
    expect(PROMPTS.draft.body).toMatch(/NEVER invent clinical facts/);
    expect(PROMPTS.redraft.body).toMatch(/deterministic verifier rejected/);
  });

  it("render substitutes mustache vars", () => {
    expect(render("hi {{name}}", { name: "Jordan" })).toBe("hi Jordan");
  });

  it("render throws on missing var", () => {
    expect(() => render("hi {{name}}", {})).toThrow(/Missing prompt variable: name/);
  });
});
