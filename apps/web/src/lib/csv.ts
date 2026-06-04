// Minimal RFC-4180 CSV serializer. Used for our report exports.
// Avoids adding a CSV library since we only need to write, never parse.

export function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  if (rows.length === 0) {
    return (headers ?? []).join(",") + "\n";
  }
  const cols = headers ?? Object.keys(rows[0]!);
  const escapeCell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s: string;
    if (v instanceof Date) s = v.toISOString();
    else if (typeof v === "object") s = JSON.stringify(v);
    else s = String(v);
    // Escape if needed
    if (/[",\n\r]/.test(s)) {
      s = `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [cols.join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => escapeCell(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

/**
 * CSV parsing utilities for claims import
 */

export interface ParsedClaim {
  claim_id: string;
  patient_id: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_dob: string;
  patient_member_id: string;
  payer_id: string;
  service_date: string;
  cpt_codes: string[];
  icd_codes: string[];
  billed_amount: string;
  denial_code: string;
  denial_reason: string;
  denied_amount: string;
  era_raw_text?: string;
}

export interface CSVParseResult {
  claims: ParsedClaim[];
  errors: string[];
}

export interface CSVValidationResult {
  valid: boolean;
  errors: string[];
}

const REQUIRED_COLUMNS = [
  "claim_id",
  "patient_id",
  "patient_first_name",
  "patient_last_name",
  "patient_dob",
  "patient_member_id",
  "payer_id",
  "service_date",
  "cpt_codes",
  "icd_codes",
  "billed_amount",
  "denial_code",
  "denial_reason",
  "denied_amount",
];

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
      } else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCSVLines(lines: string[]): { headers: string[]; rows: string[][] } {
  const filtered = lines.filter((l) => l.trim());
  if (filtered.length < 2) {
    return { headers: [], rows: [] };
  }
  const headers = splitCsvLine(filtered[0]!).map((h) => h.trim().toLowerCase().replace(/ /g, "_"));
  const rows = filtered.slice(1).map((line) => splitCsvLine(line));
  return { headers, rows };
}

function validateDate(value: string, fieldName: string): string[] {
  const errors: string[] = [];
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    errors.push(`Invalid date for ${fieldName}: "${value}"`);
  }
  return errors;
}

function validateAmount(value: string, fieldName: string): string[] {
  const errors: string[] = [];
  const num = parseFloat(value);
  if (isNaN(num)) {
    errors.push(`Invalid amount for ${fieldName}: "${value}"`);
  }
  return errors;
}

export function parseClaimsCSV(csv: string): CSVParseResult {
  const result: CSVParseResult = { claims: [], errors: [] };
  const lines = csv.split(/\r?\n/);
  const { headers, rows } = parseCSVLines(lines);

  if (headers.length === 0) {
    result.errors.push("empty file");
    return result;
  }

  const claimIds = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = row[idx] ?? ""));

    const lineNumber = i + 2; // +1 for 0-index, +1 for header

    // Check for duplicate claim IDs
    const claimId = obj.claim_id || "";
    if (claimId) {
      if (claimIds.has(claimId)) {
        result.errors.push(`Duplicate claim_id "${claimId}" at line ${lineNumber}`);
        continue;
      }
      claimIds.add(claimId);
    }

    // Only validate if the field is present and non-empty
    if (obj.patient_dob) {
      const dateErrors = validateDate(obj.patient_dob, "patient_dob");
      if (dateErrors.length > 0) {
        result.errors.push(...dateErrors);
        continue;
      }
    }

    if (obj.service_date) {
      const dateErrors = validateDate(obj.service_date, "service_date");
      if (dateErrors.length > 0) {
        result.errors.push(...dateErrors);
        continue;
      }
    }

    if (obj.billed_amount) {
      const amountErrors = validateAmount(obj.billed_amount, "billed_amount");
      if (amountErrors.length > 0) {
        result.errors.push(...amountErrors);
        continue;
      }
    }

    if (obj.denied_amount) {
      const amountErrors = validateAmount(obj.denied_amount, "denied_amount");
      if (amountErrors.length > 0) {
        result.errors.push(...amountErrors);
        continue;
      }
    }

    result.claims.push({
      claim_id: obj.claim_id || "",
      patient_id: obj.patient_id || "",
      patient_first_name: obj.patient_first_name || "",
      patient_last_name: obj.patient_last_name || "",
      patient_dob: obj.patient_dob || "",
      patient_member_id: obj.patient_member_id || "",
      payer_id: obj.payer_id || "",
      service_date: obj.service_date || "",
      cpt_codes: (obj.cpt_codes || "").split("|").filter(Boolean),
      icd_codes: (obj.icd_codes || "").split("|").filter(Boolean),
      billed_amount: obj.billed_amount || "",
      denial_code: obj.denial_code || "",
      denial_reason: obj.denial_reason || "",
      denied_amount: obj.denied_amount || "",
      era_raw_text: obj.era_raw_text || "",
    });
  }

  return result;
}

export function generateAppealsCSV(appeals: Array<{
  appeal_id: string;
  denial_id: string;
  submitted_via: string;
  submitted_at: string;
  outcome: string;
  recovered_amount: number;
  our_fee: number;
  confirmation_number: string;
}>): string {
  if (appeals.length === 0) {
    return "appeal_id,denial_id,submitted_via,submitted_at,outcome,recovered_amount,our_fee,confirmation_number\n";
  }

  const headers = ["appeal_id", "denial_id", "submitted_via", "submitted_at", "outcome", "recovered_amount", "our_fee", "confirmation_number"];
  const rows = appeals.map((a) => [
    a.appeal_id,
    a.denial_id,
    a.submitted_via,
    a.submitted_at,
    a.outcome,
    a.recovered_amount.toFixed(2),
    a.our_fee.toFixed(2),
    a.confirmation_number,
  ]);

  let csv = headers.join(",") + "\n";
  for (const row of rows) {
    csv += row.join(",") + "\n";
  }
  return csv;
}

export function validateCSVFormat(csv: string): CSVValidationResult {
  const result: CSVValidationResult = { valid: true, errors: [] };

  if (!csv || csv.trim().length === 0) {
    result.valid = false;
    result.errors.push("Empty file");
    return result;
  }

  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 1) {
    result.valid = false;
    result.errors.push("No data found");
    return result;
  }

  const firstLine = lines[0]!;
  if (!firstLine.includes(",")) {
    result.valid = false;
    result.errors.push("Not a valid CSV file - missing comma delimiter");
  }

  return result;
}
