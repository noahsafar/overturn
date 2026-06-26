// POST /api/upload — Unified file upload endpoint.
//
// Accepts ERA/835 files, CSV billing exports, EOB PDFs, and screenshot images.
// Auto-detects file type and routes to appropriate processor.
// Supports multiple files in a single request.
// Stores original files in S3 for audit trail.
//
// Goal: Make uploading denials as simple as drag-and-drop with zero configuration.
import { prisma, encryptPhi } from "@overturn/db";
import { apiHandler, badRequest } from "@/lib/api";
import { computeFilingDeadline } from "@/lib/deadlines";
import { worker } from "@/lib/worker";
import { uploadFile } from "@/lib/storage";
import { lookupCarcReason } from "@/lib/carc-codes";
import { scoreDenial } from "@/lib/denial-priority";

// Compute priority + win-likelihood for a denial about to be created. Pure
// function of the inputs — no DB writes here, the caller spreads the result
// into the prisma create payload. History-based blending will be wired in
// once per-(payer, code) outcome counts are cached.
function priorityFieldsFor(args: {
  denialCode: string;
  deniedAmount: string | number;
  filingDeadline: Date | null;
}) {
  const amt =
    typeof args.deniedAmount === "string"
      ? Number(args.deniedAmount)
      : args.deniedAmount;
  const r = scoreDenial({
    denialCode: args.denialCode,
    deniedAmount: Number.isFinite(amt) ? amt : 0,
    filingDeadline: args.filingDeadline,
  });
  return {
    predictedWinProb: r.predictedWinProb,
    priorityScore: r.priorityScore,
    priorityTier: r.priorityTier,
    scoreExplain: r.scoreExplain as unknown as object,
  };
}

// Compose the denial reason. Prefer a payer-supplied reason; otherwise look up
// the human CARC description; only as a last resort fall back to the code
// itself. Empty string ("") means "unknown" — never fabricate medical content.
function resolveDenialReason(code: string, payerProvided: string | undefined | null): string {
  if (payerProvided && payerProvided.trim()) return payerProvided.trim();
  const carc = lookupCarcReason(code);
  return carc ?? `Denial code ${code}`;
}

// Compute a filing deadline ONLY when we have a curated appeal window for the
// payer. NULL means "unknown" — surfaces in the UI rather than inventing a date.
function deadlineFor(receivedAt: Date, windowDays: number | null | undefined): Date | null {
  return windowDays != null ? computeFilingDeadline(receivedAt, windowDays) : null;
}

// Parse a date string as LOCAL time. `new Date("2024-04-10")` is parsed as UTC
// midnight which renders as the previous day in any western timezone — caused
// every CSV-imported date to show off by one day. For ISO date-only strings we
// pin the time-of-day so it stays in the user's local day.
function parseLocalDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(trimmed + "T00:00:00");
  }
  return new Date(trimmed);
}

// Collapse whitespace, punctuation, and case so "United Healthcare",
// "UNITEDHEALTHCARE", "United Healthcare, Inc." and "united-healthcare" all
// reduce to the same key. Used only for payer matching — we still display
// the canonical (most established) name from whichever Payer row wins.
function normalizePayerName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Find an existing Payer whose normalized name matches the incoming source
// name. Two passes so an exact normalized match always beats a containment
// match — that way "Cigna" wins for itself before considering a longer
// "Cigna Health and Life Insurance Company" containment.
async function findPayerByNormalizedName(name: string) {
  const target = normalizePayerName(name);
  if (!target) return null;
  const all = await prisma.payer.findMany({
    select: { id: true, name: true, appealWindowDays: true, payerIdNumbers: true, portalUrl: true, ivrPhone: true, faxNumber: true, appealAddress: true, epaSupported: true },
  });
  for (const p of all) {
    if (normalizePayerName(p.name) === target) return p;
  }
  for (const p of all) {
    const cand = normalizePayerName(p.name);
    if (!cand) continue;
    if (cand.includes(target) || target.includes(cand)) return p;
  }
  return null;
}

