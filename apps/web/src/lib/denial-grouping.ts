// Display-time grouping of Denial rows.
//
// Each row in the Denial table maps 1:1 to a CAS segment in the source 835 —
// that's the right shape for audit fidelity but the wrong shape for billers,
// who think in terms of "one denial decision affecting N services". This
// module collapses CAS rows with the same (claim, denial_code) into a single
// group for display. Source rows are unchanged.
//
// Grouping key: (claim_id, denial_code). We do NOT group across codes — a
// CO-45 and a PR-3 on the same service are distinct reasons that warrant
// distinct appeal arguments.
//
// Keeping the helper isolated here means if/when we move to a per-decision
// schema later, only this function (and its callers) change.

import type { Denial, Claim, Patient, Payer, Appeal } from "@overturn/db";

export interface DenialWithRelations extends Denial {
  claim: Claim & { patient: Patient; payer: Payer };
  appeals?: Appeal[];
}

export interface DenialGroup {
  // The denial used for URLs / appeal attachment. Picked as the largest-
  // dollar member so a single-line appeal still represents the dominant
  // adjustment.
  lead: DenialWithRelations;
  // All CAS rows backing this group, ordered by deniedAmount desc.
  members: DenialWithRelations[];
  // Sum of all member denied amounts.
  totalDenied: number;
  // Sorted unique CPT codes across members. Empty for claim-level CAS.
  affectedCpts: string[];
  // Convenience: members.length. > 1 means the UI should show a service
  // breakdown instead of a single Denied row.
  count: number;
  // Group-level prioritization. Sum of member priorityScores (same
  // identity since all members share denial code + deadline, so winProb
  // and urgency are constant across the group). Tier is the highest tier
  // among members.
  priorityScore: number;
  priorityTier: "P1" | "P2" | "P3" | null;
  predictedWinProb: number | null;
}

function toNumber(d: { deniedAmount: unknown }): number {
  // Prisma Decimal serializes through .toString(); coerce safely.
  return Number(d.deniedAmount?.toString() ?? "0");
}

export function groupDenials(denials: DenialWithRelations[]): DenialGroup[] {
  const buckets = new Map<string, DenialWithRelations[]>();
  for (const d of denials) {
    const key = `${d.claimId}::${d.denialCode}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(d);
    else buckets.set(key, [d]);
  }

  const tierRank: Record<string, number> = { P1: 3, P2: 2, P3: 1 };
  const groups: DenialGroup[] = [];
  for (const members of buckets.values()) {
    // Sort by id ascending — cuids are monotonic with insertion, so this
    // matches the order the segments appeared in the source 835. Billers
    // reading down the page see CPTs in the same sequence as the file.
    members.sort((a, b) => a.id.localeCompare(b.id));
    const lead = members[0]!;
    const totalDenied = members.reduce((sum, d) => sum + toNumber(d), 0);
    const memberCpts = [
      ...new Set(
        members
          .map((d) => d.serviceCpt)
          .filter((c): c is string => !!c && c.length > 0),
      ),
    ].sort();
    // Fall back to the claim's CPT list when no per-CAS serviceCpt is set
    // (seeded data, older ingests that didn't carry per-line CPTs). The
    // claim-level codes are still meaningful for "what was billed" even if
    // we can't say which line caused the denial.
    const affectedCpts =
      memberCpts.length > 0
        ? memberCpts
        : [...new Set((lead.claim.cptCodes ?? []).filter(Boolean))].sort();
    const priorityScore = members.reduce(
      (sum, d) => sum + (d.priorityScore ?? 0),
      0,
    );
    const priorityTier =
      members
        .map((d) => d.priorityTier)
        .filter((t): t is "P1" | "P2" | "P3" => !!t)
        .sort((a, b) => (tierRank[b] ?? 0) - (tierRank[a] ?? 0))[0] ?? null;
    const predictedWinProb = lead.predictedWinProb ?? null;
    groups.push({
      lead,
      members,
      totalDenied,
      affectedCpts,
      count: members.length,
      priorityScore,
      priorityTier,
      predictedWinProb,
    });
  }

  // Sort by priorityScore desc; ties (and unscored rows) fall back to
  // receivedAt desc so the original chronological order is preserved.
  groups.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return b.lead.receivedAt.getTime() - a.lead.receivedAt.getTime();
  });
  return groups;
}

/**
 * Build a single group given an arbitrary denial id. Used by the detail page,
 * which receives any member id in the URL but should always display the full
 * group containing it.
 */
export function buildGroupForDenial(
  target: DenialWithRelations,
  siblings: DenialWithRelations[],
): DenialGroup {
  const all = [target, ...siblings.filter((s) => s.id !== target.id)];
  return groupDenials(all)[0]!;
}

/**
 * Given the eraRawText of every member in a group, compute the lines they
 * all share (prefix) and the per-member tails that actually differ. Used to
 * render a deduplicated raw-segment view instead of repeating the same
 * "Stored at:" / "CLP*..." header for every line in the claim.
 */
export function splitSharedSnippet(rawTexts: string[]): {
  shared: string[];
  tails: string[][];
} {
  if (rawTexts.length === 0) return { shared: [], tails: [] };
  const splitLines = rawTexts.map((t) => t.split("\n"));
  const minLen = Math.min(...splitLines.map((l) => l.length));
  let prefixLen = 0;
  for (let i = 0; i < minLen; i++) {
    const candidate = splitLines[0]![i];
    if (splitLines.every((l) => l[i] === candidate)) prefixLen++;
    else break;
  }
  return {
    shared: splitLines[0]!.slice(0, prefixLen),
    tails: splitLines.map((l) => l.slice(prefixLen)),
  };
}
