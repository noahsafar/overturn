// POST /api/claims/upload
//
// Accepts a CSV body (header row required) and creates Patient / Claim /
// Denial rows for the authenticated practice. This is the manual-CSV path
// per the spec's Week-3 milestone; the production path consumes 835 EDI
// remittances via clearinghouse webhooks.

import { NextResponse, type NextRequest } from "next/server";
import { prisma, encryptPhi } from "@overturn/db";
import { requireUser } from "@/lib/auth";

interface Row {
  external_patient_id: string;
  first_name: string;
  last_name: string;
  dob: string;
  member_id: string;
  payer_id: string;
  service_date: string;
  cpt: string;
  icd: string;
  billed_amount: string;
  submitted_at: string;
  denial_code: string;
  denial_reason: string;
  denied_amount: string;
  era_raw: string;
  received_at: string;
}

function parseCsv(body: string): Row[] {
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj as unknown as Row;
  });
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV split that handles double-quoted fields. Adequate for our
  // simple ingest path; production replaces this with a real 835 parser.
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const body = await req.text();
  const rows = parseCsv(body);
  if (rows.length === 0) return new NextResponse("no rows parsed", { status: 400 });

  let created = 0;
  for (const r of rows) {
    const payer = await prisma.payer.findUnique({ where: { id: r.payer_id } });
    if (!payer) {
      return new NextResponse(`unknown payer_id: ${r.payer_id}`, { status: 400 });
    }

    const patient = await prisma.patient.upsert({
      where: {
        practiceId_externalId: {
          practiceId: user.practiceId,
          externalId: r.external_patient_id,
        },
      },
      update: { insurancePayerId: payer.id },
      create: {
        practiceId: user.practiceId,
        externalId: r.external_patient_id,
        firstNameEnc: encryptPhi(r.first_name),
        lastNameEnc: encryptPhi(r.last_name),
        dobEnc: encryptPhi(r.dob),
        memberIdEnc: encryptPhi(r.member_id),
        insurancePayerId: payer.id,
      },
    });

    const claim = await prisma.claim.create({
      data: {
        practiceId: user.practiceId,
        patientId: patient.id,
        payerId: payer.id,
        serviceDate: new Date(r.service_date),
        cptCodes: r.cpt.split(/\s+/).filter(Boolean),
        icdCodes: r.icd.split(/\s+/).filter(Boolean),
        billedAmount: r.billed_amount,
        status: "DENIED",
        submittedAt: new Date(r.submitted_at),
      },
    });

    await prisma.denial.create({
      data: {
        claimId: claim.id,
        denialCode: r.denial_code,
        denialReason: r.denial_reason,
        deniedAmount: r.denied_amount,
        eraRawText: r.era_raw,
        receivedAt: new Date(r.received_at),
      },
    });

    created++;
  }

  return NextResponse.json({ created });
}
