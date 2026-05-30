import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { IssueInvoiceButton } from "./IssueInvoiceButton";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 ring-gray-300/40",
  OPEN: "bg-warning-50 text-warning-700 ring-warning-500/20",
  PAID: "bg-success-50 text-success-700 ring-success-500/20",
  VOID: "bg-error-50 text-error-700 ring-error-500/20",
  UNCOLLECTIBLE: "bg-error-50 text-error-700 ring-error-500/20",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const inv = await prisma.invoice.findFirst({
    where: { id, practiceId: user.practiceId },
    include: {
      lineItems: {
        orderBy: { createdAt: "asc" },
        include: {
          appeal: {
            include: {
              denial: {
                include: { claim: { include: { payer: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!inv) notFound();

  const canIssue = inv.status === "DRAFT" && inv.lineItems.length > 0 &&
    (user.role === "OWNER" || user.role === "ADMIN");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to invoices
        </Link>
        <div className="mt-3 flex items-baseline justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            Invoice {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}
          </h1>
          <span className={`badge ${statusStyles[inv.status]}`}>{inv.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500">Total fee</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">
            {fmtMoney(inv.totalCents / 100)}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500">Line items</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">{inv.lineItems.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500">Issued</div>
          <div className="mt-2 text-base font-medium text-gray-900">
            {inv.issuedAt ? fmtDate(inv.issuedAt) : "—"}
          </div>
        </div>
      </div>

      {canIssue && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900">Send invoice to customer</h2>
          <p className="mt-1 text-sm text-gray-500">
            This finalizes the invoice in Stripe and sends a payment link to the practice's
            billing email.
          </p>
          <div className="mt-3">
            <IssueInvoiceButton invoiceId={inv.id} />
          </div>
        </div>
      )}

      {inv.stripeHostedUrl && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900">Payment link</h2>
          <p className="mt-1 text-sm text-gray-500">
            Send the practice here to pay this invoice.
          </p>
          <a
            href={inv.stripeHostedUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary mt-3"
          >
            Open hosted payment page →
          </a>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Line items</h2>
        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Payer</th>
                <th className="px-5 py-3 text-right font-medium">Recovered</th>
                <th className="px-5 py-3 text-right font-medium">Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inv.lineItems.map((li) => (
                <tr key={li.id} className="hover:bg-gray-50/70">
                  <td className="px-5 py-3 text-gray-700">{li.description}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {li.appeal.denial.claim.payer.name}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-900">
                    {fmtMoney(li.recoveredAmount as unknown as number)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-900">
                    {fmtMoney(li.feeCents / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
