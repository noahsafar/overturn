"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  denialId: string;
  denialCode: string;
  currentCpts: string[];
  guidance: string;
}

export function ResubmitCorrectedButton({ denialId, denialCode, currentCpts, guidance }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctedCpt, setCorrectedCpt] = useState("");
  const [correctedModifier, setCorrectedModifier] = useState("");
  const [reason, setReason] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/denials/${denialId}/resubmit-corrected`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          correctedCpt: correctedCpt.trim() || undefined,
          correctedModifier: correctedModifier.trim() || undefined,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { appealId: string };
      router.push(`/appeals/${data.appealId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Resubmit as corrected claim
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-4 space-y-3 max-w-2xl">
      <div className="text-sm text-gray-700 bg-primary-50 border border-primary-200 rounded p-3">
        <strong>{denialCode}</strong> — {guidance}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Corrected CPT
            <span className="ml-1 text-gray-400">
              · current: {currentCpts.length > 0 ? currentCpts.join(", ") : "—"}
            </span>
          </label>
          <input
            type="text"
            value={correctedCpt}
            onChange={(e) => setCorrectedCpt(e.target.value)}
            placeholder="leave blank to keep original"
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Modifier</label>
          <input
            type="text"
            value={correctedModifier}
            onChange={(e) => setCorrectedModifier(e.target.value)}
            placeholder="e.g. 25, 59, GP"
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-mono"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">
          Reason for correction (sent in NTE narrative)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. Corrected CPT from 99213 to 99214 — encounter complexity meets level-4 criteria documented in chart."
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || reason.trim().length < 5}
          className="bg-gray-900 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit corrected 837"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
        {error && <span className="text-sm text-error-700">{error}</span>}
      </div>
    </form>
  );
}
