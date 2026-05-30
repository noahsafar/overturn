import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { deadlineState } from "@/lib/deadlines";
import { ReviewControls } from "./ReviewControls";
import { AppealProgressClient } from "./AppealProgressClient";
import { ClockIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

export default async function AppealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const appeal = await prisma.appeal.findFirst({
    where: { id, denial: { claim: { practiceId: user.practiceId } } },
    include: {
      denial: { include: { claim: { include: { payer: true } } } },
      agentRun: true,
      humanReview: true,
      submissions: { orderBy: { startedAt: "desc" } },
    },
  });
  if (!appeal) notFound();

  const dl = deadlineState(appeal.denial.filingDeadline);

  const auditEvents = await prisma.auditEvent.findMany({
    where: { practiceId: user.practiceId, resourceType: "appeal", resourceId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { email: true } } },
  });

  const citations = (appeal.citations as Array<{ policyId: string; quote: string; sourceUrl?: string }>) ?? [];

  const isDrafting = !["READY", "FAILED", "SKIPPED"].includes(appeal.status);

  return (
    <div className="space-y-6">
      <Link href={`/denials/${appeal.denialId}`} className="text-sm text-brand-700 hover:underline">← Back to denial</Link>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-brand-900">Appeal</h1>
        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">{appeal.outcome}</span>
      </div>

      {/* Show progress if appeal is still being drafted */}
      {isDrafting && (
        <AppealProgressClient appealId={appeal.id} initialStatus={appeal.status} />
      )}

      {!isDrafting && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <Card title="Payer">{appeal.denial.claim.payer.name}</Card>
            <Card title="Template">{appeal.templateUsed || "—"}</Card>
            <Card title="Denied amount">{fmtMoney(appeal.denial.deniedAmount as unknown as number)}</Card>
          </div>

          <section>
            <h2 className="font-semibold text-brand-900 mb-2">Draft letter</h2>
            {appeal.draftLetter ? (
              <pre className="bg-white border border-gray-200 rounded p-4 whitespace-pre-wrap text-sm leading-relaxed">{appeal.draftLetter}</pre>
            ) : (
              <p className="text-sm text-gray-500">No draft letter available.</p>
            )}
          </section>

          <section>
            <h2 className="font-semibold text-brand-900 mb-2">Citations ({citations.length})</h2>
            {citations.length === 0 ? (
              <p className="text-sm text-gray-500">No citations.</p>
            ) : (
              <ul className="space-y-2">
                {citations.map((c, i) => (
                  <li key={i} className="bg-white border border-gray-200 rounded p-3 text-sm">
                    <div className="font-mono text-xs text-gray-500">{c.policyId}</div>
                    <div className="italic mt-1">"{c.quote}"</div>
                    {c.sourceUrl && (
                      <a href={c.sourceUrl} target="_blank" rel="noopener" className="text-brand-700 text-xs hover:underline">
                        {c.sourceUrl} →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {appeal.agentRun && (
            <section>
              <h2 className="font-semibold text-brand-900 mb-2">Agent run</h2>
              <div className="bg-white border border-gray-200 rounded p-3 text-sm space-y-1">
                <Row k="Status" v={appeal.agentRun.status} />
                <Row k="Confidence" v={appeal.agentRun.confidenceScore?.toFixed(2) ?? "—"} />
                <Row k="Cost" v={`${((appeal.agentRun.costCents ?? 0) / 100).toFixed(2)} USD`} />
                <Row k="Started" v={fmtDateTime(appeal.agentRun.startedAt)} />
                {appeal.agentRun.completedAt && <Row k="Completed" v={fmtDateTime(appeal.agentRun.completedAt)} />}
              </div>
            </section>
          )}

          {appeal.agentRun && appeal.agentRun.confidenceScore !== null && appeal.agentRun.confidenceScore < 0.5 && (
            <section className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-semibold text-yellow-900">Low confidence appeal</h3>
                  <p className="text-yellow-800 mt-1">
                    This appeal has a {(appeal.agentRun.confidenceScore * 100).toFixed(0)}% predicted win probability.
                    Consider strengthening the case before submitting.
                  </p>
                </div>
              </div>
            </section>
          )}

          {dl && (
            <section
              className={`rounded p-3 text-sm flex items-center gap-2 ${
                dl.pastDue
                  ? "bg-error-50 text-error-800 border border-error-200"
                  : dl.warn
                    ? "bg-warning-50 text-warning-800 border border-warning-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200"
              }`}
            >
              <ClockIcon className="h-4 w-4" />
              {dl.pastDue ? (
                <span>
                  <strong>Filing deadline passed</strong> {Math.abs(dl.daysRemaining)} day(s)
                  ago. Submission will be refused.
                </span>
              ) : (
                <span>
                  {dl.daysRemaining} day(s) until filing deadline ({dl.deadline.toLocaleDateString()}).
                </span>
              )}
            </section>
          )}

          {appeal.outcome === "PENDING" && !appeal.submittedAt && appeal.draftLetter && !dl?.pastDue && (
            <ReviewControls appealId={appeal.id} initialLetter={appeal.draftLetter} />
          )}

          {appeal.submittedAt && (
            <section className="bg-green-50 border border-green-200 rounded p-4 text-sm">
              Submitted {fmtDateTime(appeal.submittedAt)} via {appeal.submittedVia}.
            </section>
          )}

          {appeal.submissions.length > 0 && (
            <section>
              <h2 className="font-semibold text-brand-900 mb-2">Submission history</h2>
              <ul className="space-y-2">
                {appeal.submissions.map((sub) => (
                  <li
                    key={sub.id}
                    className="bg-white border border-gray-200 rounded p-3 text-sm space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-gray-500">#{sub.attemptNumber}</span>
                        <span className="ml-2 font-medium text-gray-900">{sub.channel}</span>
                        <span
                          className={`ml-2 inline-block px-2 py-0.5 rounded text-xs ${
                            sub.status === "SUCCESS"
                              ? "bg-success-50 text-success-700"
                              : sub.status === "FAILED"
                                ? "bg-error-50 text-error-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {fmtDateTime(sub.startedAt)}
                      </span>
                    </div>
                    {sub.confirmationNumber && (
                      <div className="text-xs text-gray-600">
                        Confirmation: <span className="font-mono">{sub.confirmationNumber}</span>
                      </div>
                    )}
                    {sub.providerRef && (
                      <div className="text-xs text-gray-500">
                        Provider ref: <span className="font-mono">{sub.providerRef}</span>
                      </div>
                    )}
                    {sub.errorMessage && (
                      <div className="text-xs text-error-700">{sub.errorMessage}</div>
                    )}
                    {sub.screenshots && Array.isArray(sub.screenshots) && sub.screenshots.length > 0 && (
                      <div className="text-xs text-gray-500">
                        {sub.screenshots.length} artifact(s) captured
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {auditEvents.length > 0 && (
            <section>
              <h2 className="font-semibold text-brand-900 mb-2">Activity</h2>
              <ul className="space-y-1 text-xs">
                {auditEvents.map((e) => (
                  <li key={e.id} className="flex justify-between text-gray-600 py-1 border-b border-gray-100 last:border-b-0">
                    <span>
                      <code className="font-mono text-gray-800">{e.action}</code>
                      {e.user?.email && <span className="ml-2 text-gray-500">by {e.user.email}</span>}
                    </span>
                    <span className="tabular-nums text-gray-400">{fmtDateTime(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="font-medium mt-1">{children}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between"><span className="text-gray-500">{k}</span><span>{v}</span></div>
  );
}
