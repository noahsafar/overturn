"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

export function StartAppealButton({ denialId, label = "Start appeal", clinicalContext }: { denialId: string; label?: string; clinicalContext?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  // Clear validation state when clinical context changes
  useEffect(() => {
    setError(null);
    setWarning(null);
  }, [clinicalContext]);

  // Validate clinical context before starting appeal
  const validateContext = (context?: string): { valid: boolean; message?: string; canProceed?: boolean } => {
    if (!context || context.trim().length === 0) {
      return {
        valid: false,
        canProceed: false,
        message: "Clinical context is required. Add documentation from your EHR or upload a medical record."
      };
    }

    if (context.length < 200) {
      return {
        valid: false,
        canProceed: true,
        message: "Context seems brief — consider adding measurements, progress notes, or treatment details."
      };
    }

    // Check for key clinical elements
    const hasMeasurements = /\d+°|\d+\/\d+|\d+\s*%/i.test(context);
    const hasDates = /\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+ \d{1,2}, \d{4}/i.test(context);
    const hasProgress = /progress|improv|better|worsen|baseline/i.test(context);

    if (!hasMeasurements && !hasProgress) {
      return {
        valid: false,
        canProceed: true,
        message: "Add measurements or progress notes to strengthen the appeal."
      };
    }

    return { valid: true };
  };

  const proceedWithAppeal = async () => {
    const res = await fetch(`/api/denials/${denialId}/start-appeal`, { method: "POST" });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = (await res.json()) as { appealId?: string; workflowId?: string; denialId?: string };

    if (data.appealId) {
      setLastCreatedId(data.appealId);
      router.push(`/appeals/${data.appealId}`);
      return;
    }

    if (data.workflowId && data.denialId) {
      const startTime = Date.now();
      let newAppealId: string | null = null;

      while (Date.now() - startTime < 10000) {
        await new Promise((r) => setTimeout(r, 500));
        const appealsRes = await fetch(`/api/denials/${data.denialId}/appeals`);
        if (appealsRes.ok) {
          const appealsData = (await appealsRes.json()) as { appeals: Array<{ id: string; createdAt: string }> };
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
        setError("Appeal creation timed out");
      }
    }
  };

  const handleClick = () => {
    // If warning is currently shown, user clicked "Proceed anyway"
    if (warning) {
      setWarning(null);
      startTransition(() => proceedWithAppeal());
      return;
    }

    // Clear any previous error
    setError(null);

    // Fetch current chart excerpts to validate fresh data
    startTransition(async () => {
      const chartRes = await fetch(`/api/denials/${denialId}/chart`);
      if (!chartRes.ok) {
        setError("Failed to validate clinical context");
        return;
      }
      const chartData = (await chartRes.json()) as { chartExcerptsText?: string };
      const currentContext = chartData.chartExcerptsText || "";

      const validation = validateContext(currentContext);

      if (!validation.valid) {
        if (validation.canProceed) {
          // Show warning - user can click again to proceed
          setWarning(validation.message || "Warning");
          return;
        }
        // Show error - user cannot proceed
        setError(validation.message || "Error");
        return;
      }

      // Valid context - proceed
      await proceedWithAppeal();
    });
  };

  return (
    <div className="space-y-2">
      <button
        disabled={pending}
        onClick={handleClick}
        className="bg-gray-900 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Starting..." : warning ? "Proceed anyway" : label}
      </button>
      {warning && (
        <div className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded p-2">
          <p className="font-medium">⚠️ {warning}</p>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
