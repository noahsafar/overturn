// Stand-in for Stripe's hosted invoice page. Only mounted when
// STRIPE_SECRET_KEY is unset — in production the link goes straight to
// Stripe and this file is dead code.
//
// The "Pay invoice" button fires a synthetic webhook event back at our own
// /api/webhooks/stripe endpoint, so the rest of the lifecycle (OPEN → PAID,
// audit event, paidAt timestamp) is exercised exactly as it would be in prod.

import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { PayButton } from "./PayButton";

export const dynamic = "force-dynamic";

export default async function StubStripeInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The stub IDs we generate look like `in_stub_<short>`. The Invoice row
  // stores the full id in `stripeInvoiceId`. Look it up that way.
  const inv = await prisma.invoice.findFirst({
    where: { stripeInvoiceId: id },
    include: {
      practice: true,
      lineItems: { include: { appeal: { include: { denial: { include: { claim: { include: { payer: true } } } } } } } },
    },
  });
  if (!inv) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
          <span className="h-1.5 w-1.5 rounded-full bg-warning-500" />
          Stripe stub mode — not a real payment page
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900">
          Invoice from Overturn
        </h1>
        <p className="text-sm text-gray-600">
          To: {inv.practice.billingEmail ?? "(no billing email)"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <Row k="Invoice id" v={inv.stripeInvoiceId ?? "—"} mono />
        <Row k="Status" v={inv.status} />
        <Row k="Period start" v={fmtDate(inv.periodStart)} />
        <Row k="Period end" v={fmtDate(inv.periodEnd)} />
        <Row k="Issued" v={inv.issuedAt ? fmtDate(inv.issuedAt) : "—"} />
        <Row k="Paid" v={inv.paidAt ? fmtDate(inv.paidAt) : "—"} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Line items</h2>
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded">
          {inv.lineItems.map((li) => (
            <li key={li.id} className="flex justify-between px-4 py-3 text-sm">
              <div>
                <div className="text-gray-900">{li.description}</div>
                <div className="text-xs text-gray-500">
                  Payer: {li.appeal.denial.claim.payer.name}
                </div>
              </div>
              <div className="text-right tabular-nums text-gray-900">
                {fmtMoney(li.feeCents / 100)}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Total due</div>
          <div className="text-3xl font-semibold text-gray-900 tabular-nums">
            {fmtMoney(inv.totalCents / 100)}
          </div>
        </div>
        <PayButton invoiceId={inv.id} stripeInvoiceId={inv.stripeInvoiceId ?? ""} alreadyPaid={inv.status === "PAID"} />
      </div>

      <p className="text-xs text-gray-400">
        Production replaces this page with Stripe's real hosted invoice page —
        same URL shape, same payment flow.
      </p>
    </div>
  );
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{k}</div>
      <div className={`mt-0.5 text-gray-900 ${mono ? "font-mono text-xs" : ""}`}>{v}</div>
    </div>
  );
}
