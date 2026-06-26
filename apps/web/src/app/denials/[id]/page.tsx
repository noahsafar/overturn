import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { decryptPatient } from "@/lib/patient";
import { fmtMoney, fmtDate, fmtName } from "@/lib/format";
import { StartAppealButton } from "./StartAppealButton";
import { ResubmitCorrectedButton } from "./ResubmitCorrectedButton";
import { ChartExcerptsForm } from "./ChartExcerptsForm";
import { isCorrectedClaimCandidate, correctedClaimGuidance } from "@/lib/denial-priority";
import { deadlineState } from "@/lib/deadlines";
import { buildGroupForDenial, splitSharedSnippet } from "@/lib/denial-grouping";
import { computeFilingDeadline } from "@/lib/deadlines";
import { ArrowLeftIcon, ArrowRightIcon, ClockIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

export default async function DenialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const denial = await prisma.denial.findFirst({
    where: { id, claim: { practiceId: user.practiceId } },
    include: {
      claim: { include: { patient: true, payer: true } },
      appeals: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!denial) notFound();

  // Same-claim, same-code siblings make up the group this denial belongs to.
  // We display them together so a multi-CPT decision shows as one row instead
  // of N. Source rows are unchanged in the DB.
  const siblings = await prisma.denial.findMany({
    where: {
      claimId: denial.claimId,
      denialCode: denial.denialCode,
      id: { not: denial.id },
    },
    include: {
      claim: { include: { patient: true, payer: true } },
      appeals: { orderBy: { createdAt: "desc" } },
    },
  });
  const group = buildGroupForDenial(denial, siblings);

  const pt = decryptPatient(denial.claim.patient);
  const latestAppeal = denial.appeals[0];
  const chartLocked = denial.appeals.some((a) => a.submittedAt !== null);

  // Re-derive the filing deadline from CURRENT payer policy, not the value
  // frozen on the Denial row at insert time. That way a payer's window
  // becoming "unknown" (NULL) immediately flips the UI for existing rows
  // without needing a re-upload.
  const currentWindow = denial.claim.payer.appealWindowDays;
  const liveDeadline =
    currentWindow != null
      ? computeFilingDeadline(denial.receivedAt, currentWindow)
      : null;
  const dl = deadlineState(liveDeadline);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/denials"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to denials
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
          Denial detail
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {fmtName(`${pt.firstName} ${pt.lastName}`).trim() || "Unknown patient"} · {denial.claim.payer.name} · {denial.denialCode}
        </p>
      </div>

      {dl ? (
        <div
          className={`card flex items-center gap-3 p-4 ${
            dl.pastDue
              ? "border-error-200 bg-error-50"
              : dl.warn
                ? "border-warning-200 bg-warning-50"
                : "border-gray-200"
          }`}
        >
          <ClockIcon
            className={`h-5 w-5 ${
              dl.pastDue
                ? "text-error-700"
                : dl.warn
                  ? "text-warning-700"
                  : "text-gray-500"
            }`}
          />
          <div className="text-sm">
            {dl.pastDue ? (
              <span className="font-semibold text-error-700">
                Filing deadline passed {Math.abs(dl.daysRemaining)} day(s) ago — appeal
                cannot be submitted to this payer.
              </span>
            ) : (
              <>
                <span
                  className={`font-medium ${dl.warn ? "text-warning-800" : "text-gray-800"}`}
                >
                  {dl.daysRemaining} day(s) remaining
                </span>
                <span className="text-gray-500">
                  {" "}
                  to file (deadline {dl.deadline.toLocaleDateString()}).
                </span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card flex items-center gap-3 border-gray-200 p-4">
          <ClockIcon className="h-5 w-5 text-gray-400" />
          <div className="text-sm text-gray-600">
            <span className="font-medium">Appeal deadline: Not available</span>
            <span className="text-gray-500">
              {" — We couldn't determine the filing window for this payer. "}
              Contact support for assistance with deadline tracking.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Patient">
          <Row k="Name" v={fmtName(`${pt.firstName} ${pt.lastName}`).trim()} />
          <Row k="DOB" v={pt.dob} />
          <Row k="Member ID" v={pt.memberId} />
        </Card>
        <Card title="Claim">
          <Row k="Claim ID" v={denial.claim.controlNumber ?? ""} mono />
          <Row k="Payer" v={denial.claim.payer.name} />
          <Row k="Service date" v={fmtDate(denial.claim.serviceDate)} />
          <Row k="CPT" v={denial.claim.cptCodes.join(", ")} mono />
          <Row k="ICD" v={denial.claim.icdCodes.join(", ")} mono />
          <Row k="Billed" v={fmtMoney(denial.claim.billedAmount as unknown as number)} />
        </Card>
        <Card title="Denial">
          <Row k="Code" v={denial.denialCode} mono />
          <Row k="Reason" v={denial.denialReason} />
          {group.count === 1 ? (
            <>
              <Row
                k="CPT for this denial"
                v={denial.serviceCpt ?? denial.claim.cptCodes[0] ?? ""}
                mono
              />
              <Row k="Denied" v={fmtMoney(denial.deniedAmount as unknown as number)} />
            </>
          ) : (
            <>
              <Row k="Total denied" v={fmtMoney(group.totalDenied)} />
              <div className="pt-2">
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  Affected services ({group.count})
                </div>
                <div className="mt-1.5 rounded-md border border-gray-200">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {group.members.map((m) => (
                        <tr key={m.id}>
                          <td className="px-3 py-1.5 font-mono text-xs text-gray-700">
                            {m.serviceCpt ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">
                            {fmtMoney(m.deniedAmount as unknown as number)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  The payer issued one decision (<span className="font-mono">{denial.denialCode}</span>)
                  against multiple service lines on this claim. One appeal addresses them all.
                </p>
              </div>
            </>
          )}
          <Row k="ERA date" v={fmtDate(denial.receivedAt)} />
          <Row k="Uploaded" v={fmtDate(denial.createdAt)} />
        </Card>
        <Card title="ERA snippet">
          {(() => {
            if (group.count === 1) {
              return (
                <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-800">
                  {denial.eraRawText}
                </pre>
              );
            }
            // De-duplicate: extract the shared header lines (Stored at:, CLP)
            // and render the per-member tails (SVC + CAS) underneath. Avoids
            // showing the same CLP line three times.
            const { shared, tails } = splitSharedSnippet(
              group.members.map((m) => m.eraRawText),
            );
            return (
              <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-800">
                {shared.join("\n")}
                {tails.map((tail, i) => (
                  <span key={group.members[i]!.id}>
                    {"\n"}
                    {tail.join("\n")}
                  </span>
                ))}
              </pre>
            );
          })()}
        </Card>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Clinical context</h2>
        <div className="mt-3">
          <ChartExcerptsForm
            denialId={denial.id}
            initialText={denial.chartExcerptsText ?? ""}
            locked={chartLocked}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Appeals</h2>
        {denial.appeals.length === 0 ? (
          <div className="card mt-3 p-5 space-y-4">
            <p className="text-sm text-gray-600">
              No appeal yet. The agent will draft one, verify every citation against
              retrieved payer policies, and queue it for your review.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <StartAppealButton denialId={denial.id} clinicalContext={denial.chartExcerptsText || ""} />
              {isCorrectedClaimCandidate(denial.denialCode) && (
                <ResubmitCorrectedButton
                  denialId={denial.id}
                  denialCode={denial.denialCode}
                  currentCpts={denial.claim.cptCodes ?? []}
                  guidance={
                    correctedClaimGuidance(denial.denialCode) ??
                    "This denial looks like a billing error. Resubmit a corrected claim instead of appealing."
                  }
                />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="mt-3 space-y-2">
              {denial.appeals.map((a) => (
                <li key={a.id} className="card flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-gray-400">{a.id}</div>
                    <div className="mt-0.5 text-sm text-gray-900">
                      Outcome: <strong>{a.outcome}</strong>
                      <span className="text-gray-400"> · </span>
                      Template: <span className="text-gray-700">{a.templateUsed}</span>
                    </div>
                  </div>
                  <Link
                    href={`/appeals/${a.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
                  >
                    Open <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <StartAppealButton denialId={denial.id} label="Create another appeal" clinicalContext={denial.chartExcerptsText || ""} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </div>
      <dl className="mt-3 space-y-1.5">{children}</dl>
    </div>
  );
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  const empty = !v || !v.trim();
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-gray-500">{k}</dt>
      <dd
        className={`text-right ${empty ? "text-gray-400" : "text-gray-900"} ${mono ? "font-mono text-xs" : ""}`}
      >
        {empty ? "—" : v}
      </dd>
    </div>
  );
}
