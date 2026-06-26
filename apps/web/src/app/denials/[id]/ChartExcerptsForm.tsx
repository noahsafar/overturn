"use client";

import { useState, useEffect, useRef, useTransition } from "react";
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
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState(initialText);
  const [autoSaving, setAutoSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save with debounce
  useEffect(() => {
    // Clear any pending auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new auto-save timeout (1.5 second debounce)
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveContext();
    }, 1500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [text]);

  const autoSaveContext = () => {
    setAutoSaving(true);
    startTransition(async () => {
      const res = await fetch(`/api/denials/${denialId}/chart`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chartExcerptsText: text }),
      });
      if (!res.ok) {
        setErr(await res.text());
        setAutoSaving(false);
        return;
      }
      setLastSavedAt(new Date());
      setAutoSaving(false);
      setErr(null);
    });
  };

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
        onContextChange={setText}
      />

      {/* Context Quality Indicator + Auto-save status */}
      <div className="flex items-center justify-between mb-4">
        {getQualityIndicator()}
        <div className="flex items-center gap-3">
          {autoSaving && (
            <span className="text-xs text-gray-500 flex items-center">
              <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse mr-2"></span>
              Auto-saving...
            </span>
          )}
          {err && <span className="text-xs text-error-700">{err}</span>}
          {lastSavedAt && (
            <span className="text-xs text-gray-500">
              Saved {lastSavedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
