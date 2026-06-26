"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Initial {
  enabled: boolean;
  host: string;
  user: string;
  hasSecret: boolean;
}

export function ClearinghouseForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [host, setHost] = useState(initial.host);
  const [user, setUser] = useState(initial.user);
  const [remotePath, setRemotePath] = useState("/inbox");
  const [authType, setAuthType] = useState<"password" | "key">("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const preserveSecret =
      initial.hasSecret &&
      ((authType === "password" && !password) ||
        (authType === "key" && !privateKey));

    const body = {
      enabled,
      host: host.trim(),
      user: user.trim(),
      remotePath: remotePath.trim(),
      ...(authType === "password" && password ? { password } : {}),
      ...(authType === "key" && privateKey ? { privateKey } : {}),
      preserveSecret,
    };

    try {
      const res = await fetch("/api/practice/clearinghouse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }
      setSuccess(true);
      setPassword("");
      setPrivateKey("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-4 space-y-4" onSubmit={onSubmit}>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm font-medium text-gray-900">
          Enable auto-ingest polling
        </span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="SFTP host"
          placeholder="sftp.changehealthcare.com"
          value={host}
          onChange={setHost}
          required
        />
        <Field
          label="Username"
          placeholder="practice_user"
          value={user}
          onChange={setUser}
          required
        />
        <Field
          label="Remote path"
          placeholder="/inbox"
          value={remotePath}
          onChange={setRemotePath}
          required
        />
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Auth method
          </label>
          <select
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={authType}
            onChange={(e) => setAuthType(e.target.value as "password" | "key")}
          >
            <option value="password">Password</option>
            <option value="key">SSH private key</option>
          </select>
        </div>
      </div>

      {authType === "password" ? (
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Password
            {initial.hasSecret && (
              <span className="ml-2 text-gray-400">
                · leave blank to keep existing
              </span>
            )}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
            autoComplete="off"
          />
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Private key (OpenSSH or PEM)
            {initial.hasSecret && (
              <span className="ml-2 text-gray-400">
                · leave blank to keep existing
              </span>
            )}
          </label>
          <textarea
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            rows={6}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono"
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            autoComplete="off"
          />
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        {success && (
          <span className="text-sm text-success-700">Saved · polling will pick up on the next cycle.</span>
        )}
        {error && <span className="text-sm text-error-700">{error}</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
