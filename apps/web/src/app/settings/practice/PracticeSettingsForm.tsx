"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BoltIcon, CheckIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";

interface PracticeInitial {
  name: string;
  npi: string;
  specialty: string;
  billingEmail: string | null;
  recoveryFeeBps: number;
  autoPilotEnabled: boolean;
  autoPilotMinConfidence: number;
  autoPilotMaxAmountCents: number | null;
}

export function PracticeSettingsForm({
  initial,
  canEdit,
}: {
  initial: PracticeInitial;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState(initial.name);
  const [billingEmail, setBillingEmail] = useState(initial.billingEmail ?? "");
  const [apEnabled, setApEnabled] = useState(initial.autoPilotEnabled);
  const [apConfidencePct, setApConfidencePct] = useState(
    Math.round(initial.autoPilotMinConfidence * 100),
  );
  const [apCapDollars, setApCapDollars] = useState(
    initial.autoPilotMaxAmountCents != null
      ? String(initial.autoPilotMaxAmountCents / 100)
      : "",
  );

  const save = () => {
    startTransition(async () => {
      setErr(null);
      setSaved(false);
      const capTrimmed = apCapDollars.trim();
      const capCents =
        capTrimmed === "" ? null : Math.round(Number(capTrimmed) * 100);
      if (capCents != null && (!Number.isFinite(capCents) || capCents < 0)) {
        setErr("Max amount must be a positive dollar value or empty for no cap.");
        return;
      }
      const res = await fetch("/api/practice", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          billingEmail: billingEmail.trim() === "" ? null : billingEmail.trim(),
          autoPilotEnabled: apEnabled,
          autoPilotMinConfidence: Math.min(100, Math.max(50, apConfidencePct)) / 100,
          autoPilotMaxAmountCents: capCents,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setErr(body?.message ?? `Save failed (${res.status})`);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Profile */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Profile
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Practice name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              className="input"
            />
          </Field>
          <Field label="Billing email">
            <input
              type="email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              placeholder="billing@practice.com"
              disabled={!canEdit}
              className="input"
            />
          </Field>
          <Field label="NPI" hint="Contact support to change">
            <input type="text" value={initial.npi} disabled className="input" />
          </Field>
          <Field label="Specialty" hint="Contact support to change">
            <input
              type="text"
              value={initial.specialty}
              disabled
              className="input capitalize"
            />
          </Field>
          <Field label="Recovery fee" hint="Percent of recovered dollars, per your agreement">
            <input
              type="text"
              value={`${(initial.recoveryFeeBps / 100).toFixed(1)}%`}
              disabled
              className="input"
            />
          </Field>
        </div>
      </section>

      {/* Autopilot */}
      <section
        className={clsx(
          "card p-5 transition-colors",
          apEnabled && "border-accent-200 bg-accent-50/30",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              <BoltIcon className={clsx("h-4 w-4", apEnabled ? "text-accent-600" : "text-gray-400")} />
              Autopilot
            </h2>
            <p className="mt-1 max-w-xl text-sm text-gray-600">
              When a drafted appeal's verified confidence clears your threshold, it is
              submitted immediately — no review click needed. Everything below the
              threshold (or over the dollar cap) still goes to your review queue, and
              appeals past their filing deadline are never auto-submitted.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={apEnabled}
            disabled={!canEdit}
            onClick={() => setApEnabled((v) => !v)}
            className={clsx(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              apEnabled ? "bg-accent-500" : "bg-gray-300",
              !canEdit && "opacity-50",
            )}
          >
            <span
              className={clsx(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                apEnabled ? "translate-x-[22px]" : "translate-x-0.5",
              )}
            />
          </button>
        </div>

        <div className={clsx("mt-5 grid gap-4 sm:grid-cols-2", !apEnabled && "opacity-50")}>
          <Field
            label={`Minimum confidence — ${apConfidencePct}%`}
            hint="Only drafts at or above this verified confidence auto-submit (floor 50%)"
          >
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={apConfidencePct}
              onChange={(e) => setApConfidencePct(Number(e.target.value))}
              disabled={!canEdit || !apEnabled}
              className="w-full accent-accent-600"
            />
            <div className="mt-1 flex justify-between text-[11px] text-gray-400">
              <span>50% · cautious floor</span>
              <span>100% · effectively off</span>
            </div>
          </Field>
          <Field
            label="Max denied amount ($)"
            hint="Appeals over this amount always get human review. Empty = no cap."
          >
            <input
              type="number"
              min={0}
              step="0.01"
              value={apCapDollars}
              onChange={(e) => setApCapDollars(e.target.value)}
              placeholder="No cap"
              disabled={!canEdit || !apEnabled}
              className="input"
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canEdit || pending}
          className="btn-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-sm text-success-600">
            <CheckIcon className="h-4 w-4" /> Saved
          </span>
        )}
        {!canEdit && (
          <span className="text-sm text-gray-500">
            Only owners and admins can change practice settings.
          </span>
        )}
        {err && <span className="text-sm text-error-700">{err}</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}
