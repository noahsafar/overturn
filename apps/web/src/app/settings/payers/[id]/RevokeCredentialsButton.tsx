"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RevokeCredentialsButton({ credentialId }: { credentialId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("Revoke these credentials? Submission jobs depending on them will fail.")) {
          return;
        }
        startTransition(async () => {
          const res = await fetch(`/api/payer-credentials/${credentialId}`, { method: "DELETE" });
          if (res.ok) router.refresh();
        });
      }}
      className="text-xs font-medium text-error-700 hover:text-error-800 disabled:opacity-50"
    >
      Revoke
    </button>
  );
}
