import { describe, it, expect } from "vitest";
import { verifyCitations, normalizeForCitationMatch } from "./citations.js";

const POLICY = {
  id: "pol-1",
  body: `Blue Cross Blue Shield Medical Policy MP-2024-50.

Section 3.1 — Medical Necessity Criteria. Outpatient psychotherapy is
considered medically necessary when the member has a documented DSM-5
diagnosis and symptoms produce significant functional impairment.`,
};

describe("verifyCitations", () => {
  it("accepts an exact quote", () => {
    const r = verifyCitations(
      [
        {
          policyId: "pol-1",
          quote: "Outpatient psychotherapy is considered medically necessary when the member has a documented DSM-5 diagnosis",
        },
      ],
      [POLICY],
    );
    expect(r.allValid).toBe(true);
    expect(r.validCount).toBe(1);
  });

  it("accepts a quote with curly quotes and em-dash variance", () => {
    const r = verifyCitations(
      [
        {
          policyId: "pol-1",
          quote: "Section 3.1 — Medical Necessity Criteria. Outpatient psychotherapy is considered medically necessary",
        },
      ],
      [POLICY],
    );
    expect(r.allValid).toBe(true);
  });

  it("rejects a hallucinated quote", () => {
    const r = verifyCitations(
      [
        {
          policyId: "pol-1",
          quote: "All outpatient services are automatically approved without documentation.",
        },
      ],
      [POLICY],
    );
    expect(r.allValid).toBe(false);
    expect(r.invalidCitations[0]?.reason).toMatch(/not found/);
  });

  it("rejects a citation to a policy not in the retrieval set", () => {
    const r = verifyCitations(
      [{ policyId: "pol-MISSING", quote: "anything anything anything anything anything" }],
      [POLICY],
    );
    expect(r.allValid).toBe(false);
    expect(r.invalidCitations[0]?.reason).toMatch(/not in retrieval set/);
  });

  it("rejects an over-short quote (would match too loosely)", () => {
    const r = verifyCitations(
      [{ policyId: "pol-1", quote: "DSM-5" }],
      [POLICY],
    );
    expect(r.allValid).toBe(false);
    expect(r.invalidCitations[0]?.reason).toMatch(/too short/);
  });

  it("reports multiple invalids in one pass", () => {
    const r = verifyCitations(
      [
        { policyId: "pol-1", quote: "fabricated text fabricated text fabricated text" },
        { policyId: "pol-1", quote: "another fabricated quote here for testing" },
      ],
      [POLICY],
    );
    expect(r.allValid).toBe(false);
    expect(r.invalidCitations).toHaveLength(2);
    expect(r.validCount).toBe(0);
  });
});

describe("normalizeForCitationMatch", () => {
  it("collapses whitespace", () => {
    expect(normalizeForCitationMatch("a\n\nb   c")).toBe("a b c");
  });
});
