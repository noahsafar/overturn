"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ArrowRightIcon, ClockIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { fmtMoney } from "@/lib/format";

export type DenialOutcome =
  | "WON"
  | "PARTIAL"
  | "PENDING"
  | "LOST"
  | "SUBMITTED"
  | "SKIPPED"
  | "REJECTED_BY_HUMAN";

export interface DenialRow {
  id: string;
  patientName: string;
  payer: string;
  code: string;
  cpts: string[];
  count: number;
  totalDenied: number;
  winPct: number | null;
  deadlineDays: number | null;
  outcome: DenialOutcome | null;
  confidencePct: number | null;
  tier: "P1" | "P2" | "P3" | null;
}

const outcomeStyles: Record<string, string> = {
  WON: "bg-success-50 text-success-700 ring-success-500/20",
  PARTIAL: "bg-warning-50 text-warning-700 ring-warning-500/20",
  PENDING: "bg-primary-50 text-primary-700 ring-primary-500/20",
  SUBMITTED: "bg-primary-50 text-primary-700 ring-primary-500/20",
  LOST: "bg-error-50 text-error-700 ring-error-500/20",
  REJECTED_BY_HUMAN: "bg-error-50 text-error-700 ring-error-500/20",
  SKIPPED: "bg-gray-100 text-gray-600 ring-gray-300/40",
};

const outcomeLabels: Record<string, string> = {
  WON: "Won",
  PARTIAL: "Partial",
  PENDING: "Pending",
  SUBMITTED: "Submitted",
  LOST: "Lost",
  REJECTED_BY_HUMAN: "Rejected",
  SKIPPED: "Skipped",
};

function outcomeStyle(o: string): string {
  return outcomeStyles[o] ?? "bg-gray-100 text-gray-700 ring-gray-300/40";
}
function outcomeLabel(o: string): string {
  return outcomeLabels[o] ?? o.charAt(0) + o.slice(1).toLowerCase();
}

const tierStyles: Record<"P1" | "P2" | "P3", string> = {
  P1: "bg-error-50 text-error-700 ring-error-500/30",
  P2: "bg-warning-50 text-warning-700 ring-warning-500/30",
  P3: "bg-gray-50 text-gray-600 ring-gray-300/40",
};

function deadlineLabel(days: number | null): { text: string; tone: string } {
  if (days == null) return { text: "—", tone: "text-gray-400" };
  if (days < 0) return { text: "Expired", tone: "text-error-600 font-medium" };
  if (days <= 7) return { text: `${days}d left`, tone: "text-error-600 font-medium" };
  if (days <= 30) return { text: `${days}d left`, tone: "text-warning-700" };
  return { text: `${days}d left`, tone: "text-gray-500" };
}

const TIERS = ["all", "P1", "P2", "P3"] as const;
type TierFilter = (typeof TIERS)[number];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "unworked", label: "Unworked" },
  { value: "PENDING", label: "Pending" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "WON", label: "Won" },
  { value: "PARTIAL", label: "Partial" },
  { value: "LOST", label: "Lost" },
  { value: "REJECTED_BY_HUMAN", label: "Rejected" },
  { value: "SKIPPED", label: "Skipped" },
];

export function DenialsExplorer({ rows }: { rows: DenialRow[] }) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tier !== "all" && r.tier !== tier) return false;
      if (status === "unworked" && r.outcome !== null) return false;
      if (status !== "all" && status !== "unworked" && r.outcome !== status) return false;
      if (needle) {
        const hay = `${r.patientName} ${r.payer} ${r.code} ${r.cpts.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, tier, status]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search patient, payer, or code…"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </div>

        <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white p-0.5">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tier === t
                  ? "bg-gray-900 text-white shadow-soft"
                  : "text-gray-600 hover:text-gray-900",
              )}
            >
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between px-0.5 text-xs text-gray-500">
        <span>
          Showing {filtered.length} of {rows.length}
        </span>
        {(q || tier !== "all" || status !== "all") && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setTier("all");
              setStatus("all");
            }}
            className="font-medium text-primary-600 hover:text-primary-700"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Payer</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 text-right font-medium">Denied</th>
                <th className="px-4 py-3 text-right font-medium">Win prob</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500">
                    No denials match these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const dl = deadlineLabel(r.deadlineDays);
                  return (
                    <tr key={r.id} className="group hover:bg-gray-50/70">
                      <td className="px-4 py-3">
                        {r.tier ? (
                          <span className={`badge ${tierStyles[r.tier]}`}>{r.tier}</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {r.patientName || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{r.payer}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-600">{r.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        {r.cpts.length > 0 ? (
                          <span className="font-mono text-xs text-gray-700">
                            {r.cpts.join(", ")}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                        {r.count > 1 && (
                          <span className="ml-2 text-xs text-gray-500">({r.count} services)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                        {fmtMoney(r.totalDenied)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {r.winPct != null ? `${r.winPct}%` : "—"}
                      </td>
                      <td className={`px-4 py-3 text-xs tabular-nums ${dl.tone}`}>
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="h-3.5 w-3.5" />
                          {dl.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.outcome ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className={`badge ${outcomeStyle(r.outcome)}`}>
                              {outcomeLabel(r.outcome)}
                            </span>
                            {r.confidencePct != null && (
                              <span className="text-xs tabular-nums text-gray-500">
                                {r.confidencePct}% conf
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="badge bg-gray-100 text-gray-700 ring-gray-300/40">
                            Unworked
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/denials/${r.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          View <ArrowRightIcon className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
