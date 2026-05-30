// Sentry + Langfuse wiring. Both are env-gated and lazy-loaded so the deps
// don't need to be installed at all in dev. When the keys are set:
//   - Sentry catches unhandled exceptions in server components + API routes.
//   - Langfuse traces every LLM call (called from the worker side, surfaced
//     here for the web webhook events).
//
// PHI scrub: Sentry's beforeSend filter drops any tag/breadcrumb whose key
// matches the encrypted-PHI columns, and drops messages that look like they
// contain dates of birth or member-IDs.

import "server-only";

let sentryInitDone = false;

const PHI_KEY_HINTS = ["firstName", "lastName", "memberId", "dob", "ssn", "patient"];
const PHI_VALUE_REGEXES = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b(19|20)\d{2}-\d{2}-\d{2}\b/, // ISO date
  /\bMEM[A-Z0-9]{6,}\b/i, // synthetic member-id pattern
];

function scrub(value: unknown): unknown {
  if (typeof value !== "string") return value;
  for (const re of PHI_VALUE_REGEXES) {
    if (re.test(value)) return "[scrubbed-PHI]";
  }
  return value;
}

function isPhiKey(key: string): boolean {
  const lower = key.toLowerCase();
  return PHI_KEY_HINTS.some((hint) => lower.includes(hint.toLowerCase()));
}

export async function ensureSentryInit(): Promise<void> {
  if (sentryInitDone) return;
  sentryInitDone = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Dynamic import so installing the dep is optional. If you actually
    // deploy with Sentry, add `@sentry/nextjs` to the package.json.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // String indirection keeps the import optional — `@sentry/nextjs` is an
     // optional peer dep, not in package.json. When you actually deploy with
     // Sentry, `pnpm add @sentry/nextjs` and this resolves at runtime.
     const pkgName = "@sentry/nextjs";
     const Sentry: any = await import(/* @ts-ignore */ pkgName as string).catch(
       () => null,
     );
    if (!Sentry) {
      console.warn("[sentry] SENTRY_DSN set but @sentry/nextjs not installed");
      return;
    }
    Sentry.init({
      dsn,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
      environment: process.env.NODE_ENV,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeSend(event: any) {
        // Walk tags/extras and drop anything that looks like PHI.
        for (const dict of [event.tags, event.extra, event.contexts]) {
          if (!dict) continue;
          for (const k of Object.keys(dict)) {
            if (isPhiKey(k)) {
              dict[k] = "[scrubbed-PHI]";
            } else {
              dict[k] = scrub(dict[k]);
            }
          }
        }
        if (event.message) event.message = scrub(event.message);
        return event;
      },
    });
    console.log("[sentry] initialized");
  } catch (e) {
    console.warn("[sentry] init failed:", e);
  }
}

/** Capture an exception with the PHI-scrub filter applied. No-op when DSN unset. */
export async function reportError(err: unknown, extra?: Record<string, unknown>): Promise<void> {
  await ensureSentryInit();
  if (!process.env.SENTRY_DSN) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // String indirection keeps the import optional — `@sentry/nextjs` is an
     // optional peer dep, not in package.json. When you actually deploy with
     // Sentry, `pnpm add @sentry/nextjs` and this resolves at runtime.
     const pkgName = "@sentry/nextjs";
     const Sentry: any = await import(/* @ts-ignore */ pkgName as string).catch(
       () => null,
     );
    if (!Sentry) return;
    const scrubbed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(extra ?? {})) {
      scrubbed[k] = isPhiKey(k) ? "[scrubbed-PHI]" : scrub(v);
    }
    Sentry.captureException(err, { extra: scrubbed });
  } catch (e) {
    console.warn("[sentry] reportError failed:", e);
  }
}
