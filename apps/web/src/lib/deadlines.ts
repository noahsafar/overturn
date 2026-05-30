// Filing-deadline helpers.
//
// Per-payer appeal windows are tracked on Payer.appealWindowDays (default 180).
// For any denial we compute its filing deadline at ingest time so:
//   1. The reviewer sees a "X days remaining" warning on the denial/appeal pages.
//   2. We can refuse to submit an appeal past the deadline (defense in depth —
//      the payer will reject it anyway, but better to fail in our system than
//      tie up an agent run to find out from them).

export const DEFAULT_APPEAL_WINDOW_DAYS = 180;

export interface DeadlineState {
  deadline: Date;
  daysRemaining: number;
  pastDue: boolean;
  // True when the deadline is within 14 days — show prominent warning.
  warn: boolean;
}

export function computeFilingDeadline(
  receivedAt: Date,
  appealWindowDays: number = DEFAULT_APPEAL_WINDOW_DAYS,
): Date {
  const d = new Date(receivedAt);
  d.setDate(d.getDate() + appealWindowDays);
  return d;
}

export function deadlineState(deadline: Date | null | undefined): DeadlineState | null {
  if (!deadline) return null;
  const now = Date.now();
  const ms = deadline.getTime() - now;
  const daysRemaining = Math.ceil(ms / 86_400_000);
  return {
    deadline,
    daysRemaining,
    pastDue: daysRemaining < 0,
    warn: daysRemaining <= 14,
  };
}
