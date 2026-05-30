// GET /api/reports/outstanding — CSV export of submitted-but-pending appeals.
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";
import { toCsv, csvResponse } from "@/lib/csv";
import { decryptPatient } from "@/lib/patient";

export const GET = apiHandler(
  {
    requiredRole: "ADMIN",
    audit: { action: "report.outstanding", resourceType: "report" },
  },
  async ({ user }) => {
    const appeals = await prisma.appeal.findMany({
      where: {
        denial: { claim: { practiceId: user.practiceId } },
        outcome: { in: ["PENDING", "SUBMITTED"] },
        submittedAt: { not: null },
      },
      orderBy: { submittedAt: "asc" },
      include: {
        denial: { include: { claim: { include: { payer: true, patient: true } } } },
      },
    });
    const rows = appeals.map((a) => {
      const pt = decryptPatient(a.denial.claim.patient);
      return {
        appeal_id: a.id,
        claim_id: a.denial.claim.id,
        claim_control_number: a.denial.claim.controlNumber,
        payer: a.denial.claim.payer.name,
        patient_name: `${pt.firstName} ${pt.lastName}`,
        service_date: a.denial.claim.serviceDate,
        denied_amount: a.denial.deniedAmount,
        submitted_at: a.submittedAt,
        submitted_via: a.submittedVia,
        days_outstanding: a.submittedAt
          ? Math.floor((Date.now() - a.submittedAt.getTime()) / 86_400_000)
          : null,
      };
    });
    return csvResponse(toCsv(rows), "outstanding-appeals.csv");
  },
);
