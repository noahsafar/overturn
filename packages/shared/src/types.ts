import { z } from "zod";

// ── Strategy output from llm_strategize ────────────────────────────────────
export const ArgumentCategory = z.enum([
  "MEDICAL_NECESSITY",
  "CODING_ERROR",
  "DOCUMENTATION_AVAILABLE",
  "POLICY_MISAPPLICATION",
  "TIMELY_FILING",
  "NOT_APPEALABLE",
]);
export type ArgumentCategory = z.infer<typeof ArgumentCategory>;

export const Strategy = z.object({
  predictedWinProbability: z.number().min(0).max(1),
  argumentCategory: ArgumentCategory,
  evidencePoints: z.array(z.string()).max(5),
  reason: z.string(),
});
export type Strategy = z.infer<typeof Strategy>;

// ── Citation ───────────────────────────────────────────────────────────────
export const Citation = z.object({
  policyId: z.string(),
  quote: z.string(),
  sourceUrl: z.string().optional(),
  page: z.union([z.number(), z.string()]).optional(),
});
export type Citation = z.infer<typeof Citation>;

// ── Draft appeal ───────────────────────────────────────────────────────────
export const AppealDraft = z.object({
  letter: z.string(),
  templateUsed: z.string(),
  citations: z.array(Citation),
  requestedRemedyAmount: z.number(),
});
export type AppealDraft = z.infer<typeof AppealDraft>;

// ── Verification result ────────────────────────────────────────────────────
export const InvalidCitation = z.object({
  citation: Citation,
  reason: z.string(),
});
export type InvalidCitation = z.infer<typeof InvalidCitation>;

export const CitationVerification = z.object({
  allValid: z.boolean(),
  validCount: z.number(),
  invalidCitations: z.array(InvalidCitation),
});
export type CitationVerification = z.infer<typeof CitationVerification>;

// ── Submission ─────────────────────────────────────────────────────────────
export const SubmissionChannelLiteral = z.enum(["PORTAL", "FAX", "MAIL", "EPA_API"]);
export type SubmissionChannelLiteral = z.infer<typeof SubmissionChannelLiteral>;

export const SubmissionResult = z.object({
  success: z.boolean(),
  channel: SubmissionChannelLiteral,
  confirmationNumber: z.string().optional(),
  submittedAt: z.string(),
  screenshots: z.array(z.string()).default([]),
  errorMessage: z.string().optional(),
});
export type SubmissionResult = z.infer<typeof SubmissionResult>;

// ── ERA parse result ───────────────────────────────────────────────────────
export const EraClaim = z.object({
  claimControlNumber: z.string(),
  billedAmount: z.number(),
  paidAmount: z.number(),
  deniedAmount: z.number(),
  denials: z
    .array(z.object({ code: z.string(), reason: z.string(), amount: z.number() }))
    .default([]),
});
export type EraClaim = z.infer<typeof EraClaim>;

// ── Workflow context passed to activities ──────────────────────────────────
export const DenialContext = z.object({
  denialId: z.string(),
  claimId: z.string(),
  payerId: z.string(),
  denialCode: z.string(),
  denialReason: z.string(),
  deniedAmount: z.number(),
  serviceDate: z.string(),
  cptCodes: z.array(z.string()),
  icdCodes: z.array(z.string()),
  chartExcerpts: z.array(z.string()),
  patientFirstName: z.string(),
  patientLastName: z.string(),
  patientMemberId: z.string(),
  patientDob: z.string(),
  practiceName: z.string(),
});
export type DenialContext = z.infer<typeof DenialContext>;