// Split a combined patient-name cell into first/last. Supports two real-world
// shapes: "Last, First" (preferred by many billing exports) and "First Last".
// Empty string when the cell is blank.
function splitPatientName(combined: string | undefined | null): {
  firstName: string;
  lastName: string;
} {
  const name = combined?.trim();
  if (!name) return { firstName: "", lastName: "" };
  if (name.includes(",")) {
    const [last, first] = name.split(",", 2).map((s) => s.trim());
    return { firstName: first ?? "", lastName: last ?? "" };
  }
  const parts = name.split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

const DEMO_PAYER_ID = "seed_payer_bcbs";

type FileType = "era" | "csv" | "eob-pdf" | "screenshot" | "unknown";

interface UploadResult {
  file: string;
  type: FileType;
  denials: number;
  // Count of claims in the file whose controlNumber already exists in this
  // practice — silently skipped. Surfaced so the UI can distinguish
  // "parsing failed" from "already imported".
  skipped: number;
  status: "success" | "partial" | "error";
  message?: string;
  claims?: string[];
}

interface UploadResponse {
  results: UploadResult[];
  total: number;
  totalSkipped: number;
  errors: number;
}

function detectFileType(file: File): FileType {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  const mime = file.type;

  // Images (screenshots)
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return "screenshot";
  }
  if (mime.startsWith("image/")) {
    return "screenshot";
  }

  // PDFs (EOB documents)
  if (ext === ".pdf" || mime === "application/pdf") {
    return "eob-pdf";
  }

  // ERA/835 files
  if ([".txt", ".era", ".835"].includes(ext)) {
    return "era";
  }

  // CSV files
  if (ext === ".csv" || mime === "text/csv") {
    return "csv";
  }

  // Try to detect by content
  if (ext === ".txt" || mime.startsWith("text/")) {
    return "era"; // Default text files to ERA
  }

  return "unknown";
}

