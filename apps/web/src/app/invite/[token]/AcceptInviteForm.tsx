"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AcceptInviteForm({ token, prefilledEmail }: { token: string; prefilledEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(prefilledEmail);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      router.push("/dashboard");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
      </div>
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
        {pending ? "Joining…" : "Accept invitation"}
      </button>
      {err && <p className="text-sm text-error-700">{err}</p>}
    </form>
  );
}
