"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PayButton({
  invoiceId,
  stripeInvoiceId,
  alreadyPaid,
}: {
  invoiceId: string;
  stripeInvoiceId: string;
  alreadyPaid: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (alreadyPaid) {
    return (
      <div className="inline-flex items-center gap-2 rounded bg-success-50 px-4 py-2 text-sm font-medium text-success-700">
        ✓ Paid
      </div>
    );
  }

  const handleClick = () => {
    setErr(null);
    startTransition(async () => {
      // Fire a synthetic stripe webhook event at our own endpoint. In
      // stub mode the webhook handler accepts the JSON verbatim (no
      // signature check) and runs the same markInvoicePaid path that
      // a real Stripe webhook would hit.
      const res = await fetch("/api/webhooks/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "invoice.paid",
          data: { object: { id: stripeInvoiceId } },
        }),
      });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Processing…" : `Pay invoice`}
      </button>
      {err && <p className="text-sm text-error-700">{err}</p>}
    </div>
  );
}