async function processEraFile(
  eraContent: string,
  practiceId: string,
  storageKey?: string
): Promise<{ denials: number; claims: string[]; skipped: number }> {
  const response = await fetch(
    `${process.env.WORKER_INTERNAL_URL ?? "http://localhost:8001"}/internal/parse-era`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ era: eraContent }),
    },
  );

  if (!response.ok) {
    throw new Error(`ERA parsing failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    claims: Array<{
      control_number: string;
      payer_name: string;
      patient_name: string;
      member_id: string;
      service_date_start: string;
      service_date_end: string;
      billed: number;
      paid: number;
      denied: number;
      cpt_codes?: string[];
      payment_date?: string;
      rendering_provider?: string;
      denials: Array<{
        code: string;
        reason: string;
        amount: number;
        cpt?: string | null;
        raw_snippet?: string | null;
      }>;
    }>;
  };

  // Try to record outcomes for existing claims
  try {
    await worker.ingestOutcomes(eraContent);
  } catch (e) {
    console.error("[upload] outcome ingest failed:", e);
  }

  // Group claims by payer name to handle multiple payers in one file
  const payerMap = new Map<string, string>();

  for (const claimData of data.claims) {
    const payerName = claimData.payer_name || "Unknown Payer";

    // Create or find payer using normalized-name matching so "MEDICARE PART
    // B - NORIDIAN" and "Medicare Part B Noridian" map to the same row.
    let payerId = payerMap.get(payerName);
    if (!payerId) {
      const existingPayer = await findPayerByNormalizedName(payerName);
      if (existingPayer) {
        payerId = existingPayer.id;
      } else {
        // Auto-created from an ERA. Leave appealWindowDays NULL — we have
        // not researched this payer's appeal policy yet. The UI will show
        // "filing deadline: unknown" rather than invent one.
        const newPayer = await prisma.payer.create({
          data: { name: payerName.substring(0, 100) },
        });
        payerId = newPayer.id;
      }

      payerMap.set(payerName, payerId);
    }
  }

  const claims: string[] = [];
  let denials = 0;
  let skipped = 0;

  for (const claimData of data.claims) {
    // Get the payer ID for this claim
    const payerName = claimData.payer_name || "Unknown Payer";
    const payerId = payerMap.get(payerName) || DEMO_PAYER_ID;

    const existing = await prisma.claim.findFirst({
      where: {
        practiceId,
        controlNumber: claimData.control_number,
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    if (claimData.denials.length === 0) continue;

    // Only use what the 835 actually carried. Never fabricate PHI.
    // Empty strings mean "not supplied by source" — the UI renders these as —.
    const nameParts = (claimData.patient_name ?? "").trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ");

    const patient = await prisma.patient.upsert({
      where: {
        practiceId_externalId: {
          practiceId,
          externalId: `PT-${claimData.control_number}`,
        },
      },
      // Backfill missing PHI on re-uploads: only emit a field when the
      // current source actually carries it, so good data isn't overwritten
      // by absence.
      update: {
        insurancePayerId: payerId,
        ...(firstName && { firstNameEnc: encryptPhi(firstName) }),
        ...(lastName && { lastNameEnc: encryptPhi(lastName) }),
        ...(claimData.member_id && { memberIdEnc: encryptPhi(claimData.member_id) }),
      },
      create: {
        practiceId,
        externalId: `PT-${claimData.control_number}`,
        firstNameEnc: encryptPhi(firstName),
        lastNameEnc: encryptPhi(lastName),
        dobEnc: encryptPhi(""),
        memberIdEnc: encryptPhi(claimData.member_id ?? ""),
        insurancePayerId: payerId,
      },
    });

    // Use extracted service date if available
    // Keep as string to avoid timezone conversion issues
    const serviceDate = claimData.service_date_start
      ? new Date(claimData.service_date_start + "T00:00:00")  // Force local time to avoid UTC conversion
      : new Date();

    const claim = await prisma.claim.create({
      data: {
        practiceId,
        patientId: patient.id,
        payerId: payerId,
        serviceDate: serviceDate,
        cptCodes: claimData.cpt_codes ?? [],
        icdCodes: [],
        billedAmount: claimData.billed.toString(),
        controlNumber: claimData.control_number,
        renderingProvider: claimData.rendering_provider || null,
        status: "DENIED",
        submittedAt: new Date(),
      },
    });

    claims.push(claim.id);

    // One DB read per claim is sufficient — the appeal window is a payer-
    // level value, not per-denial.
    const payerRecord = await prisma.payer.findUnique({
      where: { id: payerId },
      select: { appealWindowDays: true }
    });

    // ERA payment / production date stamped on the 835 itself. Use it as
    // the "received from payer" timestamp — NOT the upload time.
    let eraReceivedAt = claimData.payment_date
      ? new Date(claimData.payment_date + "T00:00:00")
      : new Date();

    // Validate ERA received date is not in the future
    const now = new Date();
    if (eraReceivedAt > now) {
      console.warn(`[upload] ERA received date ${eraReceivedAt.toISOString()} is in the future, using today instead`);
      eraReceivedAt = now;
    }

    for (const denial of claimData.denials) {
      const receivedAt = eraReceivedAt;
      const snippet = denial.raw_snippet ?? "";
      const eraRawText = storageKey
        ? `Stored at: ${storageKey}${snippet ? "\n" + snippet : ""}`
        : snippet;

      const filingDeadline = deadlineFor(receivedAt, payerRecord?.appealWindowDays);
      await prisma.denial.create({
        data: {
          claimId: claim.id,
          denialCode: denial.code,
          denialReason: resolveDenialReason(denial.code, denial.reason),
          deniedAmount: denial.amount.toString(),
          serviceCpt: denial.cpt ?? null,
          eraRawText,
          receivedAt,
          filingDeadline,
          ...priorityFieldsFor({
            denialCode: denial.code,
            deniedAmount: denial.amount,
            filingDeadline,
          }),
        },
      });
      denials++;
    }
  }

  return { denials, claims, skipped };
}

async function processCsvFile(
  csvContent: string,
  practiceId: string,
  storageKey?: string
): Promise<{ denials: number; claims: string[]; warnings: string[]; skipped: number }> {
  const { smartParseCsv } = await import("@/lib/csv-smart-parse");
  const { rows, mapping, warnings } = smartParseCsv(csvContent);

  if (rows.length === 0) {
    return { denials: 0, claims: [], warnings, skipped: 0 };
  }

  const claims: string[] = [];
  let denials = 0;
  let skipped = 0;

  for (const r of rows) {
    try {
      const payerName = r.payer_id || "Unknown Payer";
      // Try id match first (rare — CSVs almost never carry our internal id),
      // then fall back to normalized-name matching so "United Healthcare"
      // collapses onto the existing "UNITEDHEALTHCARE INSURANCE COMPANY" row.
      let payer = r.payer_id
        ? await prisma.payer.findFirst({ where: { id: r.payer_id } })
        : null;
      if (!payer) payer = await findPayerByNormalizedName(payerName);

      if (!payer) {
        // Check if this matches a known payer pattern to set appealWindowDays
        const normalizedName = payerName.toLowerCase();
        let appealWindowDays: number | null = null;

        // Known payers with 180-day appeal windows
        if (
          normalizedName.includes("blue cross") ||
          normalizedName.includes("bcbs") ||
          normalizedName.includes("aetna") ||
          normalizedName.includes("united") ||
          normalizedName.includes("cigna") ||
          normalizedName.includes("humana") ||
          normalizedName.includes("kaiser") ||
          normalizedName.includes("anthem")
        ) {
          appealWindowDays = 180;
        }

        // Create a new payer if none found
        payer = await prisma.payer.create({
          data: {
            name: payerName.substring(0, 100),
            ...(appealWindowDays && { appealWindowDays }),
          },
        });
      }

      const patientId = r.external_patient_id || `PT-${Date.now()}-${denials + skipped}`;
      const serviceDate = parseLocalDate(r.service_date) ?? new Date();
      const csvCode = r.denial_code || "UNKNOWN";

      // Compute the denied amount now so we can use it as part of the
      // dedupe signature. If the CSV doesn't carry a denied column but
      // it carries billed + allowed, compute the contractual write-off
      // (billed - allowed). This is what CO-45 represents on a paid line.
      let deniedAmount = r.denied_amount || "";
      if ((!deniedAmount || Number(deniedAmount) === 0) && r.billed_amount && r.allowed_amount) {
        const billed = Number(r.billed_amount);
        const allowed = Number(r.allowed_amount);
        if (Number.isFinite(billed) && Number.isFinite(allowed) && billed > allowed) {
          deniedAmount = (billed - allowed).toFixed(2);
        }
      }
      if (!deniedAmount) deniedAmount = "0";

      // CSV has no source-of-truth identifier (unlike ERA's controlNumber).
      // Dedupe on a synthetic composite of (practice, patient externalId,
      // service date, denial code, denied amount). Re-uploading the same
      // CSV becomes a no-op instead of creating duplicates.
      const existingDenial = await prisma.denial.findFirst({
        where: {
          denialCode: csvCode,
          deniedAmount,
          claim: {
            practiceId,
            serviceDate,
            patient: { externalId: patientId },
          },
        },
        select: { id: true },
      });
      if (existingDenial) {
        skipped++;
        continue;
      }

      // Patient name resolution. Prefer split first/last columns; fall back
      // to the combined patient_name column (split on "Last, First" or
      // "First Last"). Empty when neither is provided — never fabricated.
      let firstName = r.first_name ?? "";
      let lastName = r.last_name ?? "";
      if (!firstName && !lastName && r.patient_name) {
        const split = splitPatientName(r.patient_name);
        firstName = split.firstName;
        lastName = split.lastName;
      }

      const patient = await prisma.patient.upsert({
        where: {
          practiceId_externalId: {
            practiceId,
            externalId: patientId,
          },
        },
        // Backfill missing PHI on re-uploads: only emit a field when the
        // current source actually carries it, so good data isn't overwritten
        // by absence.
        update: {
          insurancePayerId: payer.id,
          ...(firstName && { firstNameEnc: encryptPhi(firstName) }),
          ...(lastName && { lastNameEnc: encryptPhi(lastName) }),
          ...(r.dob && { dobEnc: encryptPhi(r.dob) }),
          ...(r.member_id && { memberIdEnc: encryptPhi(r.member_id) }),
        },
        create: {
          practiceId,
          externalId: patientId,
          firstNameEnc: encryptPhi(firstName),
          lastNameEnc: encryptPhi(lastName),
          dobEnc: encryptPhi(r.dob ?? ""),
          memberIdEnc: encryptPhi(r.member_id ?? ""),
          insurancePayerId: payer.id,
        },
      });

      const claim = await prisma.claim.create({
        data: {
          practiceId,
          patientId: patient.id,
          payerId: payer.id,
          serviceDate,
          cptCodes: r.cpt?.split(/\s+/).filter(Boolean) ?? [],
          icdCodes: r.icd?.split(/\s+/).filter(Boolean) ?? [],
          billedAmount: r.billed_amount || "0",
          status: "DENIED",
          submittedAt: parseLocalDate(r.submitted_at) ?? new Date(),
        },
      });

      claims.push(claim.id);

      // Validate receivedAt is not in the future
      let receivedAt = parseLocalDate(r.received_at) ?? new Date();
      const now = new Date();
      if (receivedAt > now) {
        console.warn(`[upload] Received date ${receivedAt.toISOString()} is in the future, using today instead`);
        receivedAt = now;
      }

      const serviceCpt = r.cpt?.split(/\s+/).filter(Boolean)[0] ?? null;
      const csvFilingDeadline = deadlineFor(receivedAt, payer.appealWindowDays);

      await prisma.denial.create({
        data: {
          claimId: claim.id,
          denialCode: csvCode,
          denialReason: resolveDenialReason(csvCode, r.denial_reason),
          deniedAmount,
          serviceCpt,
          eraRawText: r.era_raw || `Denied: ${csvCode} — ${resolveDenialReason(csvCode, r.denial_reason)}`,
          receivedAt,
          filingDeadline: csvFilingDeadline,
          ...priorityFieldsFor({
            denialCode: csvCode,
            deniedAmount,
            filingDeadline: csvFilingDeadline,
          }),
        },
      });
      denials++;
    } catch (error) {
      console.error(`Error processing CSV row:`, error);
      warnings.push(`Failed to process row: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  return { denials, claims, warnings, skipped };
}

function parseCsv(body: string): Array<any> {
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h.toLowerCase().replace(/\s+/g, "_")] = cells[i] ?? ""));
    return obj;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') {
        inQ = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

