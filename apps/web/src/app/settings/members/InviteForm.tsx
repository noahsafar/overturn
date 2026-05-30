"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OWNER" | "ADMIN" | "STAFF">("STAFF");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      setEmail("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card mt-3 p-4 flex gap-3 items-end">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@practice.com"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
      </div>
      <div className="w-32">
        <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as never)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Admin</option>
          <option value="OWNER">Owner</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send invite"}
      </button>
      {err && <p className="text-sm text-error-700 w-full">{err}</p>}
    </form>
  );
}
