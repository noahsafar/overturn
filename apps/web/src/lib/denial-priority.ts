// Denial prioritization scoring.
//
// For each denial we estimate:
//   1) predictedWinProb — base appeal-success probability driven by the CARC code
//      category, adjusted by payer history (rolling win rate for the same
//      payer + code) when available.
//   2) deadlineUrgency  — a multiplier that pushes denials approaching their
//      filing deadline to the top of the work queue.
//   3) priorityScore     — deniedAmount × predictedWinProb × deadlineUrgency.
//      The product of expected recovery and urgency. Reviewers default-sort
//      by this; the dashboard exposes it as a "what to work first" signal.
//
// The base rates were calibrated against typical industry overturn data for
// small / midsize practices. They are deliberately conservative — better to
// under-predict and surprise the user with a win than the reverse. Refine
// from real outcome data per-practice once we have enough volume.

export type CarcCategory =
  | "MISSING_INFO"
  | "MEDICAL_NECESSITY"
  | "PRIOR_AUTH"
  | "CODING"
  | "DUPLICATE"
  | "COB"
  | "NON_COVERED"
  | "EXPERIMENTAL"
  | "FREQUENCY"
  | "FEE_SCHEDULE"
  | "TIMELY_FILING"
  | "ELIGIBILITY"
  | "MAX_BENEFIT"
  | "PROCEDURAL"
  | "PATIENT_RESP"
  | "OTHER";

const BASE_WIN_PROB: Record<CarcCategory, number> = {
  // Documentation gaps usually win once you send the missing piece.
  MISSING_INFO: 0.72,
  MEDICAL_NECESSITY: 0.65,
  PRIOR_AUTH: 0.55,
  CODING: 0.68,
  DUPLICATE: 0.78,
  COB: 0.58,
  NON_COVERED: 0.32,
  EXPERIMENTAL: 0.28,
  FREQUENCY: 0.42,
  FEE_SCHEDULE: 0.35,
  TIMELY_FILING: 0.18,
  ELIGIBILITY: 0.20,
  MAX_BENEFIT: 0.12,
  PROCEDURAL: 0.22,
  // Genuinely the patient's responsibility — not an appeal candidate.
  PATIENT_RESP: 0.05,
  OTHER: 0.40,
};

// Map raw CARC numbers (strip prefix first) to category. Not every code is
// listed; unknowns fall through to OTHER.
const CATEGORY_BY_CODE: Record<string, CarcCategory> = {
  // patient responsibility
  "1": "PATIENT_RESP", "2": "PATIENT_RESP", "3": "PATIENT_RESP",
  // coding
  "4": "CODING", "5": "CODING", "6": "CODING", "7": "CODING", "8": "CODING",
  "9": "CODING", "10": "CODING", "11": "CODING", "12": "CODING",
  "146": "CODING", "181": "CODING", "182": "CODING", "199": "CODING",
  "236": "CODING", "240": "CODING", "261": "CODING", "282": "CODING",
  // missing info / docs
  "16": "MISSING_INFO", "17": "MISSING_INFO", "125": "MISSING_INFO",
  "163": "MISSING_INFO", "164": "MISSING_INFO", "226": "MISSING_INFO",
  "227": "MISSING_INFO", "228": "MISSING_INFO", "250": "MISSING_INFO",
  "251": "MISSING_INFO", "252": "MISSING_INFO", "148": "MISSING_INFO",
  // duplicate
  "18": "DUPLICATE",
  // coordination of benefits / other payer
  "22": "COB", "23": "COB", "109": "COB", "275": "COB", "276": "COB",
  // timely filing
  "29": "TIMELY_FILING",
  // eligibility
  "26": "ELIGIBILITY", "27": "ELIGIBILITY", "28": "ELIGIBILITY",
  "31": "ELIGIBILITY", "32": "ELIGIBILITY", "33": "ELIGIBILITY",
  "177": "ELIGIBILITY", "200": "ELIGIBILITY",
  // max benefit
  "35": "MAX_BENEFIT", "119": "MAX_BENEFIT", "149": "MAX_BENEFIT",
  // fee schedule / contractual
  "45": "FEE_SCHEDULE", "42": "FEE_SCHEDULE", "147": "FEE_SCHEDULE",
  // medical necessity
  "50": "MEDICAL_NECESSITY", "167": "MEDICAL_NECESSITY",
  // experimental / investigational
  "55": "EXPERIMENTAL", "56": "EXPERIMENTAL",
  // prior auth
  "15": "PRIOR_AUTH", "39": "PRIOR_AUTH", "197": "PRIOR_AUTH",
  "198": "PRIOR_AUTH", "210": "PRIOR_AUTH", "284": "PRIOR_AUTH",
  "288": "PRIOR_AUTH", "287": "PRIOR_AUTH", "296": "PRIOR_AUTH",
  "302": "PRIOR_AUTH",
  // frequency / dosage / level of service
  "150": "FREQUENCY", "151": "FREQUENCY", "152": "FREQUENCY",
  "153": "FREQUENCY", "154": "FREQUENCY",
  // non-covered
  "96": "NON_COVERED", "204": "NON_COVERED", "256": "NON_COVERED",
  // procedural appeals
  "138": "PROCEDURAL", "285": "PROCEDURAL", "286": "PROCEDURAL",
};

function stripPrefix(code: string): string {
  const m = code.trim().match(/^(?:CO|OA|PI|PR|CR)[-_ ]?([A-Z]?\d+[A-Z]?)$/i);
  return (m ? m[1]! : code.replace(/^[A-Z]+[-_ ]/, "")).toUpperCase();
}

