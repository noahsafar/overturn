"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RevokeInviteButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const res = await fetch(`/api/invitations/revoke`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: invitationId }),
          });
          if (res.ok) router.refresh();
        });
      }}
      className="text-xs font-medium text-error-700 hover:text-error-800 disabled:opacity-50"
    >
      Revoke
    </button>
  );
}
