import Link from "next/link";
import { prisma } from "@overturn/db";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpsTriagePage() {
  const [failedSubs, failedRuns, overdueFollowups, skippedAppeals] = await Promise.all([
    prisma.submission.findMany({
      where: { status: "FAILED" },
      orderBy: { startedAt: "desc" },
      take: 25,
      include: {
        appeal: {
          include: {
            denial: {
              include: { claim: { include: { practice: true, payer: true } } },
            },
          },
        },
      },
    }),
    prisma.agentRun.findMany({
      where: { status: "FAILED" },
      orderBy: { startedAt: "desc" },
      take: 25,
    }),
    prisma.followUpCheck.findMany({
      where: { status: "PENDING", scheduledFor: { lt: new Date() } },
      orderBy: { scheduledFor: "asc" },
      take: 25,
      include: {
        appeal: { include: { denial: { include: { claim: { include: { payer: true } } } } } },
        practice: true,
      },
    }),
    prisma.appeal.findMany({
      where: { outcome: "SKIPPED" },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        denial: {
          include: { claim: { include: { practice: true, payer: true } } },
        },
        agentRun: true,
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Ops triage</h1>
        <p className="mt-1 text-sm text-gray-500">
          The queue of things that need a human eye — failed submissions,
          errored agent runs, overdue follow-ups, and skipped appeals worth
          a second look.
        </p>
      </div>

      <Section
        title={`Failed submissions (${failedSubs.length})`}
        empty="No failed submissions. The robots are eating well."
      >
        {failedSubs.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Practice</th>
                <th className="px-5 py-3 font-medium">Payer</th>
                <th className="px-5 py-3 font-medium">Channel</th>
                <th className="px-5 py-3 font-medium">Attempt</th>
                <th className="px-5 py-3 font-medium">Error</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {failedSubs.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/70">
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDateTime(s.startedAt)}</td>
                  <td className="px-5 py-3 text-gray-700">
                    <Link
                      href={`/admin/practices/${s.appeal.denial.claim.practiceId}`}
                      className="hover:underline"
                    >
                      {s.appeal.denial.claim.practice.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-700">{s.appeal.denial.claim.payer.name}</td>
                  <td className="px-5 py-3 text-gray-700">{s.channel}</td>
                  <td className="px-5 py-3 text-gray-700 tabular-nums">#{s.attemptNumber}</td>
                  <td className="px-5 py-3 text-xs text-error-700 max-w-md truncate">
                    {s.errorMessage ?? "(no detail)"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/appeals/${s.appealId}`}
                      className="text-xs text-brand-700 hover:underline"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={`Errored agent runs (${failedRuns.length})`}
        empty="No errored agent runs."
      >
        {failedRuns.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Workflow</th>
                <th className="px-5 py-3 font-medium">Resource</th>
                <th className="px-5 py-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {failedRuns.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDateTime(r.startedAt)}</td>
                  <td className="px-5 py-3 font-mono text-xs">{r.workflowType}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">{r.resourceId.slice(-12)}</td>
                  <td className="px-5 py-3 text-xs text-error-700 max-w-md truncate">
                    {r.errorMessage ?? "(no detail)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={`Overdue follow-ups (${overdueFollowups.length})`}
        empty="No follow-ups past due."
      >
        {overdueFollowups.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Scheduled</th>
                <th className="px-5 py-3 font-medium">Practice</th>
                <th className="px-5 py-3 font-medium">Payer</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overdueFollowups.map((f) => (
                <tr key={f.id}>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDateTime(f.scheduledFor)}</td>
                  <td className="px-5 py-3 text-gray-700">
                    <Link href={`/admin/practices/${f.practiceId}`} className="hover:underline">
                      {f.practice.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {f.appeal.denial.claim.payer.name}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/appeals/${f.appealId}`} className="text-xs text-brand-700 hover:underline">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={`Recent skipped appeals (${skippedAppeals.length})`}
        empty="No appeals skipped recently."
      >
        {skippedAppeals.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Practice</th>
                <th className="px-5 py-3 font-medium">Payer</th>
                <th className="px-5 py-3 font-medium">Reason</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {skippedAppeals.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDateTime(a.createdAt)}</td>
                  <td className="px-5 py-3 text-gray-700">
                    <Link href={`/admin/practices/${a.denial.claim.practiceId}`} className="hover:underline">
                      {a.denial.claim.practice.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-700">{a.denial.claim.payer.name}</td>
                  <td className="px-5 py-3 text-xs text-gray-600 max-w-md truncate">
                    {a.draftLetter.replace(/^\(skipped — /, "").replace(/\)$/, "").slice(0, 120)}
                    {a.draftLetter.length > 120 && "…"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/appeals/${a.id}`} className="text-xs text-brand-700 hover:underline">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.every((c) => !c));
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {isEmpty ? (
        <div className="card mt-3 p-6 text-center text-sm text-gray-500">{empty}</div>
      ) : (
        <div className="card mt-3 overflow-hidden">{children}</div>
      )}
    </section>
  );
}
