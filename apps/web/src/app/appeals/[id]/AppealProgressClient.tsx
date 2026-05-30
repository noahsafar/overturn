"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppealProgress } from "@/components/AppealProgress";

export function AppealProgressClient({ appealId, initialStatus }: { appealId: string; initialStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);

  // Poll for appeal status updates
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/appeals/${appealId}/status`);
      if (!res.ok) return;
      const data = (await res.json()) as { status: string; outcome: string };
      setStatus(data.status);

      // If appeal is complete, refresh the page to show the final content
      if (["READY", "FAILED", "SKIPPED"].includes(data.status)) {
        // Small delay to show the complete status
        setTimeout(() => {
          router.refresh();
        }, 1000);
        return;
      }

      // Continue polling
      setTimeout(() => pollStatus(), 1000);
    } catch {
      // Ignore polling errors and continue
      setTimeout(() => pollStatus(), 1000);
    }
  }, [appealId, router]);

  useEffect(() => {
    pollStatus();
  }, [pollStatus]);

  return (
    <div className="space-y-4">
      <AppealProgress currentStatus={status as any} />
      {status === "READY" && (
        <p className="text-sm text-gray-600">Appeal complete! Refreshing...</p>
      )}
      {status === "FAILED" && (
        <p className="text-sm text-red-600">Appeal generation failed. Please try again.</p>
      )}
      {status === "SKIPPED" && (
        <p className="text-sm text-yellow-600">Appeal was skipped (low win probability).</p>
      )}
    </div>
  );
}