async function resolvePayer(payerName: string | undefined | null) {
  const trimmed = payerName?.trim();
  if (trimmed) {
    const existing = await findPayerByNormalizedName(trimmed);
    if (existing) return existing;
    // Newly-encountered payer — appealWindowDays stays NULL until curated.
    return prisma.payer.create({ data: { name: trimmed.substring(0, 100) } });
  }
  const fallback = await prisma.payer.findFirst();
  if (fallback) return fallback;
  return prisma.payer.create({ data: { name: "Unknown Payer" } });
}

async function processEobPdf(
  pdfBytes: ArrayBuffer,
  fileName: string,
  practiceId: string,
  storageKey?: string
): Promise<{ denials: number; claims: string[]; sourceType: string }> {
  const base64 = Buffer.from(pdfBytes).toString("base64");

  const response = await fetch(
    `${process.env.WORKER_INTERNAL_URL ?? "http://localhost:8001"}/internal/parse-eob`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pdf: base64, filename: fileName }),
    },
  );

  if (!response.ok) {
    throw new Error(`EOB parsing failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    denials: Array<{
      control_number?: string;
      patient_name?: string;
      member_id?: string;
      service_date?: string;
      denial_code: string;
      denial_reason: string;
      denied_amount: number;
      payer_name?: string;
      billed_amount?: number;
      cpt?: string | null;
      raw_snippet?: string | null;
      payment_date?: string | null;
      rendering_provider?: string | null;
    }>;
    source_type?: string;
    extracted_text?: string;
  };

  const sourceType = data.source_type ?? "eob";

  // If the PDF turned out to be an ERA, run outcome ingestion against the same
  // text — same as the native .835 path does. Failure here is non-fatal.
  if (sourceType === "era" && data.extracted_text) {
    try {
      await worker.ingestOutcomes(data.extracted_text);
    } catch (e) {
      console.error("[upload] outcome ingest failed (PDF/ERA):", e);
    }
  }

  const claims: string[] = [];
  let denials = 0;

  // Group denials by claim key (patient, payer, service date, control number)
  // so that multiple denials on the same claim are stored together
  interface ClaimGroup {
    patient: { externalId: string; firstName: string; lastName: string; memberId: string };
    payerId: string;
    serviceDate: Date;
    controlNumber?: string;
    denials: Array<typeof data.denials[0]>;
  }
  const claimGroups = new Map<string, ClaimGroup>();

  for (const denialData of data.denials) {
    const payer = await resolvePayer(denialData.payer_name);
    const externalId = denialData.member_id || `PT-${denialData.control_number ?? Date.now()}`;
    const nameParts = (denialData.patient_name ?? "").trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ");
    const serviceDate = denialData.service_date
      ? new Date(denialData.service_date + "T00:00:00")
      : new Date();

    // Create a unique key for this claim
    const claimKey = `${externalId}::${payer.id}::${serviceDate.toISOString()}::${denialData.control_number ?? ""}`;

    if (!claimGroups.has(claimKey)) {
      claimGroups.set(claimKey, {
        patient: { externalId, firstName, lastName, memberId: denialData.member_id ?? "" },
        payerId: payer.id,
        serviceDate,
        controlNumber: denialData.control_number,
        denials: [],
      });
    }
    claimGroups.get(claimKey)!.denials.push(denialData);
  }

  // Now create claims and denials for each group
  for (const [claimKey, group] of claimGroups) {
    const { patient: patientData, payerId, serviceDate, controlNumber, denials: denialsInGroup } = group;

    const patient = await prisma.patient.upsert({
      where: {
        practiceId_externalId: {
          practiceId,
          externalId: patientData.externalId,
        },
      },
      update: {
        insurancePayerId: payerId,
        ...(patientData.firstName && { firstNameEnc: encryptPhi(patientData.firstName) }),
        ...(patientData.lastName && { lastNameEnc: encryptPhi(patientData.lastName) }),
        ...(patientData.memberId && { memberIdEnc: encryptPhi(patientData.memberId) }),
      },
      create: {
        practiceId,
        externalId: patientData.externalId,
        firstNameEnc: encryptPhi(patientData.firstName),
        lastNameEnc: encryptPhi(patientData.lastName),
        dobEnc: encryptPhi(""),
        memberIdEnc: encryptPhi(patientData.memberId),
        insurancePayerId: payerId,
      },
    });

    // Collect all CPTs from denials in this group, and take the claim-level
    // billed amount ONCE — every EobDenial in a group carries the same
    // claim-level `billed_amount`, so summing would double-count (e.g., a
    // 2-denial claim would show 2× the real billed). Fall back to the
    // denial amount only when no billed value is available.
    const allCpts = denialsInGroup.map((d) => d.cpt).filter((c): c is string => !!c);
    const billedCandidates = denialsInGroup
      .map((d) => d.billed_amount)
      .filter((v): v is number => v != null);
    const totalBilled =
      billedCandidates.length > 0
        ? Math.max(...billedCandidates)
        : denialsInGroup.reduce((sum, d) => sum + (d.denied_amount ?? 0), 0);

    const renderingProvider =
      denialsInGroup.find((d) => d.rendering_provider)?.rendering_provider ??
      null;
    const claim = await prisma.claim.create({
      data: {
        practiceId,
        patientId: patient.id,
        payerId,
        serviceDate,
        cptCodes: allCpts,
        icdCodes: [],
        billedAmount: totalBilled.toString(),
        controlNumber,
        renderingProvider,
        status: "DENIED",
        submittedAt: new Date(),
      },
    });

    claims.push(claim.id);

    // Create all denials for this claim
    for (const denialData of denialsInGroup) {
      let receivedAt = denialData.payment_date
        ? new Date(denialData.payment_date + "T00:00:00")
        : new Date();

      // Validate received date is not in the future
      const now = new Date();
      if (receivedAt > now) {
        console.warn(`[upload] EOB received date ${receivedAt.toISOString()} is in the future, using today instead`);
        receivedAt = now;
      }

      const provenance = sourceType === "era"
        ? `Extracted from ERA-in-PDF: ${fileName}`
        : `Extracted from EOB PDF: ${fileName}`;
      const rawBody = denialData.raw_snippet?.trim()
        ? `${provenance}\n${denialData.raw_snippet.trim()}`
        : provenance;

      const eobWindowDays = (await prisma.payer.findUnique({
        where: { id: payerId },
        select: { appealWindowDays: true },
      }))?.appealWindowDays;
      const eobFilingDeadline = deadlineFor(receivedAt, eobWindowDays);
      await prisma.denial.create({
        data: {
          claimId: claim.id,
          denialCode: denialData.denial_code,
          denialReason: resolveDenialReason(denialData.denial_code, denialData.denial_reason),
          deniedAmount: denialData.denied_amount.toString(),
          serviceCpt: denialData.cpt ?? null,
          eraRawText: storageKey ? `Stored at: ${storageKey}\n${rawBody}` : rawBody,
          receivedAt,
          filingDeadline: eobFilingDeadline,
          ...priorityFieldsFor({
            denialCode: denialData.denial_code,
            deniedAmount: denialData.denied_amount,
            filingDeadline: eobFilingDeadline,
          }),
        },
      });
      denials++;
    }
  }

  return { denials, claims, sourceType };
}

async function processScreenshot(
  imageBytes: ArrayBuffer,
  fileName: string,
  practiceId: string,
  storageKey?: string
): Promise<{ denials: number; claims: string[] }> {
  const base64 = Buffer.from(imageBytes).toString("base64");

  const response = await fetch(
    `${process.env.WORKER_INTERNAL_URL ?? "http://localhost:8001"}/internal/parse-screenshot`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: base64, filename: fileName }),
    },
  );

  if (!response.ok) {
    throw new Error(`Screenshot parsing failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    denials: Array<{
      denial_code: string;
      denial_reason: string;
      denied_amount?: number;
      patient_info?: string;
    }>;
  };

  if (data.denials.length === 0) {
    return { denials: 0, claims: [] };
  }

  const claims: string[] = [];
  let denials = 0;

  for (const denialData of data.denials) {
    let payer = await prisma.payer.findFirst();

    if (!payer) {
      payer = await prisma.payer.create({
        data: { name: "Unknown Payer" },
      });
    }

    // Screenshots rarely yield a stable patient identifier — synthesize an
    // externalId only for the row PK. Real PHI fields stay empty until the
    // vision model can extract them.
    const externalId = `PT-${Date.now()}-${denials}`;

    const patient = await prisma.patient.upsert({
      where: {
        practiceId_externalId: {
          practiceId,
          externalId,
        },
      },
      update: {},
      create: {
        practiceId,
        externalId,
        firstNameEnc: encryptPhi(""),
        lastNameEnc: encryptPhi(""),
        dobEnc: encryptPhi(""),
        memberIdEnc: encryptPhi(""),
        insurancePayerId: payer.id,
      },
    });

    const claim = await prisma.claim.create({
      data: {
        practiceId,
        patientId: patient.id,
        payerId: payer.id,
        serviceDate: new Date(),
        cptCodes: [],
        icdCodes: [],
        billedAmount: denialData.denied_amount?.toString() || "0",
        status: "DENIED",
        submittedAt: new Date(),
      },
    });

    claims.push(claim.id);

    const receivedAt = new Date();
    const patientInfo = denialData.patient_info?.trim();
    const screenshotFilingDeadline = deadlineFor(receivedAt, payer.appealWindowDays);
    await prisma.denial.create({
      data: {
        claimId: claim.id,
        denialCode: denialData.denial_code,
        denialReason: resolveDenialReason(denialData.denial_code, denialData.denial_reason),
        deniedAmount: denialData.denied_amount?.toString() || "0",
        eraRawText: storageKey
          ? `Stored at: ${storageKey}\nExtracted from screenshot: ${fileName}${patientInfo ? `\n\nPatient info: ${patientInfo}` : ""}`
          : `Extracted from screenshot: ${fileName}${patientInfo ? `\n\nPatient info: ${patientInfo}` : ""}`,
        receivedAt,
        filingDeadline: screenshotFilingDeadline,
        ...priorityFieldsFor({
          denialCode: denialData.denial_code,
          deniedAmount: denialData.denied_amount ?? 0,
          filingDeadline: screenshotFilingDeadline,
        }),
      },
    });
    denials++;
  }

  return { denials, claims };
}

