// Deterministic citation verifier.
//
// The spec is explicit: this is NOT an LLM call. For every citation in a
// draft, we look up the cited policy and check the quote appears verbatim
// (modulo minor whitespace/punctuation variance) in the policy body. If the
// quote can't be found, the citation is invalid and the draft is rejected
// for redrafting.
//
// This single deterministic check is the load-bearing defense against the
// worst hallucination risk (fabricated policy citations).

import type { Citation, CitationVerification, InvalidCitation } from "./types.js";

export interface PolicyDoc {
  id: string;
  body: string;
}

// Normalize whitespace and a small set of typographically-equivalent chars
// (curly quotes, dashes) so that LLM reformatting of a real quote doesn't
// cause false negatives. We do NOT lowercase, drop punctuation, or strip
// words — those would be too permissive.
export function normalizeForCitationMatch(s: string): string {
  return s
    .replace(/[‘’‚‛′]/g, "'") // curly singles
    .replace(/[“”„‟″]/g, '"') // curly doubles
    .replace(/[–—−]/g, "-") // en/em/minus dash
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_QUOTE_CHARS = 20;

export function verifyCitations(
  citations: Citation[],
  policies: PolicyDoc[],
): CitationVerification {
  const policyById = new Map(policies.map((p) => [p.id, normalizeForCitationMatch(p.body)]));
  const invalid: InvalidCitation[] = [];
  let validCount = 0;

  for (const c of citations) {
    const policy = policyById.get(c.policyId);
    if (!policy) {
      invalid.push({ citation: c, reason: `policy ${c.policyId} not in retrieval set` });
      continue;
    }
    const q = normalizeForCitationMatch(c.quote);
    if (q.length < MIN_QUOTE_CHARS) {
      invalid.push({
        citation: c,
        reason: `quote too short (<${MIN_QUOTE_CHARS} chars) — not specific enough`,
      });
      continue;
    }
    if (!policy.includes(q)) {
      invalid.push({ citation: c, reason: "quote not found verbatim in cited policy" });
      continue;
    }
    validCount += 1;
  }

  return { allValid: invalid.length === 0, validCount, invalidCitations: invalid };
}
