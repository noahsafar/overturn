// Denial-pattern analytics dashboard.
//
// "Where is money leaking?" — surfaces top denial categories, the payers
// driving them, the CPT codes most affected, rolling win rate by week, and
// the dollar value sitting unappealed.
//
// Single SSR page. All queries are bounded to the current practice and
// limited to last 12 months so a heavy database doesn't make this slow.

import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import { lookupCarcReason } from "@/lib/carc-codes";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 365;
const TOP_N = 10;

interface LeakRow {
  denialCode: string;
  reason: string;
  payer: string;
  count: number;
  totalDenied: number;
  expectedRecovery: number;
  appealedRate: number;
  winRate: number | null;
}

interface CptRow {
  cpt: string;
  payer: string;
  count: number;
  totalDenied: number;
}

interface WeekRow {
  weekStart: string;
  total: number;
  won: number;
  partial: number;
  lost: number;
  pending: number;
}

interface DeadlineBucket {
  label: string;
  count: number;
  totalDenied: number;
}

export default async function AnalyticsPage() {
  const user = await requireUser();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const denials = await prisma.denial.findMany({
    where: {
      claim: { practiceId: user.practiceId },
      receivedAt: { gte: since },
    },
    select: {
      id: true,
      denialCode: true,
      deniedAmount: true,
      receivedAt: true,
      filingDeadline: true,
      serviceCpt: true,
      predictedWinProb: true,
      priorityTier: true,
      claim: {
        select: {
          payerId: true,
          payer: { select: { name: true } },
          renderingProvider: true,
        },
      },
      appeals: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          outcome: true,
          submittedAt: true,
          createdAt: true,
        },
      },
    },
    take: 5000,
  });

  const moneyByTier = { P1: 0, P2: 0, P3: 0, Unscored: 0 } as Record<string, number>;
  for (const d of denials) {
    if (d.appeals[0]) continue;
    const t = d.priorityTier ?? "Unscored";
    moneyByTier[t] = (moneyByTier[t] ?? 0) + Number(d.deniedAmount);
  }

  // ── Top leak points: group by (denialCode, payer) ───────────────────────
  const leakMap = new Map<string, LeakRow>();
  for (const d of denials) {
    const key = `${d.denialCode}::${d.claim.payerId}`;
    const amt = Number(d.deniedAmount);
    const r =
      leakMap.get(key) ?? {
        denialCode: d.denialCode,
        reason: lookupCarcReason(d.denialCode) ?? `Denial code ${d.denialCode}`,
        payer: d.claim.payer.name,
        count: 0,
        totalDenied: 0,
        expectedRecovery: 0,
        appealedRate: 0,
        winRate: null,
      };
    r.count += 1;
    r.totalDenied += amt;
    r.expectedRecovery += amt * (d.predictedWinProb ?? 0);
    leakMap.set(key, r);
  }
  // Second pass for appeal/win rates.
  for (const r of leakMap.values()) {
    const matched = denials.filter(
      (d) =>
        d.denialCode === r.denialCode &&
        d.claim.payer.name === r.payer,
    );
    const appealed = matched.filter((d) => d.appeals[0]);
    r.appealedRate = matched.length > 0 ? appealed.length / matched.length : 0;
    const decided = appealed.filter((d) => ["WON", "LOST", "PARTIAL"].includes(d.appeals[0]!.outcome));
    if (decided.length >= 3) {
      const wins =
        decided.filter((d) => d.appeals[0]!.outcome === "WON").length +
        decided.filter((d) => d.appeals[0]!.outcome === "PARTIAL").length * 0.5;
      r.winRate = wins / decided.length;
    }
  }
  const leakRows = [...leakMap.values()]
    .sort((a, b) => b.totalDenied - a.totalDenied)
    .slice(0, TOP_N);

  // ── Top CPT × payer ─────────────────────────────────────────────────────
  const cptMap = new Map<string, CptRow>();
  for (const d of denials) {
    if (!d.serviceCpt) continue;
    const key = `${d.serviceCpt}::${d.claim.payerId}`;
    const r =
      cptMap.get(key) ?? {
        cpt: d.serviceCpt,
        payer: d.claim.payer.name,
        count: 0,
        totalDenied: 0,
      };
    r.count += 1;
    r.totalDenied += Number(d.deniedAmount);
    cptMap.set(key, r);
  }
  const cptRows = [...cptMap.values()]
    .sort((a, b) => b.totalDenied - a.totalDenied)
    .slice(0, TOP_N);

  // ── Rolling weekly win rate (last 12 weeks) ─────────────────────────────
  const weeks: WeekRow[] = [];
  const todayMs = Date.now();
  for (let i = 11; i >= 0; i--) {
    const end = todayMs - i * 7 * 86_400_000;
    const start = end - 7 * 86_400_000;
    const w = denials.filter(
      (d) =>
        d.receivedAt.getTime() >= start && d.receivedAt.getTime() < end,
    );
    const total = w.length;
    const outcomes = w.map((d) => d.appeals[0]?.outcome ?? "—");
    weeks.push({
      weekStart: new Date(start).toISOString().slice(0, 10),
      total,
      won: outcomes.filter((o) => o === "WON").length,
      partial: outcomes.filter((o) => o === "PARTIAL").length,
      lost: outcomes.filter((o) => o === "LOST").length,
      pending: outcomes.filter((o) => o === "PENDING").length,
    });
  }

  // ── Deadline-pressure buckets ───────────────────────────────────────────
  const buckets: DeadlineBucket[] = [
    { label: "Expired", count: 0, totalDenied: 0 },
    { label: "<7 days", count: 0, totalDenied: 0 },
    { label: "7-30 days", count: 0, totalDenied: 0 },
    { label: "30-90 days", count: 0, totalDenied: 0 },
    { label: "90+ days", count: 0, totalDenied: 0 },
    { label: "Unknown", count: 0, totalDenied: 0 },
  ];
  for (const d of denials) {
    if (d.appeals[0]) continue;
    const amt = Number(d.deniedAmount);
    if (!d.filingDeadline) {
      buckets[5]!.count += 1;
      buckets[5]!.totalDenied += amt;
      continue;
    }
    const days = Math.floor((d.filingDeadline.getTime() - todayMs) / 86_400_000);
    const i =
      days < 0 ? 0 : days <= 7 ? 1 : days <= 30 ? 2 : days <= 90 ? 3 : 4;
    buckets[i]!.count += 1;
    buckets[i]!.totalDenied += amt;
  }

  // ── Provider leak ────────────────────────────────────────────────────────
  const providerMap = new Map<string, { name: string; count: number; total: number }>();
  for (const d of denials) {
    const name = d.claim.renderingProvider?.trim() || "(unspecified)";
    const r = providerMap.get(name) ?? { name, count: 0, total: 0 };
    r.count += 1;
    r.total += Number(d.deniedAmount);
    providerMap.set(name, r);
  }
  const providerRows = [...providerMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const totalDenied = denials.reduce((s, d) => s + Number(d.deniedAmount), 0);
  const unworkedExpected = denials
    .filter((d) => !d.appeals[0])
    .reduce((s, d) => s + Number(d.deniedAmount) * (d.predictedWinProb ?? 0), 0);
  const appealedCount = denials.filter((d) => d.appeals[0]).length;
  const appealedRate = denials.length > 0 ? appealedCount / denials.length : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Where money is leaking · last {WINDOW_DAYS} days · {denials.length.toLocaleString()} denials
        </p>
      </header>

      {/* Headline stat band */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total denied" value={fmtMoney(totalDenied)} tone="gray" />
        <Stat
          label="Unappealed expected recovery"
          value={fmtMoney(unworkedExpected)}
          tone="success"
        />
        <Stat label="Appeal-rate" value={`${Math.round(appealedRate * 100)}%`} tone="primary" />
        <Stat label="Unique payers" value={String(new Set(denials.map((d) => d.claim.payerId)).size)} tone="gray" />
      </section>

      {/* Money on the table by tier */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900">Unappealed money on the table by tier</h2>
        <p className="text-xs text-gray-500 mt-0.5">Sum of denied amounts not yet appealed, grouped by priority tier.</p>
        <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
          <TierBox tier="P1" total={moneyByTier.P1 ?? 0} />
          <TierBox tier="P2" total={moneyByTier.P2 ?? 0} />
          <TierBox tier="P3" total={moneyByTier.P3 ?? 0} />
          <TierBox tier="Unscored" total={moneyByTier.Unscored ?? 0} />
        </div>
      </section>

      {/* Top leak points */}
      <section className="card overflow-hidden">
        <div className="p-5 pb-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Top leak points by denial code × payer</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Where you're losing the most. Low appeal-rate + high $ = an obvious win.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Payer</th>
              <th className="px-4 py-2 text-right font-medium">Count</th>
              <th className="px-4 py-2 text-right font-medium">Total denied</th>
              <th className="px-4 py-2 text-right font-medium">Expected recovery</th>
              <th className="px-4 py-2 text-right font-medium">Appealed</th>
              <th className="px-4 py-2 text-right font-medium">Win rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leakRows.map((r) => (
              <tr key={`${r.denialCode}-${r.payer}`} className="hover:bg-gray-50/70">
                <td className="px-4 py-2 font-mono text-xs">{r.denialCode}</td>
                <td className="px-4 py-2 text-gray-700 max-w-md truncate" title={r.reason}>
                  {r.reason}
                </td>
                <td className="px-4 py-2 text-gray-700">{r.payer}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(r.totalDenied)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-success-700">
                  {fmtMoney(r.expectedRecovery)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{Math.round(r.appealedRate * 100)}%</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.winRate != null ? `${Math.round(r.winRate * 100)}%` : "—"}
                </td>
              </tr>
            ))}
            {leakRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                  No denials in this window yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top CPT × payer */}
        <section className="card overflow-hidden">
          <div className="p-5 pb-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Top CPT × payer</h2>
            <p className="text-xs text-gray-500 mt-0.5">Services getting denied the most by payer.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">CPT</th>
                <th className="px-4 py-2 font-medium">Payer</th>
                <th className="px-4 py-2 text-right font-medium">Count</th>
                <th className="px-4 py-2 text-right font-medium">Denied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cptRows.map((r) => (
                <tr key={`${r.cpt}-${r.payer}`}>
                  <td className="px-4 py-2 font-mono text-xs">{r.cpt}</td>
                  <td className="px-4 py-2 text-gray-700">{r.payer}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(r.totalDenied)}</td>
                </tr>
              ))}
              {cptRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                    No CPT-coded denials yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Deadline pressure */}
        <section className="card overflow-hidden">
          <div className="p-5 pb-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Unappealed by deadline</h2>
            <p className="text-xs text-gray-500 mt-0.5">Filing-deadline pressure on unworked denials.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Bucket</th>
                <th className="px-4 py-2 text-right font-medium">Denials</th>
                <th className="px-4 py-2 text-right font-medium">$</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {buckets.map((b) => (
                <tr key={b.label} className={b.label === "Expired" || b.label === "<7 days" ? "bg-error-50/40" : ""}>
                  <td className="px-4 py-2 text-gray-700">{b.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{b.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(b.totalDenied)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* Weekly trend */}
      <section className="card p-5 overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-900">Rolling 12-week denial volume</h2>
        <p className="text-xs text-gray-500 mt-0.5">Bar = total denials received that week. Color = appeal outcome.</p>
        <WeeklyBars weeks={weeks} />
      </section>

      {/* Provider leak */}
      {providerRows.length > 0 && (
        <section className="card overflow-hidden">
          <div className="p-5 pb-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Rendering provider denial volume</h2>
            <p className="text-xs text-gray-500 mt-0.5">Spikes here often point to documentation or coding gaps.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 text-right font-medium">Denials</th>
                <th className="px-4 py-2 text-right font-medium">$</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {providerRows.map((p) => (
                <tr key={p.name}>
                  <td className="px-4 py-2 text-gray-700">{p.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "gray" | "primary" | "success";
}) {
  const styles =
    tone === "success"
      ? "text-success-700"
      : tone === "primary"
        ? "text-primary-700"
        : "text-gray-900";
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${styles}`}>{value}</div>
    </div>
  );
}

function TierBox({ tier, total }: { tier: string; total: number }) {
  const tone =
    tier === "P1"
      ? "border-error-200 bg-error-50 text-error-800"
      : tier === "P2"
        ? "border-warning-200 bg-warning-50 text-warning-800"
        : "border-gray-200 bg-gray-50 text-gray-700";
  return (
    <div className={`border rounded p-3 ${tone}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{tier}</div>
      <div className="font-semibold text-lg tabular-nums mt-0.5">{fmtMoney(total)}</div>
    </div>
  );
}

function WeeklyBars({ weeks }: { weeks: WeekRow[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.total));
  return (
    <div className="mt-4 flex items-end gap-2 h-40">
      {weeks.map((w) => {
        const h = (w.total / max) * 100;
        return (
          <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col-reverse" style={{ height: `${h}%` }}>
              <div
                className="bg-success-400"
                style={{ height: `${w.total > 0 ? (w.won / w.total) * 100 : 0}%` }}
                title={`Won: ${w.won}`}
              />
              <div
                className="bg-warning-300"
                style={{ height: `${w.total > 0 ? (w.partial / w.total) * 100 : 0}%` }}
                title={`Partial: ${w.partial}`}
              />
              <div
                className="bg-primary-300"
                style={{ height: `${w.total > 0 ? (w.pending / w.total) * 100 : 0}%` }}
                title={`Pending: ${w.pending}`}
              />
              <div
                className="bg-error-300"
                style={{ height: `${w.total > 0 ? (w.lost / w.total) * 100 : 0}%` }}
                title={`Lost: ${w.lost}`}
              />
              <div className="bg-gray-300 flex-1" title="Not appealed" />
            </div>
            <div className="text-[10px] text-gray-500 tabular-nums">{w.weekStart.slice(5)}</div>
          </div>
        );
      })}
    </div>
  );
}
