import Link from "next/link";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { decryptPatient } from "@/lib/patient";
import { fmtMoney, fmtName } from "@/lib/format";
import { groupDenials } from "@/lib/denial-grouping";
import { scoreDenial } from "@/lib/denial-priority";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { DenialsExplorer, type DenialRow, type DenialOutcome } from "./DenialsExplorer";
import { BulkStartButton } from "./BulkStartButton";

export const dynamic = "force-dynamic";

function daysUntil(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
}

export default async function DenialsPage() {
  const user = await requireUser();
  const denials = await prisma.denial.findMany({
    where: { claim: { practiceId: user.practiceId } },
    orderBy: { receivedAt: "desc" },
    include: {
      claim: { include: { patient: true, payer: true } },
      appeals: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 500,
  });

  // Lazy backfill: any denial created before priority scoring was wired
  // (seeded data, legacy uploads) will have NULL priority fields. Score
  // them now and persist in one batch so the column is populated for
  // future loads and the analytics page can rely on it.
  const unscored = denials.filter((d) => d.priorityScore == null);
  if (unscored.length > 0) {
    await Promise.all(
      unscored.map(async (d) => {
        const r = scoreDenial({
          denialCode: d.denialCode,
          deniedAmount: Number(d.deniedAmount),
          filingDeadline: d.filingDeadline,
        });
        // Patch the in-memory object so the current render sees the score.
        d.predictedWinProb = r.predictedWinProb;
        d.priorityScore = r.priorityScore;
        d.priorityTier = r.priorityTier;
        await prisma.denial.update({
          where: { id: d.id },
          data: {
            predictedWinProb: r.predictedWinProb,
            priorityScore: r.priorityScore,
            priorityTier: r.priorityTier,
            scoreExplain: r.scoreExplain as unknown as object,
          },
        });
      }),
    );
  }

  const groups = groupDenials(denials);

  const counts = {
    P1: groups.filter((g) => g.priorityTier === "P1").length,
    P2: groups.filter((g) => g.priorityTier === "P2").length,
    P3: groups.filter((g) => g.priorityTier === "P3").length,
  };
  const unworkedExpected = groups
    .filter((g) => !g.lead.appeals?.[0])
    .reduce((sum, g) => sum + g.totalDenied * (g.predictedWinProb ?? 0), 0);

  // Decrypt PHI and flatten to primitives on the server, then hand the client
  // explorer plain data so search/filter runs without shipping the crypto.
  const rows: DenialRow[] = groups.map((g) => {
    const pt = decryptPatient(g.lead.claim.patient);
    const appeal = g.lead.appeals?.[0];
    return {
      id: g.lead.id,
      patientName: fmtName(`${pt.firstName} ${pt.lastName}`).trim(),
      payer: g.lead.claim.payer.name,
      code: g.lead.denialCode,
      cpts: g.affectedCpts,
      count: g.count,
      totalDenied: g.totalDenied,
      winPct: g.predictedWinProb != null ? Math.round(g.predictedWinProb * 100) : null,
      deadlineDays: daysUntil(g.lead.filingDeadline),
      outcome: (appeal?.outcome as DenialOutcome | undefined) ?? null,
      confidencePct:
        appeal?.confidenceScore != null ? Math.round(appeal.confidenceScore * 100) : null,
      tier: g.priorityTier,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Denials</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sorted by expected recovery × urgency. Work P1 first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BulkStartButton
            unworkedCount={
              rows.filter(
                (r) => r.outcome === null && (r.deadlineDays == null || r.deadlineDays >= 0),
              ).length
            }
          />
          <Link href="/upload" className="btn-secondary">
            <ArrowUpTrayIcon className="h-4 w-4" />
            Upload Denied Claims
          </Link>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">P1 · Work first</div>
            <div className="mt-1 text-2xl font-semibold text-error-700">{counts.P1}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">P2</div>
            <div className="mt-1 text-2xl font-semibold text-warning-700">{counts.P2}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">P3</div>
            <div className="mt-1 text-2xl font-semibold text-gray-700">{counts.P3}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Expected recovery</div>
            <div className="mt-1 text-2xl font-semibold text-success-700">{fmtMoney(unworkedExpected)}</div>
            <div className="mt-0.5 text-xs text-gray-500">if you work all unappealed</div>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-gray-500">No denials yet.</p>
          <Link href="/upload" className="btn-primary">
            <ArrowUpTrayIcon className="h-4 w-4" />
            Upload your first denials
          </Link>
        </div>
      ) : (
        <DenialsExplorer rows={rows} />
      )}
    </div>
  );
}
