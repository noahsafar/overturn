// Smart CSV parsing with column auto-detection and fuzzy matching.
//
// Makes CSV uploads "just work" regardless of column names or order.
// Handles various billing export formats from different systems.

import { encryptPhi } from "@overturn/db";

type ColumnMapping = {
  [key: string]: string; // normalized -> actual column name
};

// Column name patterns for fuzzy matching
const COLUMN_PATTERNS = {
  external_patient_id: [
    "patient id",
    "patientid",
    "external patient id",
    "external_patient_id",
    "patient id (external)",
    "patient identifier",
    "patientidentifier",
    "pt id",
    "ptid",
    "account",
    "account number",
    "accountnumber",
    "medical record",
    "mrn",
  ],
  first_name: [
    "first name",
    "firstname",
    "first",
    "patient first",
    "given name",
    "givenname",
  ],
  last_name: [
    "last name",
    "lastname",
    "last",
    "patient last",
    "family name",
    "familyname",
    "surname",
  ],
  // Combined "Last, First" or "First Last" — only used when separate first/last
  // columns aren't present. Split happens at row-processing time.
  patient_name: [
    "patient name",
    "patientname",
    "pt name",
    "ptname",
    "full name",
    "fullname",
  ],
  dob: [
    "dob",
    "date of birth",
    "birthdate",
    "birth date",
    "born",
  ],
  member_id: [
    "member id",
    "memberid",
    "member",
    "insurance id",
    "insuranceid",
    "subscriber id",
    "subscriberid",
    "member number",
    "membernumber",
  ],
  payer_id: [
    "payer id",
    "payerid",
    "payer",
    "insurance",
    "insurance company",
    "plan",
    "payer name",
    "payername",
  ],
  service_date: [
    "service date",
    "servicedate",
    "date of service",
    "dos",
    "service",
    "claim date",
    "claimdate",
  ],
  cpt: [
    "cpt",
    "cpt code",
    "cptcode",
    "hcpcs",
    "procedure",
    "procedure code",
    "procedurecode",
  ],
  icd: [
    "icd",
    "icd code",
    "icdcode",
    "diagnosis",
    "diagnosis code",
    "diagnosiscode",
    "dx",
  ],
  billed_amount: [
    "billed amount",
    "billedamount",
    "billed",
    "charge amount",
    "chargeamount",
    "charge",
    "chg",
    "amount billed",
    "amountbilled",
    "submitted amount",
    "submittedamount",
  ],
  allowed_amount: [
    "allowed",
    "allowed amount",
    "allowedamount",
    "approved amount",
    "approvedamount",
    "contract amount",
    "contracted amount",
  ],
  submitted_at: [
    "submitted date",
    "submitteddate",
    "submission date",
    "submissiondate",
    "date submitted",
    "claim submitted",
  ],
  denial_code: [
    "denial code",
    "denialcode",
    "carc",
    "reason code",
    "reasoncode",
    "adjustment code",
    "adjustmentcode",
    "adjustment reason code",
    "adjustmentreasoncode",
    "rxn code",
    "rxncode",
    "rxn",
  ],
  denial_reason: [
    "denial reason",
    "denialreason",
    "reason",
    "explanation",
    "denial explanation",
    "adjustment reason",
    "adjustmentreason",
  ],
  denied_amount: [
    "denied amount",
    "deniedamount",
    "denial amount",
    "denialamount",
    "adjustment amount",
    "adjustmentamount",
    "amount denied",
    "den amt",
    "denamt",
    "non-covered",
    "non covered",
  ],
  era_raw: [
    "era raw",
    "eraraw",
    "era",
    "remittance",
    "raw text",
    "rawtext",
  ],
  received_at: [
    "received date",
    "receiveddate",
    "denial date",
    "denialdate",
    "date received",
    "payment date",
    "paymentdate",
  ],
};

