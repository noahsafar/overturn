#!/usr/bin/env node
// End-to-end smoke test (no DB, no Temporal, no Anthropic key required).
//
// Drives the load-bearing deterministic pieces in TS — the citation
// verifier and the prompt registry — against the synthetic BCBS data the
// seed script also produces. The Python-side full pipeline test lives in
// `apps/worker/tests/test_pipeline.py`.

import { PROMPTS, render } from "../packages/prompts/src/index.ts";
import { verifyCitations } from "../packages/shared/src/citations.ts";

const policy = {
  id: "pol-bcbs-mp-2024-50",
  body: `Blue Cross Blue Shield Medical Policy MP-2024-50 (effective 2024-01-15).

Title: Medical Necessity for Outpatient Behavioral Health Services.

Section 3.1 — Medical Necessity Criteria. Outpatient psychotherapy (CPT 90834,
90837) is considered medically necessary when (a) the member has a documented
DSM-5 diagnosis, (b) symptoms produce significant functional impairment in
occupational, social, or self-care domains, and (c) a written treatment plan
with measurable goals is maintained and updated at least every 90 days.`,
};

const draft = {
  letter: "Dear BCBS, ... (full letter here) ...",
  citations: [
    {
      policyId: policy.id,
      quote:
        "Outpatient psychotherapy (CPT 90834, 90837) is considered medically necessary when (a) the member has a documented DSM-5 diagnosis",
    },
  ],
};

// 1. Verifier accepts a real verbatim quote
const ok = verifyCitations(draft.citations, [policy]);
if (!ok.allValid) {
  console.error("❌ verifier rejected a real quote:", ok.invalidCitations);
  process.exit(1);
}
console.log("✓ verifier accepts verbatim quote (validCount=" + ok.validCount + ")");

// 2. Verifier rejects a hallucinated quote
const bad = verifyCitations(
  [{ policyId: policy.id, quote: "Outpatient services are universally covered without documentation." }],
  [policy],
);
if (bad.allValid) {
  console.error("❌ verifier accepted a hallucinated quote — fatal");
  process.exit(1);
}
console.log("✓ verifier rejects hallucinated quote (" + bad.invalidCitations[0].reason + ")");

// 3. Prompt registry renders without missing vars
const rendered = render("Hello {{name}}, denial {{code}}", { name: "Jordan", code: "CO-50" });
if (!rendered.includes("Jordan") || !rendered.includes("CO-50")) {
  console.error("❌ prompt render failed:", rendered);
  process.exit(1);
}
console.log("✓ prompt registry renders templates");

// 4. All three prompt templates load and contain their load-bearing rules
const checks = [
  [PROMPTS.strategize.body, /healthcare appeals strategist/],
  [PROMPTS.draft.body, /NEVER invent clinical facts/],
  [PROMPTS.redraft.body, /deterministic verifier rejected/],
];
for (const [body, re] of checks) {
  if (!re.test(body)) {
    console.error("❌ prompt missing required rule:", re);
    process.exit(1);
  }
}
console.log("✓ all three prompts present with required rules");

console.log("\nE2E smoke OK.");
