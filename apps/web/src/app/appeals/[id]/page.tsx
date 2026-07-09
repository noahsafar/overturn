import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtMoney, fmtDateTime, fmtName } from "@/lib/format";
import { decryptPatient } from "@/lib/patient";
import { deadlineState } from "@/lib/deadlines";
import { ReviewProvider, ReviewEditor, ReviewActions } from "./ReviewControls";
import { AppealProgressClient } from "./AppealProgressClient";
import {
  ClockIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

// Outcome badge tones — matches the denials list so a "Won" looks the same
// everywhere in the app.
const outcomeBadge: Record<string, { label: string; cls: string }> = {
  WON: { label: "Won", cls: "bg-success-50 text-success-700 ring-success-500/20" },
  PARTIAL: { label: "Partial", cls: "bg-warning-50 text-warning-700 ring-warning-500/20" },
  PENDING: { label: "Pending", cls: "bg-primary-50 text-primary-700 ring-primary-500/20" },
  SUBMITTED: { label: "Submitted", cls: "bg-primary-50 text-primary-700 ring-primary-500/20" },
  LOST: { label: "Lost", cls: "bg-error-50 text-error-700 ring-error-500/20" },
  SKIPPED: { label: "Skipped", cls: "bg-gray-100 text-gray-600 ring-gray-300/40" },
};

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
      denial: { include: { claim: { include: { payer: true, patient: true } } } },
      agentRun: true,
      humanReview: true,
      submissions: { orderBy: { startedAt: "desc" } },
      followUpChecks: { orderBy: { scheduledFor: "asc" } },
    },
  });
  if (!appeal) notFound();

  const dl = deadlineState(appeal.denial.filingDeadline);
  const patient = decryptPatient(appeal.denial.claim.patient);
  const patientName = fmtName(`${patient.firstName} ${patient.lastName}`).trim();

  const auditEvents = await prisma.auditEvent.findMany({
    where: { practiceId: user.practiceId, resourceType: "appeal", resourceId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { email: true } } },
  });

  type Citation = {
    source?: "policy" | "chart";
    policyId?: string;
    quote: string;
    sourceUrl?: string;
    page?: string;
    note?: string;
  };
  const allCitations = (appeal.citations as Citation[]) ?? [];
  const policyCitations = allCitations.filter((c) => (c.source ?? "policy") === "policy");
  const chartCitations = allCitations.filter((c) => c.source === "chart");

  const isDrafting = !["READY", "FAILED", "SKIPPED"].includes(appeal.status);
  const badge = outcomeBadge[appeal.outcome] ?? {
    label: appeal.outcome,
    cls: "bg-gray-100 text-gray-600 ring-gray-300/40",
  };

  return (
    <div className="space-y-6">
      <Link
        href={`/denials/${appeal.denialId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Back to denial
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Appeal</h1>
          <p className="mt-1 text-sm text-gray-500">
            {patientName ? `${patientName} · ` : ""}
            {appeal.denial.claim.payer.name} · {appeal.denial.denialCode}
          </p>
        </div>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </div>

      {/* Show progress if appeal is still being drafted */}
      {isDrafting && (
        <AppealProgressClient appealId={appeal.id} initialStatus={appeal.status} />
      )}

      {!isDrafting && (
        <ReviewProvider
          appealId={appeal.id}
          initialLetter={appeal.draftLetter ?? ""}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetaCard title="Payer">{appeal.denial.claim.payer.name}</MetaCard>
            <MetaCard title="Template">{appeal.templateUsed || "—"}</MetaCard>
            <MetaCard title="Denied amount">
              {fmtMoney(appeal.denial.deniedAmount as unknown as number)}
            </MetaCard>
            <ConfidenceCard
              score={appeal.confidenceScore ?? appeal.agentRun?.confidenceScore ?? null}
              rationale={
                (appeal.agentRun?.auditTrail as { confidence_rationale?: string } | null)
                  ?.confidence_rationale ?? null
              }
            />
          </div>

          {(() => {
            const editable =
              !!appeal.draftLetter &&
              appeal.outcome === "PENDING" &&
              !appeal.submittedAt &&
              !dl?.pastDue;
            return (
              <section>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Draft letter
                </h2>
                {appeal.draftLetter ? (
                  editable ? (
                    <ReviewEditor />
                  ) : (
                    <pre className="card whitespace-pre-wrap p-5 font-mono text-sm leading-relaxed text-gray-800">
                      {appeal.draftLetter}
                    </pre>
                  )
                ) : (
                  <p className="text-sm text-gray-500">No draft letter available.</p>
                )}
              </section>
            );
          })()}

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Citations ({allCitations.length})
            </h2>
            {allCitations.length === 0 ? (
              <p className="text-sm text-gray-500">No citations.</p>
            ) : (
              <div className="space-y-4">
                {policyCitations.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                      Payer policy ({policyCitations.length})
                    </div>
                    <ul className="space-y-2">
                      {policyCitations.map((c, i) => (
                        <li key={`p${i}`} className="card p-4 text-sm">
                          <div className="font-mono text-xs text-gray-500">{c.policyId}</div>
                          <div className="mt-1 italic text-gray-800">"{c.quote}"</div>
                          {c.sourceUrl && (
                            <a
                              href={c.sourceUrl}
                              target="_blank"
                              rel="noopener"
                              className="mt-1 inline-block text-xs text-primary-600 hover:text-primary-700 hover:underline"
                            >
                              {c.sourceUrl} →
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {chartCitations.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                      Clinical chart ({chartCitations.length})
                    </div>
                    <ul className="space-y-2">
                      {chartCitations.map((c, i) => (
                        <li key={`c${i}`} className="card p-4 text-sm">
                          {c.note && <div className="text-xs text-gray-500">{c.note}</div>}
                          <div className="mt-1 italic text-gray-800">"{c.quote}"</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {appeal.agentRun && (() => {
            const audit = (appeal.agentRun.auditTrail ?? {}) as {
              strategist_conf?: number;
              drafter_conf?: number;
              combined_conf?: number;
              confidence_rationale?: string;
              citation_valid_count?: number;
            };
            return (
              <section>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Agent run
                </h2>
                <div className="card space-y-1 p-4 text-sm">
                  <Row k="Status" v={appeal.agentRun.status} />
                  <Row k="Combined confidence" v={appeal.agentRun.confidenceScore?.toFixed(2) ?? "—"} />
                  {audit.strategist_conf != null && (
                    <Row k="Case merit (strategist)" v={audit.strategist_conf.toFixed(2)} />
                  )}
                  {audit.drafter_conf != null && (
                    <Row k="Draft quality (drafter)" v={audit.drafter_conf.toFixed(2)} />
                  )}
                  {audit.citation_valid_count != null && (
                    <Row k="Citations verified" v={String(audit.citation_valid_count)} />
                  )}
                  <Row k="Cost" v={`${((appeal.agentRun.costCents ?? 0) / 100).toFixed(2)} USD`} />
                  <Row k="Started" v={fmtDateTime(appeal.agentRun.startedAt)} />
                  {appeal.agentRun.completedAt && (
                    <Row k="Completed" v={fmtDateTime(appeal.agentRun.completedAt)} />
                  )}
                </div>
              </section>
            );
          })()}

          {appeal.agentRun &&
            appeal.agentRun.confidenceScore !== null &&
            appeal.agentRun.confidenceScore < 0.5 && (
              <section className="card border-warning-200 bg-warning-50 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <svg
                    className="mt-0.5 h-5 w-5 text-warning-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-warning-700">Low confidence appeal</h3>
                    <p className="mt-1 text-warning-700">
                      This appeal has a {(appeal.agentRun.confidenceScore * 100).toFixed(0)}%
                      predicted win probability. Consider strengthening the case before submitting.
                    </p>
                  </div>
                </div>
              </section>
            )}

          {dl && (
            <section
              className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
                dl.pastDue
                  ? "border-error-200 bg-error-50 text-error-800"
                  : dl.warn
                    ? "border-warning-200 bg-warning-50 text-warning-800"
                    : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              <ClockIcon className="h-4 w-4 shrink-0" />
              {dl.pastDue ? (
                <span>
                  <strong>Filing deadline passed</strong> {Math.abs(dl.daysRemaining)} day(s) ago.
                  Submission will be refused.
                </span>
              ) : (
                <span>
                  {dl.daysRemaining} day(s) until filing deadline (
                  {dl.deadline.toLocaleDateString()}).
                </span>
              )}
            </section>
          )}

          {appeal.submittedAt && (
            <section className="card flex items-center gap-2 border-success-200 bg-success-50 p-4 text-sm text-success-700">
              <PaperAirplaneIcon className="h-4 w-4 shrink-0" />
              <span>
                Submitted {fmtDateTime(appeal.submittedAt)}
                {appeal.submittedVia ? ` via ${appeal.submittedVia}` : ""}.
                {appeal.autoSubmittedAt && (
                  <span className="badge ml-2 bg-accent-50 text-accent-700 ring-accent-500/30">
                    ⚡ Autopilot — no human review required
                  </span>
                )}
              </span>
            </section>
          )}

          {appeal.submissions.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Submission history
              </h2>
              <ul className="space-y-2">
                {appeal.submissions.map((sub) => (
                  <li key={sub.id} className="card space-y-1 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-gray-500">#{sub.attemptNumber}</span>
                        <span className="ml-2 font-medium text-gray-900">{sub.channel}</span>
                        <span
                          className={`badge ml-2 ${
                            sub.status === "SUCCESS"
                              ? "bg-success-50 text-success-700 ring-success-500/20"
                              : sub.status === "FAILED"
                                ? "bg-error-50 text-error-700 ring-error-500/20"
                                : "bg-gray-100 text-gray-700 ring-gray-300/40"
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{fmtDateTime(sub.startedAt)}</span>
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
                    {sub.screenshots &&
                      Array.isArray(sub.screenshots) &&
                      sub.screenshots.length > 0 && (
                        <div className="text-xs text-gray-500">
                          {sub.screenshots.length} artifact(s) captured
                        </div>
                      )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {appeal.followUpChecks.length > 0 && (
            <section>
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Follow-up checks
              </h2>
              <p className="mb-2 text-xs text-gray-500">
                Scheduled probes after submission. Each tick either confirms an outcome via ERA,
                queries the payer's status surface, or escalates to ops.
              </p>
              <ul className="space-y-2">
                {appeal.followUpChecks.map((c) => {
                  const due = c.scheduledFor.getTime() <= Date.now();
                  return (
                    <li key={c.id} className="card space-y-1 p-4 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {fmtDateTime(c.scheduledFor)}
                          </span>
                          <span
                            className={`badge ${
                              c.status === "COMPLETED"
                                ? "bg-success-50 text-success-700 ring-success-500/20"
                                : c.status === "FAILED"
                                  ? "bg-error-50 text-error-700 ring-error-500/20"
                                  : due
                                    ? "bg-warning-50 text-warning-700 ring-warning-500/20"
                                    : "bg-gray-100 text-gray-700 ring-gray-300/40"
                            }`}
                          >
                            {c.status === "PENDING" && due ? "OVERDUE" : c.status}
                          </span>
                        </div>
                        {c.outcome && (
                          <span className="font-mono text-xs text-gray-600">{c.outcome}</span>
                        )}
                      </div>
                      {c.notes && <div className="text-xs text-gray-600">{c.notes}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {auditEvents.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Activity
              </h2>
              <ul className="card divide-y divide-gray-100 px-4 text-xs">
                {auditEvents.map((e) => (
                  <li key={e.id} className="flex justify-between py-2 text-gray-600">
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

          {!!appeal.draftLetter &&
            appeal.outcome === "PENDING" &&
            !appeal.submittedAt &&
            !dl?.pastDue && (
              <div className="sticky bottom-0 -mx-5 border-t border-gray-200 bg-white/90 px-5 py-3 backdrop-blur md:-mx-8 md:px-8">
                <ReviewActions />
              </div>
            )}
        </ReviewProvider>
      )}
    </div>
  );
}

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-1 font-medium text-gray-900">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-900">{v}</span>
    </div>
  );
}

function ConfidenceCard({
  score,
  rationale,
}: {
  score: number | null;
  rationale: string | null;
}) {
  if (score == null) {
    return (
      <div className="card p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">Confidence</div>
        <div className="mt-1 font-medium text-gray-400">—</div>
      </div>
    );
  }
  const pct = Math.round(score * 100);
  const tone =
    score >= 0.8
      ? "bg-success-50 border-success-200 text-success-800"
      : score >= 0.6
        ? "bg-primary-50 border-primary-200 text-primary-800"
        : score >= 0.45
          ? "bg-warning-50 border-warning-200 text-warning-800"
          : "bg-error-50 border-error-200 text-error-800";
  const label =
    score >= 0.8
      ? "Strong — approve as-is"
      : score >= 0.6
        ? "Solid — quick review"
        : score >= 0.45
          ? "Needs a careful read"
          : "Weak — consider rebuilding";
  return (
    <div className={`rounded-xl border p-4 shadow-soft ${tone}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">Confidence</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{pct}%</div>
      <div className="mt-0.5 text-xs">{label}</div>
      {rationale && <div className="mt-1 text-xs italic opacity-80">{rationale}</div>}
    </div>
  );
}