function normalizeColumnName(name: string): string {
  // Strip non-alphanumerics so "Patient ID#", "patient_id", "Patient-ID"
  // all collapse to "patientid".
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

interface FieldCandidate {
  field: string;
  score: number;
}

/**
 * Score how well a header maps to each declared field. Returns the best
 * candidate (highest score) or null when no pattern matches.
 *
 * Scoring rules (rough):
 *   1000  — exact normalized match (header === pattern)
 *   100+  — header contains the pattern (header is more specific, e.g.
 *           "Patient First Name" contains "first name"); bonus for longer
 *           overlap so longer/more-specific patterns beat short generic ones.
 *    50+  — pattern contains the header (header is shorter abbreviation,
 *           e.g. "Ins" is contained by "insurance"); penalty grows with the
 *           length gap, so "Ins" prefers "insurance" over "insurance id".
 *
 * Two-tier scoring (1000/100/50) means exact wins over containment, and
 * specific-header wins over abbreviation, which is what humans expect.
 */
function scoreHeader(header: string): FieldCandidate | null {
  const normalized = normalizeColumnName(header);
  if (!normalized) return null;
  let best: FieldCandidate | null = null;

  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (const pattern of patterns) {
      const pn = normalizeColumnName(pattern);
      if (!pn) continue;

      let score: number;
      if (normalized === pn) {
        score = 1000;
      } else if (normalized.includes(pn)) {
        // Header is longer than pattern; reward longer patterns more.
        score = 100 + pn.length;
      } else if (pn.includes(normalized)) {
        // Header is an abbreviation of the pattern; penalize big gaps so
        // short headers prefer their closest pattern.
        const gap = pn.length - normalized.length;
        score = 50 + normalized.length - Math.max(0, gap - 4);
      } else {
        continue;
      }

      if (!best || score > best.score) {
        best = { field, score };
      }
    }
  }

  return best;
}

function detectColumnMapping(headers: string[]): ColumnMapping {
  // Step 1: rank every (header → field) candidate.
  type Edge = { header: string; field: string; score: number };
  const edges: Edge[] = [];
  for (const header of headers) {
    const best = scoreHeader(header);
    if (best) edges.push({ header, field: best.field, score: best.score });
  }

  // Step 2: greedy global assignment — best scores claim their field first.
  // This stops "Ins" from grabbing member_id (score 53) when "Insurance ID"
  // is also on the row with a higher score (1000) for the same field.
  edges.sort((a, b) => b.score - a.score);
  const mapping: ColumnMapping = {};
  const usedFields = new Set<string>();
  const usedHeaders = new Set<string>();
  for (const e of edges) {
    if (usedFields.has(e.field) || usedHeaders.has(e.header)) continue;
    mapping[e.field] = e.header;
    usedFields.add(e.field);
    usedHeaders.add(e.header);
  }

  return mapping;
}

interface ParsedRow {
  [key: string]: string;
}

interface SmartParseResult {
  rows: ParsedRow[];
  mapping: ColumnMapping;
  confidence: number;
  warnings: string[];
}

export function smartParseCsv(csvContent: string): SmartParseResult {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    return { rows: [], mapping: {}, confidence: 0, warnings: ["No data found"] };
  }

  // Detect delimiter
  const firstLine = lines[0]!;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;

  let delimiter = ",";
  if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = "\t";
  } else if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ";";
  }

  // Parse headers
  const headers = splitCsvLine(lines[0]!, delimiter);
  const mapping = detectColumnMapping(headers);

  // Calculate confidence based on critical fields found
  const criticalFields = ["denial_code", "denial_reason", "service_date"];
  const foundCritical = criticalFields.filter((f) => mapping[f]).length;
  const confidence = foundCritical / criticalFields.length;

  const warnings: string[] = [];
  if (!mapping.denial_code) {
    warnings.push("Could not find denial code column - denials may not be created properly");
  }
  if (!mapping.service_date) {
    warnings.push("Could not find service date column - using current date");
  }
  if (!mapping.payer_id) {
    warnings.push("Could not find payer/insurance column - will use default payer");
  }

  // Parse data rows
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!, delimiter);
    const row: ParsedRow = {};

    for (const [field, headerName] of Object.entries(mapping)) {
      const headerIndex = headers.indexOf(headerName);
      if (headerIndex >= 0 && headerIndex < cells.length) {
        row[field] = cells[headerIndex] ?? "";
      }
    }

    // Skip empty rows
    if (Object.values(row).some((v) => v.trim())) {
      rows.push(row);
    }
  }

  return {
    rows,
    mapping,
    confidence,
    warnings,
  };
}

function splitCsvLine(line: string, delimiter: string = ","): string[] {
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
      if (c === delimiter) {
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

export function generatePreview(rows: ParsedRow[], maxRows: number = 5): any[] {
  return rows.slice(0, maxRows).map((row) => ({
    ...row,
    _preview: true,
  }));
}
