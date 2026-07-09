// POST /api/internal/cron/deadline-scan — alert practices about denials whose
// filing deadline is approaching with no submitted appeal.
//
// Called by the worker's daily loop (or any external cron). Idempotent: a
// given denial alerts at most once per 7 days, deduped via the Notification
// resourceId column, so the schedule can fire as often as it likes.
//
// Authn: same shared-secret header as /api/internal/notify.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@overturn/db";
import { notify } from "@/lib/notifications";

const WARN_WINDOW_DAYS = 14;
const DEDUPE_DAYS = 7;

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (secret) {
    if (req.headers.get("x-internal-secret") !== secret) {
      return new NextResponse("forbidden", { status: 403 });
    }
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + WARN_WINDOW_DAYS * 86_400_000);
  const dedupeSince = new Date(now.getTime() - DEDUPE_DAYS * 86_400_000);

  // Denials at risk: deadline inside the window, and no appeal has actually
  // been submitted (a drafted-but-unreviewed appeal still loses the claim if
  // nobody clicks approve before the deadline).
  const atRisk = await prisma.denial.findMany({
    where: {
      filingDeadline: { gt: now, lte: windowEnd },
      appeals: { none: { submittedAt: { not: null } } },
    },
    include: {
      claim: {
        include: {
          payer: { select: { name: true } },
          practice: { include: { users: true } },
        },
      },
      appeals: { select: { id: true }, take: 1 },
    },
    take: 500,
  });

  let alerted = 0;
  let deduped = 0;

  for (const d of atRisk) {
    const already = await prisma.notification.findFirst({
      where: {
        template: "denial.deadline_warning",
        resourceId: d.id,
        createdAt: { gte: dedupeSince },
      },
      select: { id: true },
    });
    if (already) {
      deduped++;
      continue;
    }

    const practice = d.claim.practice;
    const daysLeft = Math.ceil(
      (d.filingDeadline!.getTime() - now.getTime()) / 86_400_000,
    );
    const amount = Number(d.deniedAmount).toFixed(2);
    const hasDraft = d.appeals.length > 0;
    const recipients = practice.users.filter((u) => u.role !== "STAFF");

    for (const u of recipients.length > 0 ? recipients : practice.users) {
      try {
        await notify({
          practiceId: practice.id,
          template: "denial.deadline_warning",
          recipient: u.email,
          subject: `${daysLeft} day(s) left to appeal $${amount} — ${d.claim.payer.name}`,
          body:
            (hasDraft
              ? `A drafted appeal is waiting for review and the filing window closes in ${daysLeft} day(s).`
              : `A denial has not been appealed and the filing window closes in ${daysLeft} day(s).`) +
            `\n\nDenied: $${amount} (${d.denialCode})\nAct now: ${baseUrl()}/denials/${d.id}`,
          resourceId: d.id,
        });
      } catch (e) {
        console.error("[deadline-scan] notify failed:", e);
      }
    }
    alerted++;
  }

  return NextResponse.json({ scanned: atRisk.length, alerted, deduped });
}

function baseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
