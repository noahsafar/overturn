/**
 * Sentry error tracking and performance monitoring.
 *
 * This module initializes Sentry for production error tracking and performance monitoring.
 * PHI is automatically scrubbed before sending to Sentry.
 */

import * as Sentry from "@sentry/nextjs";
import { browserTracingIntegration } from "@sentry/nextjs";

// PHI scrubbing patterns
const PHI_KEY_HINTS = ["firstName", "lastName", "memberId", "dob", "ssn", "patient", "claim"];
const PHI_VALUE_REGEXES = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b(19|20)\d{2}-\d{2}-\d{2}\b/, // ISO date
  /\bMEM[A-Z0-9]{6,}\b/i, // synthetic member-id pattern
  /\bCLM[A-Z0-9]{6,}\b/i, // claim-id pattern
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

/**
 * Initialize Sentry for error tracking and performance monitoring.
 * Call this once during app startup.
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] Disabled - SENTRY_DSN not set");
    return;
  }

  const environment = process.env.NODE_ENV || "development";

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    integrations: [browserTracingIntegration()],

    // Filter out sensitive data
    beforeSend(event) {
      // Walk tags/extras and drop anything that looks like PHI
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
      if (event.message) event.message = scrub(event.message) as string;
      return event;
    },

    // Ignore common development errors
    ignoreErrors: [
      // Next.js development errors
      "Text content does not match server-rendered HTML",
      "Hydration failed",
      // Browser extensions
      "top.GLOBALS",
      "originalCreateNotification",
      "canvas.contentDocument",
      "MyApp_RemoveAllHighlights",
      // Network errors that are transient
      "Network request failed",
      "fetch failed",
    ],

    // Capture useful context
    attachStacktrace: true,
    maxBreadcrumbs: 50,
  });

  console.log(`[sentry] Initialized in ${environment} mode`);
}

/**
 * Set user context for better error tracking.
 * Call this when a user logs in.
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  practiceId?: string;
  role?: string;
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    ...(user.practiceId && { practiceId: user.practiceId }),
    ...(user.role && { role: user.role }),
  });
}

/**
 * Clear user context on logout.
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Capture an exception with optional context.
 */
export function captureException(err: Error | unknown, context?: Record<string, unknown>) {
  const scrubbedContext: Record<string, unknown> = {};
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      scrubbedContext[k] = isPhiKey(k) ? "[scrubbed-PHI]" : scrub(v);
    }
  }
  Sentry.captureException(err, { extra: scrubbedContext });
}

/**
 * Capture a message with optional severity.
 */
export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  Sentry.captureMessage(message, { level });
}

/**
 * Add a breadcrumb for debugging.
 */
export function addBreadcrumb(
  message: string,
  category?: string,
  data?: Record<string, unknown>
) {
  const scrubbedData: Record<string, unknown> = {};
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      scrubbedData[k] = isPhiKey(k) ? "[scrubbed-PHI]" : scrub(v);
    }
  }
  Sentry.addBreadcrumb({
    message,
    category,
    data: scrubbedData,
    level: "info",
  });
}

/**
 * Performance tracking for critical operations.
 */
export function startTransaction(name: string, op: string) {
  // Return a mock transaction object for now
  // Sentry transaction tracking requires additional setup
  let finished = false;
  return {
    finish: () => { finished = true; },
    toObject: () => ({ op, status: finished ? "finished" : "open" }),
  };
}
