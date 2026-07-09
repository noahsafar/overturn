"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BoltIcon } from "@heroicons/react/24/outline";

// One-click "work everything": starts appeal drafts for every unworked,
// deadline-valid denial (server caps the batch). Two-step confirm so a
// stray click can't fan out agent runs.
export function BulkStartButton({ unworkedCount }: { unworkedCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  if (unworkedCount === 0 && !result) return null;

  const run = () => {
    setConfirming(false);
    startTransition(async () => {
      setResult(null);
      setFailed(false);
      try {
        const res = await fetch("/api/denials/bulk-start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = (await res.json().catch(() => null)) as {
          started?: number;
          expired?: number;
          deferred?: number;
          failed?: number;
        } | null;
        if (!res.ok || !data) {
          setFailed(true);
          setResult("Bulk start failed — is the worker running?");
          return;
        }
        const parts = [`${data.started ?? 0} draft(s) started`];
        if (data.deferred) parts.push(`${data.deferred} queued for the next batch`);
        if (data.expired) parts.push(`${data.expired} past deadline`);
        if (data.failed) parts.push(`${data.failed} failed`);
        setFailed((data.failed ?? 0) > 0 && (data.started ?? 0) === 0);
        setResult(parts.join(" · "));
        router.refresh();
      } catch {
        setFailed(true);
        setResult("Bulk start failed — is the worker running?");
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className={`text-xs ${failed ? "text-error-700" : "text-gray-500"}`}>
          {result}
        </span>
      )}
      {confirming ? (
        <span className="inline-flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Draft appeals for {Math.min(unworkedCount, 25)} denial(s)?
          </span>
          <button type="button" onClick={run} className="btn-primary">
            Yes, start drafting
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="btn-secondary"
          >
            Cancel
          </button>
        </span>
      ) : (
        unworkedCount > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(true)}
            className="btn-primary disabled:opacity-50"
          >
            <BoltIcon className="h-4 w-4" />
            {pending ? "Starting…" : `Start all unworked (${unworkedCount})`}
          </button>
        )
      )}
    </div>
  );
}
