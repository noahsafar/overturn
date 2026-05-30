import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

export default async function PracticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const practice = await prisma.practice.findUnique({
    where: { id },
    include: {
      users: true,
      invoices: { orderBy: { periodStart: "desc" }, take: 12 },
      payerCredentials: { include: { payer: true } },
    },
  });
  if (!practice) notFound();

  const [appeals, recovery, denialCount, recentAgentRuns] = await Promise.all([
    prisma.appeal.findMany({
      where: { denial: { claim: { practiceId: id } } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        denial: { include: { claim: { include: { payer: true } } } },
      },
    }),
    prisma.appeal.aggregate({
      where: {
        denial: { claim: { practiceId: id } },
        outcome: { in: ["WON", "PARTIAL"] },
      },
      _sum: { recoveredAmount: true, ourFee: true },
      _count: { _all: true },
    }),
    prisma.denial.count({
      where: { claim: { practiceId: id }, appeals: { none: {} } },
    }),
    prisma.agentRun.findMany({
      where: {
        appeals: { some: { denial: { claim: { practiceId: id } } } },
      },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/practices"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to practices
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
          {practice.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500 font-mono">
          {practice.id} · NPI {practice.npi} · {practice.specialty}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Stat label="Recovered" value={fmtMoney(Number(recovery._sum.recoveredAmount ?? 0))} />
        <Stat label="Our fees" value={fmtMoney(Number(recovery._sum.ourFee ?? 0))} />
        <Stat label="Wins" value={String(recovery._count._all)} />
        <Stat label="Unworked denials" value={String(denialCount)} />
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Billing</h2>
        <div className="card mt-3 p-5 space-y-2 text-sm">
          <Row k="Billing email" v={practice.billingEmail ?? "—"} />
          <Row k="Recovery fee" v={`${(practice.recoveryFeeBps / 100).toFixed(1)}%`} />
          <Row k="Stripe customer" v={practice.stripeCustomerId ?? "—"} mono />
          <Row k="Onboarded" v={practice.onboardingCompletedAt ? fmtDateTime(practice.onboardingCompletedAt) : "—"} />
          <Row k="Clearinghouse SFTP" v={practice.clearinghouseSftpHost ?? "—"} mono />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Members ({practice.users.length})</h2>
        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {practice.users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3">{u.email}</td>
                  <td className="px-5 py-3 text-gray-600">{u.name ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-600">{u.role}</td>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Recent appeals</h2>
        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Payer</th>
                <th className="px-5 py-3 font-medium">Denial</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Outcome</th>
                <th className="px-5 py-3 text-right font-medium">Recovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {appeals.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/70">
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDate(a.createdAt)}</td>
                  <td className="px-5 py-3 text-gray-700">{a.denial.claim.payer.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">{a.denial.denialCode}</td>
                  <td className="px-5 py-3 text-gray-600">{a.status}</td>
                  <td className="px-5 py-3 text-gray-700">{a.outcome}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {a.recoveredAmount ? fmtMoney(a.recoveredAmount as unknown as number) : "—"}
                  </td>
                </tr>
              ))}
              {appeals.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-sm text-gray-500">
                    No appeals yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Recent agent runs</h2>
        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Workflow</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Confidence</th>
                <th className="px-5 py-3 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentAgentRuns.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDateTime(r.startedAt)}</td>
                  <td className="px-5 py-3 font-mono text-xs">{r.workflowType}</td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        r.status === "SUCCESS"
                          ? "badge bg-success-50 text-success-700"
                          : r.status === "FAILED"
                            ? "badge bg-error-50 text-error-700"
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
              {recentAgentRuns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-gray-500">
                    No agent runs.
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
      <div className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
    </div>
  );
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-gray-500">{k}</dt>
      <dd className={`text-gray-900 ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}
