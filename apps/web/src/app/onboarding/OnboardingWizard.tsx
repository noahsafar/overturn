"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  initialName: string;
  initialBillingEmail: string;
  initialFeeBps: number;
}

export function OnboardingWizard({ initialName, initialBillingEmail, initialFeeBps }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [billingEmail, setBillingEmail] = useState(initialBillingEmail);
  const [feeBps, setFeeBps] = useState(initialFeeBps);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const steps = ["Practice info", "Billing", "Invite team", "Review"];

  const save = async (completeOnboarding = false) => {
    setErr(null);
    const res = await fetch("/api/practice", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, billingEmail, recoveryFeeBps: feeBps, completeOnboarding }),
    });
    if (!res.ok) {
      setErr(await res.text());
      return false;
    }
    return true;
  };

  const next = () =>
    startTransition(async () => {
      const ok = await save();
      if (ok) setStep(step + 1);
    });

  const finish = () =>
    startTransition(async () => {
      const ok = await save(true);
      if (ok) router.push("/dashboard");
    });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Welcome to Overturn
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          A few details and you can start working denials.
        </p>
      </header>

      <ol className="flex items-center gap-2 text-xs text-gray-500">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${i === step ? "text-brand-700 font-medium" : ""}`}>
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${i <= step ? "bg-brand-700 text-white" : "bg-gray-200 text-gray-500"}`}>
              {i + 1}
            </span>
            {s}
            {i < steps.length - 1 && <span className="text-gray-300">·</span>}
          </li>
        ))}
      </ol>

      <div className="card p-6 space-y-4">
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Practice name</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Lakeside Behavioral Health"
            />
          </>
        )}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Billing</h2>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Billing email</label>
              <input
                type="email"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="billing@practice.com"
              />
              <p className="mt-1 text-xs text-gray-500">
                We send monthly recovery-fee invoices to this address.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Recovery fee (% of recovered amount)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={(feeBps / 100).toFixed(1)}
                onChange={(e) => setFeeBps(Math.round(parseFloat(e.target.value || "0") * 100))}
                className="w-32 border border-gray-300 rounded px-3 py-2 text-sm tabular-nums"
              />
              <p className="mt-1 text-xs text-gray-500">
                Default is 25%. You only pay when we recover.
              </p>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Invite teammates</h2>
            <p className="text-sm text-gray-600">
              You can invite reviewers and admins from <a className="text-brand-700 hover:underline" href="/settings/members">Members</a> after onboarding.
              Skip this step for now if you're piloting solo.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Confirm and finish</h2>
            <dl className="text-sm space-y-1">
              <Row k="Practice" v={name} />
              <Row k="Billing email" v={billingEmail || "(none)"} />
              <Row k="Recovery fee" v={`${(feeBps / 100).toFixed(1)}%`} />
            </dl>
            <p className="text-xs text-gray-500">
              You can change any of this in Settings after onboarding.
            </p>
          </>
        )}

        {err && <p className="text-sm text-error-700">{err}</p>}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={step === 0 || pending}
            onClick={() => setStep(step - 1)}
            className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30"
          >
            ← Back
          </button>
          {step < steps.length - 1 ? (
            <button
              type="button"
              disabled={pending}
              onClick={next}
              className="btn-primary disabled:opacity-50"
            >
              {pending ? "Saving…" : "Continue"}
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={finish}
              className="btn-primary disabled:opacity-50"
            >
              {pending ? "Saving…" : "Finish setup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-gray-900 font-medium">{v}</dd>
    </div>
  );
}
