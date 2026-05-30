"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function StartAppealButton({ denialId, label = "Start appeal" }: { denialId: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  const handleClick = () => {
    setErr(null);
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

            if (newAppeals.length > 0) {
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
        className="bg-brand-700 text-white px-3 py-1.5 rounded text-sm hover:bg-brand-900 disabled:opacity-50"
      >
        {pending ? "Starting..." : label}
      </button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
