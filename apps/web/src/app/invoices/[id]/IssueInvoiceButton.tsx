"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function IssueInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const handleClick = () => {
    setErr(null);
    startTransition(async () => {
      const res = await fetch(`/api/invoices/${invoiceId}/issue`, { method: "POST" });
      if (!res.ok) {
        const body = await res.text();
        setErr(body || `failed (${res.status})`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <button
        disabled={pending}
        onClick={handleClick}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send invoice"}
      </button>
      {err && <p className="text-sm text-error-700">{err}</p>}
    </div>
  );
}
