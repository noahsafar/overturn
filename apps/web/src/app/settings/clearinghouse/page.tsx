import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { ClearinghouseForm } from "./ClearinghouseForm";
import { fmtDateTime } from "@/lib/format";
import { CheckCircleIcon, ExclamationTriangleIcon, ClockIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

export default async function ClearinghousePage() {
  const user = await requireUser();
  const p = await prisma.practice.findUnique({
    where: { id: user.practiceId },
    select: {
      clearinghouseEnabled: true,
      clearinghouseSftpHost: true,
      clearinghouseSftpUser: true,
      clearinghouseSftpPathEnc: true,
      clearinghouseLastPolledAt: true,
      clearinghouseLastSuccessAt: true,
      clearinghouseLastError: true,
    },
  });

  const enabled = p?.clearinghouseEnabled ?? false;
  const hasSecret = !!p?.clearinghouseSftpPathEnc;
  const lastPolled = p?.clearinghouseLastPolledAt ?? null;
  const lastSuccess = p?.clearinghouseLastSuccessAt ?? null;
  const lastError = p?.clearinghouseLastError ?? null;

  const statusTone =
    !enabled
      ? "gray"
      : lastError
        ? "error"
        : lastSuccess
          ? "success"
          : "warning";
  const statusLabel =
    !enabled
      ? "Disabled"
      : lastError
        ? "Errored on last poll"
        : lastSuccess
          ? "Healthy"
          : "Awaiting first poll";

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Clearinghouse</h1>
        <p className="mt-1 text-sm text-gray-500">
          Auto-ingest 835 ERAs from your clearinghouse SFTP drop. New denials are
          parsed, scored, and surface on the Denials list every poll cycle.
        </p>
      </header>

      {/* Status band */}
      <section
        className={`card p-5 border-l-4 ${
          statusTone === "success"
            ? "border-l-success-500"
            : statusTone === "error"
              ? "border-l-error-500"
              : statusTone === "warning"
                ? "border-l-warning-500"
                : "border-l-gray-300"
        }`}
      >
        <div className="flex items-start gap-3">
          {statusTone === "success" ? (
            <CheckCircleIcon className="h-5 w-5 text-success-600 mt-0.5" />
          ) : statusTone === "error" ? (
            <ExclamationTriangleIcon className="h-5 w-5 text-error-600 mt-0.5" />
          ) : (
            <ClockIcon className="h-5 w-5 text-gray-400 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-semibold text-gray-900">{statusLabel}</div>
            <div className="mt-1 text-sm text-gray-600 space-y-0.5">
              <div>
                Last polled: <span className="tabular-nums">{lastPolled ? fmtDateTime(lastPolled) : "never"}</span>
              </div>
              <div>
                Last successful ingest: <span className="tabular-nums">{lastSuccess ? fmtDateTime(lastSuccess) : "never"}</span>
              </div>
              {lastError && (
                <div className="mt-2 rounded bg-error-50 px-2 py-1 text-xs text-error-800 font-mono whitespace-pre-wrap">
                  {lastError}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900">SFTP credentials</h2>
        <p className="mt-1 text-xs text-gray-500">
          Most clearinghouses expose ERAs at a per-tenant SFTP location. Use the
          host + path your clearinghouse provided. Either a password or an SSH
          private key works.
        </p>
        <ClearinghouseForm
          initial={{
            enabled,
            host: p?.clearinghouseSftpHost ?? "",
            user: p?.clearinghouseSftpUser ?? "",
            hasSecret,
          }}
        />
      </section>

      <section className="card p-5 text-xs text-gray-500 space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">How it works</h3>
        <p>
          The worker polls every 5 minutes. It pulls every file in the configured
          path, parses it as an 835, matches paid claims against open appeals to
          record outcomes, and moves the file to <code className="font-mono">processed/</code> so it
          isn't re-ingested. Failures move to <code className="font-mono">failed/</code> and
          surface in the error banner above.
        </p>
        <p>
          Credentials are encrypted at rest with the practice-scoped PHI key.
          They never leave the worker and are not logged.
        </p>
      </section>
    </div>
  );
}
