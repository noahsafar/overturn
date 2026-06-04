import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { decryptPatient } from "@/lib/patient";
import { fmtMoney, fmtDate } from "@/lib/format";
import { StartAppealButton } from "./StartAppealButton";
import { ChartExcerptsForm } from "./ChartExcerptsForm";
import { deadlineState } from "@/lib/deadlines";
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

  const pt = decryptPatient(denial.claim.patient);
  const latestAppeal = denial.appeals[0];
  const chartLocked = denial.appeals.some((a) => a.submittedAt !== null);
  const dl = deadlineState(denial.filingDeadline);

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
          {pt.firstName} {pt.lastName} · {denial.claim.payer.name} · {denial.denialCode}
        </p>
      </div>

      {dl && (
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
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Patient">
          <Row k="Name" v={`${pt.firstName} ${pt.lastName}`} />
          <Row k="DOB" v={pt.dob} />
          <Row k="Member ID" v={pt.memberId} />
        </Card>
        <Card title="Claim">
          <Row k="Payer" v={denial.claim.payer.name} />
          <Row k="Service date" v={fmtDate(denial.claim.serviceDate)} />
          <Row k="CPT" v={denial.claim.cptCodes.join(", ")} />
          <Row k="ICD" v={denial.claim.icdCodes.join(", ")} />
          <Row k="Billed" v={fmtMoney(denial.claim.billedAmount as unknown as number)} />
        </Card>
        <Card title="Denial">
          <Row k="Code" v={denial.denialCode} mono />
          <Row k="Reason" v={denial.denialReason} />
          <Row k="Denied" v={fmtMoney(denial.deniedAmount as unknown as number)} />
          <Row k="Received" v={fmtDate(denial.receivedAt)} />
        </Card>
        <Card title="ERA snippet">
          <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-800">
            {denial.eraRawText}
          </pre>
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
          <div className="card mt-3 p-5">
            <p className="text-sm text-gray-600">
              No appeal yet. The agent will draft one, verify every citation against
              retrieved payer policies, and queue it for your review.
            </p>
            <div className="mt-4">
              <StartAppealButton denialId={denial.id} clinicalContext={denial.chartExcerptsText || ""} />
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
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-gray-500">{k}</dt>
      <dd className={`text-right text-gray-900 ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}
