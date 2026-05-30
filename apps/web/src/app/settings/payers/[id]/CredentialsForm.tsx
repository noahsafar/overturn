"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CredentialsForm({ payerId }: { payerId: string }) {
  const router = useRouter();
  const [type, setType] = useState<"PORTAL" | "SFTP" | "API">("PORTAL");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/payer-credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payerId,
          credentialType: type,
          username,
          password,
          mfaSecret: mfa || undefined,
        }),
      });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      setOk("Credentials saved.");
      setUsername("");
      setPassword("");
      setMfa("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card mt-3 p-5 space-y-3 max-w-md">
      <h3 className="font-semibold text-gray-900">Add / rotate credentials</h3>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as never)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="PORTAL">Portal (web login)</option>
          <option value="SFTP">SFTP (clearinghouse)</option>
          <option value="API">API key</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Password / key</label>
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">MFA seed (optional)</label>
        <input
          value={mfa}
          onChange={(e) => setMfa(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          autoComplete="off"
          placeholder="TOTP secret if applicable"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save credentials"}
      </button>
      {err && <p className="text-sm text-error-700">{err}</p>}
      {ok && <p className="text-sm text-success-700">{ok}</p>}
    </form>
  );
}
