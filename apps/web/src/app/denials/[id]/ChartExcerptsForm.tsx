"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StructuredClinicalContext } from "@/components/StructuredClinicalContext";

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
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState(initialText);

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

  const handleContextChange = (newContext: string) => {
    setText(newContext);
    // Auto-save when context changes (debounced in real implementation)
    setSaved(false);
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
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Clinical Context for Appeal</h3>
        <p className="mt-1 text-xs text-gray-500">
          Upload clinical documentation or paste from your EHR. The AI cites verbatim from this context — empty or generic text will cause the appeal to be rejected as insufficient evidence.
        </p>
      </div>

      <StructuredClinicalContext
        denialId={denialId}
        initialContext={initialText}
        onContextChange={handleContextChange}
      />

      <div className="mt-6 border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="btn-primary disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save clinical context"}
            </button>
            {saved && (
              <span className="text-sm text-success-700 flex items-center">
                ✓ Saved successfully
              </span>
            )}
            {err && <span className="text-sm text-error-700">{err}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
