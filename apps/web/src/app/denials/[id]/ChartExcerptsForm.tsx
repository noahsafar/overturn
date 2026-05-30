"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ChartExcerptsForm({
  denialId,
  initialText,
  locked,
}: {
  denialId: string;
  initialText: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = () => {
    setErr(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch(`/api/denials/${denialId}/chart`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chartExcerptsText: text }),
      });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  if (locked) {
    return (
      <div className="card p-4 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Chart excerpts</h3>
        <p className="mt-1 text-xs text-gray-500">
          Locked — an appeal on this denial has already been submitted. The
          chart context at submission time is preserved for audit.
        </p>
        {text ? (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-gray-700 bg-white border border-gray-200 rounded p-3 max-h-64 overflow-y-auto">
            {text}
          </pre>
        ) : (
          <p className="mt-3 text-xs text-gray-500 italic">(none recorded)</p>
        )}
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-900">Chart excerpts</h3>
      <p className="mt-1 text-xs text-gray-500">
        Paste the relevant progress notes, treatment plan, or DSM-5 diagnosis
        documentation. The AI cites verbatim from this — empty or generic text
        will (correctly) cause it to skip the appeal as insufficient evidence.
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Separate distinct notes with a blank line.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        placeholder="Encounter note 2025-09-15: Patient presents with persistent depressive symptoms. PHQ-9 = 18..."
        className="mt-3 block w-full rounded border border-gray-300 p-3 font-mono text-xs leading-relaxed text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-700"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="btn-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save chart excerpts"}
        </button>
        {saved && (
          <span className="text-sm text-success-700">Saved.</span>
        )}
        {err && <span className="text-sm text-error-700">{err}</span>}
      </div>
    </div>
  );
}