export const POST = apiHandler(
  {
    requiredRole: "STAFF",
    audit: { action: "claims.upload", resourceType: "claim" },
  },
  async ({ user, req }) => {
    const formData = await req.formData();
    const files: File[] = [];

    for (const [name, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      throw badRequest("No files uploaded");
    }

    const results: UploadResult[] = [];
    let totalDenials = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const file of files) {
      try {
        const fileType = detectFileType(file);
        let result: UploadResult;

        switch (fileType) {
          case "era": {
            const content = await file.text();
            // Store original file
            let storageKey: string | undefined;
            try {
              const upload = await uploadFile(file, "era/", file.name);
              storageKey = upload.key;
            } catch (e) {
              console.warn("Failed to store ERA file:", e);
            }
            const processed = await processEraFile(content, user.practiceId, storageKey);
            const eraMessage = processed.skipped > 0
              ? processed.denials > 0
                ? `${processed.skipped} claim${processed.skipped !== 1 ? "s" : ""} already imported`
                : `All ${processed.skipped} claim${processed.skipped !== 1 ? "s" : ""} already imported`
              : undefined;
            result = {
              file: file.name,
              type: "era",
              denials: processed.denials,
              skipped: processed.skipped,
              status: "success",
              message: eraMessage,
              claims: processed.claims,
            };
            break;
          }

          case "csv": {
            const content = await file.text();
            // Store original file
            let storageKey: string | undefined;
            try {
              const upload = await uploadFile(file, "csv/", file.name);
              storageKey = upload.key;
            } catch (e) {
              console.warn("Failed to store CSV file:", e);
            }
            const processed = await processCsvFile(content, user.practiceId, storageKey);
            // Compose the per-file message. Combine parser warnings with a
            // "N already imported" note when dedupe skipped anything.
            const csvParts: string[] = [];
            if (processed.warnings.length > 0) csvParts.push(...processed.warnings);
            if (processed.skipped > 0) {
              csvParts.push(
                processed.denials > 0
                  ? `${processed.skipped} row${processed.skipped !== 1 ? "s" : ""} already imported`
                  : `All ${processed.skipped} row${processed.skipped !== 1 ? "s" : ""} already imported`,
              );
            }
            result = {
              file: file.name,
              type: "csv",
              denials: processed.denials,
              skipped: processed.skipped,
              status: processed.warnings.length > 0 ? "partial" : "success",
              message: csvParts.length > 0 ? csvParts.join("; ") : undefined,
              claims: processed.claims,
            };
            break;
          }

          case "eob-pdf": {
            const bytes = await file.arrayBuffer();
            // Store original file
            let storageKey: string | undefined;
            try {
              const upload = await uploadFile(file, "eob/", file.name);
              storageKey = upload.key;
            } catch (e) {
              console.warn("Failed to store EOB file:", e);
            }
            const processed = await processEobPdf(bytes, file.name, user.practiceId, storageKey);
            result = {
              file: file.name,
              type: "eob-pdf",
              denials: processed.denials,
              skipped: 0,
              status: "success",
              claims: processed.claims,
            };
            break;
          }

          case "screenshot": {
            const bytes = await file.arrayBuffer();
            // Store original file
            let storageKey: string | undefined;
            try {
              const upload = await uploadFile(file, "screenshots/", file.name);
              storageKey = upload.key;
            } catch (e) {
              console.warn("Failed to store screenshot:", e);
            }
            const processed = await processScreenshot(bytes, file.name, user.practiceId, storageKey);
            result = {
              file: file.name,
              type: "screenshot",
              denials: processed.denials,
              skipped: 0,
              status: processed.denials > 0 ? "success" : "partial",
              message: processed.denials === 0 ? "No denial information detected in image" : undefined,
              claims: processed.claims,
            };
            break;
          }

          default:
            result = {
              file: file.name,
              type: "unknown",
              denials: 0,
              skipped: 0,
              status: "error",
              message: "Unsupported file type",
            };
            totalErrors++;
        }

        results.push(result);
        totalDenials += result.denials;
        totalSkipped += result.skipped;
      } catch (error) {
        console.error(`[upload] Error processing ${file.name}:`, error);
        results.push({
          file: file.name,
          type: "unknown",
          denials: 0,
          skipped: 0,
          status: "error",
          message: error instanceof Error ? error.message : "Processing failed",
        });
        totalErrors++;
      }
    }

    return {
      results,
      total: totalDenials,
      totalSkipped,
      errors: totalErrors,
    };
  },
);
