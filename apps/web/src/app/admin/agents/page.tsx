import { prisma } from "@overturn/db";
import { fmtDateTime, fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [recentRuns, agg, byWorkflow] = await Promise.all([
    prisma.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
    prisma.agentRun.aggregate({
      _count: { _all: true },
      _avg: { confidenceScore: true },
      _sum: { costCents: true },
    }),
    prisma.agentRun.groupBy({
      by: ["workflowType", "status"],
      _count: { _all: true },
    }),
  ]);

  const byWf: Record<string, Record<string, number>> = {};
  for (const r of byWorkflow) {
    const bucket = byWf[r.workflowType] ?? (byWf[r.workflowType] = {});
    bucket[r.status] = r._count._all;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Agent runs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every LLM / browser / voice run across the fleet. Confidence scores
          and costs are tracked per call.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Total runs" value={String(agg._count._all)} />
        <Stat
          label="Avg confidence"
          value={agg._avg.confidenceScore !== null ? agg._avg.confidenceScore.toFixed(2) : "—"}
        />
        <Stat label="Total LLM spend" value={fmtMoney((agg._sum.costCents ?? 0) / 100)} />
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">By workflow type</h2>
        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Workflow</th>
                <th className="px-5 py-3 text-right font-medium">Success</th>
                <th className="px-5 py-3 text-right font-medium">Failed</th>
                <th className="px-5 py-3 text-right font-medium">Requires human</th>
                <th className="px-5 py-3 text-right font-medium">Running</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(byWf).map(([wf, counts]) => (
                <tr key={wf}>
                  <td className="px-5 py-3 font-mono text-xs">{wf}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{counts.SUCCESS ?? 0}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-error-700">
                    {counts.FAILED ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-warning-700">
                    {counts.REQUIRES_HUMAN ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{counts.RUNNING ?? 0}</td>
                </tr>
              ))}
              {Object.keys(byWf).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-gray-500">
                    No runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Recent runs</h2>
        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Workflow</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Confidence</th>
                <th className="px-5 py-3 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentRuns.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDateTime(r.startedAt)}</td>
                  <td className="px-5 py-3 font-mono text-xs">{r.workflowType}</td>
                  <td className="px-5 py-3 text-gray-700">{r.agentType}</td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        r.status === "SUCCESS"
                          ? "badge bg-success-50 text-success-700"
                          : r.status === "FAILED"
                            ? "badge bg-error-50 text-error-700"
                            : r.status === "REQUIRES_HUMAN"
                              ? "badge bg-warning-50 text-warning-700"
                              : "badge bg-gray-100 text-gray-700"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {r.confidenceScore !== null ? r.confidenceScore.toFixed(2) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {r.costCents !== null ? fmtMoney((r.costCents ?? 0) / 100) : "—"}
                  </td>
                </tr>
              ))}
              {recentRuns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-sm text-gray-500">
                    No runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}
