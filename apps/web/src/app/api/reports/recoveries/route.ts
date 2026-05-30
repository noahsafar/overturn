// GET /api/reports/recoveries — CSV export of recovered appeals.
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";
import { toCsv, csvResponse } from "@/lib/csv";
import { decryptPatient } from "@/lib/patient";

export const GET = apiHandler(
  {
    requiredRole: "ADMIN",
    audit: { action: "report.recoveries", resourceType: "report" },
  },
  async ({ user }) => {
    const appeals = await prisma.appeal.findMany({
      where: {
        denial: { claim: { practiceId: user.practiceId } },
        outcome: { in: ["WON", "PARTIAL", "LOST"] },
      },
      orderBy: { outcomeRecordedAt: "desc" },
      include: {
        denial: { include: { claim: { include: { payer: true, patient: true } } } },
      },
    });
    const rows = appeals.map((a) => {
      const pt = decryptPatient(a.denial.claim.patient);
      return {
        appeal_id: a.id,
        outcome: a.outcome,
        outcome_recorded_at: a.outcomeRecordedAt,
        claim_id: a.denial.claim.id,
        claim_control_number: a.denial.claim.controlNumber,
        payer: a.denial.claim.payer.name,
        patient_external_id: a.denial.claim.patient.externalId,
        patient_name: `${pt.firstName} ${pt.lastName}`,
        service_date: a.denial.claim.serviceDate,
        billed_amount: a.denial.claim.billedAmount,
        denied_amount: a.denial.deniedAmount,
        recovered_amount: a.recoveredAmount,
        our_fee: a.ourFee,
        submitted_at: a.submittedAt,
        submitted_via: a.submittedVia,
      };
    });
    return csvResponse(toCsv(rows), "recoveries.csv");
  },
);
