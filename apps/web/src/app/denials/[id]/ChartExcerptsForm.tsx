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
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState(initialText);

  // Analyze clinical context quality
  const getContextQuality = (context: string) => {
    const minLength = 200;
    const hasMeasurements = /\d+°|\d+\/\d+|\d+\s*%/i.test(context);
    const hasDates = /\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+ \d{1,2}, \d{4}/i.test(context);
    const hasProgress = /progress|improv|better|worsen|baseline/i.test(context);
    const hasTreatment = /treatment|therapy|exercise|mobilization|intervention/i.test(context);

    if (context.length === 0) {
      return { status: 'empty', message: 'No clinical context' };
    }

    if (context.length < minLength) {
      return {
        status: 'insufficient',
        message: `Add more details (${context.length}/${minLength} min characters)`
      };
    }

    const indicators = [];
    if (!hasMeasurements) indicators.push('measurements');
    if (!hasDates) indicators.push('dates');
    if (!hasProgress) indicators.push('progress notes');
    if (!hasTreatment) indicators.push('treatment details');

    if (indicators.length === 0) {
      return { status: 'good', message: 'Strong clinical context' };
    }

    if (indicators.length <= 2) {
      return {
        status: 'warning',
        message: `Consider adding: ${indicators.join(', ')}`
      };
    }

    return {
      status: 'weak',
      message: `Missing key elements: ${indicators.join(', ')}`
    };
  };

  const contextQuality = getContextQuality(text);

  const getQualityIndicator = () => {
    switch (contextQuality.status) {
      case 'empty':
        return (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-gray-300"></span>
            {contextQuality.message}
          </div>
        );
      case 'insufficient':
        return (
          <div className="flex items-center gap-2 text-xs text-orange-600">
            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
            {contextQuality.message}
          </div>
        );
      case 'weak':
        return (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <span className="w-2 h-2 rounded-full bg-red-400"></span>
            {contextQuality.message}
          </div>
        );
      case 'warning':
        return (
          <div className="flex items-center gap-2 text-xs text-yellow-600">
            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
            {contextQuality.message}
          </div>
        );
      case 'good':
        return (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            {contextQuality.message}
          </div>
        );
    }
  };

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
      setLastSavedAt(new Date());
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

      {/* Context Quality Indicator */}
      <div className="flex items-center justify-between mb-4">
        {getQualityIndicator()}
      </div>

      <div>
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
          {lastSavedAt && (
            <div className="text-xs text-gray-500">
              Last saved: {lastSavedAt.toLocaleTimeString()} on {lastSavedAt.toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
