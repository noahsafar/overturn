"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function StartAppealButton({ denialId, label = "Start appeal", clinicalContext }: { denialId: string; label?: string; clinicalContext?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  // Validate clinical context before starting appeal
  const validateContext = (context?: string): { valid: boolean; message?: string } => {
    if (!context || context.trim().length === 0) {
      return {
        valid: false,
        message: "Clinical context is empty. Appeals without supporting documentation are likely to be rejected. Add clinical documentation from your EHR or upload a medical record."
      };
    }

    if (context.length < 200) {
      return {
        valid: false,
        message: "Clinical context appears insufficient. Appeals with minimal documentation are often rejected. Consider adding more clinical details, measurements, or progress notes."
      };
    }

    // Check for key clinical elements
    const hasMeasurements = /\d+°|\d+\/\d+|\d+\s*%/i.test(context);
    const hasDates = /\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+ \d{1,2}, \d{4}/i.test(context);
    const hasProgress = /progress|improv|better|worsen|baseline/i.test(context);

    if (!hasMeasurements && !hasProgress) {
      return {
        valid: false,
        message: "Clinical context lacks key clinical elements. Consider adding measurements, progress notes, or treatment details to strengthen the appeal."
      };
    }

    return { valid: true };
  };

  const handleClick = () => {
    setErr(null);
    setShowWarning(false);

    // Validate clinical context
    const validation = validateContext(clinicalContext);

    if (!validation.valid) {
      setShowWarning(true);
      setErr(validation.message);
      return;
    }

    startTransition(async () => {
      const res = await fetch(`/api/denials/${denialId}/start-appeal`, { method: "POST" });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      const data = (await res.json()) as { appealId?: string; workflowId?: string; denialId?: string };

      // If we got an appealId, navigate immediately
      if (data.appealId) {
        setLastCreatedId(data.appealId);
        router.push(`/appeals/${data.appealId}`);
        return;
      }

      // If we got a workflowId, poll for the appeal to be created
      if (data.workflowId && data.denialId) {
        // Poll for appeal creation
        const startTime = Date.now();
        let newAppealId: string | null = null;

        while (Date.now() - startTime < 10000) { // 10 second timeout
          await new Promise((r) => setTimeout(r, 500));
          const appealsRes = await fetch(`/api/denials/${data.denialId}/appeals`);
          if (appealsRes.ok) {
            const appealsData = (await appealsRes.json()) as { appeals: Array<{ id: string; createdAt: string }> };

            // Filter out appeals that existed before we started
            const newAppeals = appealsData.appeals.filter(a => {
              const createdTime = new Date(a.createdAt).getTime();
              return createdTime >= startTime;
            });

            if (newAppeals[0]) {
              newAppealId = newAppeals[0].id;
              break;
            }
          }
        }

        if (newAppealId) {
          setLastCreatedId(newAppealId);
          router.push(`/appeals/${newAppealId}`);
        } else {
          setErr("Appeal creation timed out");
        }
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        disabled={pending}
        onClick={handleClick}
        className="bg-gray-900 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Starting..." : label}
      </button>
      {showWarning && (
        <div className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded p-2">
          <p className="font-medium">⚠️ {err}</p>
          <p className="mt-1 text-xs">You can proceed, but the appeal may be weaker without proper clinical documentation.</p>
        </div>
      )}
      {!showWarning && err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
