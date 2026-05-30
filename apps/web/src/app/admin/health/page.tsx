import { prisma } from "@overturn/db";

export const dynamic = "force-dynamic";

interface CheckResult {
  name: string;
  status: "ok" | "stub" | "missing" | "error";
  detail: string;
}

async function probeWorker(): Promise<CheckResult> {
  const url = `${process.env.WORKER_INTERNAL_URL ?? "http://localhost:8001"}/healthz`;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      return { name: "Worker (FastAPI + Temporal)", status: "ok", detail: url };
    }
    return { name: "Worker (FastAPI + Temporal)", status: "error", detail: `HTTP ${r.status} at ${url}` };
  } catch (e) {
    return { name: "Worker (FastAPI + Temporal)", status: "error", detail: (e as Error).message };
  }
}

async function probeDb(): Promise<CheckResult> {
  try {
    const r = await prisma.$queryRawUnsafe<Array<{ ok: number }>>("SELECT 1 as ok");
    if (r[0]?.ok === 1) return { name: "Postgres", status: "ok", detail: "responsive" };
    return { name: "Postgres", status: "error", detail: "unexpected response" };
  } catch (e) {
    return { name: "Postgres", status: "error", detail: (e as Error).message };
  }
}

function probeEnv(key: string, name: string, baseUrl?: string): CheckResult {
  const v = process.env[key];
  if (v) {
    return { name, status: "ok", detail: `${key} set${baseUrl ? ` · ${baseUrl}` : ""}` };
  }
  return { name, status: "stub", detail: `${key} unset — running in stub mode` };
}

function probeAuth(): CheckResult {
  if (process.env.CLERK_SECRET_KEY) {
    return { name: "Clerk auth", status: "ok", detail: "live (HIPAA tier required)" };
  }
  return {
    name: "Clerk auth",
    status: "stub",
    detail: process.env.DEV_AUTH === "true"
      ? "DEV_AUTH on — stub user"
      : "no key + no DEV_AUTH — site will 401",
  };
}

function probePhiKey(): CheckResult {
  if (process.env.PHI_ENC_KEY) {
    return { name: "PHI encryption key", status: "ok", detail: "set (rotate quarterly)" };
  }
  return { name: "PHI encryption key", status: "missing", detail: "PHI_ENC_KEY unset — PHI will be unreadable" };
}

export default async function HealthPage() {
  const [worker, db] = await Promise.all([probeWorker(), probeDb()]);
  const checks: CheckResult[] = [
    db,
    worker,
    probeAuth(),
    probePhiKey(),
    probeEnv("ANTHROPIC_API_KEY", "Anthropic (LLM)"),
    probeEnv("STRIPE_SECRET_KEY", "Stripe (billing)"),
    probeEnv("DOCUMO_API_KEY", "Documo (eFax)"),
    probeEnv("LOB_API_KEY", "Lob (mail-house)"),
    probeEnv("RESEND_API_KEY", "Resend (email)"),
    probeEnv("BROWSERBASE_API_KEY", "Browserbase (portal automation)"),
    probeEnv("INTERNAL_SHARED_SECRET", "Internal worker↔web auth"),
    probeEnv("OVERTURN_ADMIN_EMAILS", "Admin allowlist"),
  ];

  const okCount = checks.filter((c) => c.status === "ok").length;
  const stubCount = checks.filter((c) => c.status === "stub").length;
  const errorCount = checks.filter((c) => c.status === "error" || c.status === "missing").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Integration health</h1>
        <p className="mt-1 text-sm text-gray-500">
          What's live, what's stubbed, what's broken. Stubbed integrations work
          end-to-end with synthetic data; production needs real keys + BAAs.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500">Live</div>
          <div className="mt-2 text-3xl font-semibold text-success-700 tabular-nums">{okCount}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500">Stubbed</div>
          <div className="mt-2 text-3xl font-semibold text-warning-700 tabular-nums">{stubCount}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500">Broken / missing</div>
          <div className="mt-2 text-3xl font-semibold text-error-700 tabular-nums">{errorCount}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-medium">Integration</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {checks.map((c) => (
              <tr key={c.name}>
                <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-5 py-3">
                  <Badge status={c.status} />
                </td>
                <td className="px-5 py-3 text-gray-600 font-mono text-xs">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({ status }: { status: CheckResult["status"] }) {
  const styles: Record<CheckResult["status"], string> = {
    ok: "bg-success-50 text-success-700 ring-success-500/20",
    stub: "bg-warning-50 text-warning-700 ring-warning-500/20",
    missing: "bg-error-50 text-error-700 ring-error-500/20",
    error: "bg-error-50 text-error-700 ring-error-500/20",
  };
  return <span className={`badge ${styles[status]}`}>{status}</span>;
}