export function categorizeCarc(code: string): CarcCategory {
  return CATEGORY_BY_CODE[stripPrefix(code)] ?? "OTHER";
}

export function baseWinProb(code: string): number {
  return BASE_WIN_PROB[categorizeCarc(code)];
}

/** Multiplier on priorityScore that grows as the deadline approaches.
 * Returns 0 for already-past deadlines (cannot appeal). 1.0 baseline when
 * the deadline is unknown or more than 90 days out. */
export function deadlineUrgency(filingDeadline: Date | null | undefined, now = new Date()): number {
  if (!filingDeadline) return 1.0;
  const daysLeft = Math.floor(
    (filingDeadline.getTime() - now.getTime()) / 86_400_000,
  );
  if (daysLeft < 0) return 0.0;
  if (daysLeft <= 7) return 2.5;
  if (daysLeft <= 14) return 2.0;
  if (daysLeft <= 30) return 1.5;
  if (daysLeft <= 60) return 1.3;
  if (daysLeft <= 90) return 1.1;
  return 1.0;
}

export interface PriorityInputs {
  denialCode: string;
  deniedAmount: number;
  filingDeadline: Date | null | undefined;
  /** Optional empirical win-rate for this (payer, denialCode) from past
   * outcomes. If provided, we blend it 60/40 with the base rate using a
   * shrinkage factor based on n. */
  payerCodeHistory?: { wins: number; total: number };
  now?: Date;
}

export interface PriorityResult {
  predictedWinProb: number;
  priorityScore: number;
  priorityTier: "P1" | "P2" | "P3";
  scoreExplain: {
    category: CarcCategory;
    baseWinProb: number;
    historyAdjustment: number;
    deadlineUrgency: number;
    daysToDeadline: number | null;
  };
}

export function scoreDenial(inputs: PriorityInputs): PriorityResult {
  const { denialCode, deniedAmount, filingDeadline, payerCodeHistory, now = new Date() } = inputs;
  const category = categorizeCarc(denialCode);
  const base = BASE_WIN_PROB[category];

  // Blend with payer-specific history if we have enough samples. Light
  // shrinkage so a single outlier outcome doesn't move the prediction.
  let historyAdjustment = 0;
  let blended = base;
  if (payerCodeHistory && payerCodeHistory.total >= 3) {
    const observed = payerCodeHistory.wins / payerCodeHistory.total;
    const weight = Math.min(payerCodeHistory.total / 20, 0.6);
    blended = base * (1 - weight) + observed * weight;
    historyAdjustment = blended - base;
  }

  const urgency = deadlineUrgency(filingDeadline, now);
  const daysToDeadline = filingDeadline
    ? Math.floor((filingDeadline.getTime() - now.getTime()) / 86_400_000)
    : null;
  const score = deniedAmount * blended * urgency;

  // Tier rules:
  //   P1 = (≥ $500 AND winProb ≥ 0.30 AND <14d to deadline) OR score ≥ 300
  //   P2 = (≥ $200 AND winProb ≥ 0.25) AND not P1
  //   P3 = else
  let tier: "P1" | "P2" | "P3" = "P3";
  const dl = daysToDeadline ?? Number.POSITIVE_INFINITY;
  const isDeadlineCritical = dl >= 0 && dl < 14 && deniedAmount >= 500 && blended >= 0.30;
  const isHighScore = score >= 300;
  if (isDeadlineCritical || isHighScore) tier = "P1";
  else if (deniedAmount >= 200 && blended >= 0.25 && dl >= 0) tier = "P2";

  return {
    predictedWinProb: Number(blended.toFixed(3)),
    priorityScore: Number(score.toFixed(2)),
    priorityTier: tier,
    scoreExplain: {
      category,
      baseWinProb: Number(base.toFixed(3)),
      historyAdjustment: Number(historyAdjustment.toFixed(3)),
      deadlineUrgency: Number(urgency.toFixed(2)),
      daysToDeadline,
    },
  };
}

/** Denials with these categories are almost always cured by a corrected
 * claim (an 837 with frequency code 7), not by an appeal letter. We surface
 * "Resubmit as corrected claim" alongside "Draft appeal" on the denial
 * detail page when the category matches. */
const CORRECTED_CLAIM_CATEGORIES = new Set<CarcCategory>([
  "CODING",
  "MISSING_INFO",
  "DUPLICATE",
]);

export function isCorrectedClaimCandidate(code: string): boolean {
  return CORRECTED_CLAIM_CATEGORIES.has(categorizeCarc(code));
}

/** Why we offer corrected-claim resubmission. Surfaced to the user so they
 * understand whether the alternative is appropriate. */
export function correctedClaimGuidance(code: string): string | null {
  const cat = categorizeCarc(code);
  switch (cat) {
    case "CODING":
      return "Looks like a coding error. Often cured faster by correcting the CPT/modifier and resubmitting as a corrected claim than by appealing.";
    case "MISSING_INFO":
      return "Missing information. Add the missing field (e.g., referring NPI, attachment) and resubmit as a corrected claim — usually quicker than an appeal.";
    case "DUPLICATE":
      return "Marked as a duplicate. If this is not actually a duplicate, resubmit with frequency code 7 (corrected) and a note explaining why.";
    default:
      return null;
  }
}

/** Human-readable label for a tier. */
export function tierLabel(tier: string | null | undefined): string {
  if (tier === "P1") return "P1 · Work first";
  if (tier === "P2") return "P2";
  if (tier === "P3") return "P3";
  return "Unscored";
}
