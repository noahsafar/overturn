// Notifications — high-level "notify owner that appeal X was recovered" etc.
//
// Persists a Notification row first (so we have an audit trail), then
// fires the email. If email send fails, we mark FAILED and surface in the
// audit log without retrying — keep retry policy explicit in the caller.

import "server-only";
import { prisma } from "@overturn/db";
import { sendEmail } from "./email";

export type NotificationTemplate =
  | "appeal.ready_for_review"
  | "appeal.recovered"
  | "appeal.lost"
  | "invoice.issued"
  | "invoice.paid";

export interface NotifyInput {
  practiceId: string;
  template: NotificationTemplate;
  recipient: string;
  subject: string;
  body: string;
  htmlBody?: string;
}

export async function notify(input: NotifyInput): Promise<{ id: string }> {
  const row = await prisma.notification.create({
    data: {
      practiceId: input.practiceId,
      channel: "EMAIL",
      template: input.template,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      status: "QUEUED",
    },
  });

  try {
    const sent = await sendEmail({
      to: input.recipient,
      subject: input.subject,
      text: input.body,
      html: input.htmlBody,
    });
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        providerRef: sent.providerRef,
        sentAt: new Date(),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.notification.update({
      where: { id: row.id },
      data: { status: "FAILED", errorMessage: msg.slice(0, 500) },
    });
    throw e;
  }

  return { id: row.id };
}

/** Notify all practice users with role STAFF+ that an appeal is ready. */
export async function notifyAppealReady(appealId: string): Promise<void> {
  const a = await prisma.appeal.findFirst({
    where: { id: appealId },
    include: {
      denial: { include: { claim: { include: { practice: { include: { users: true } } } } } },
    },
  });
  if (!a) return;
  const practice = a.denial.claim.practice;
  const reviewers = practice.users.filter((u) => u.role !== "STAFF" || true); // all roles can review
  for (const user of reviewers) {
    try {
      await notify({
        practiceId: practice.id,
        template: "appeal.ready_for_review",
        recipient: user.email,
        subject: `Appeal ready for review — ${practice.name}`,
        body: `An appeal draft is ready for review.\n\nOpen it: ${baseUrl()}/appeals/${a.id}`,
      });
    } catch (e) {
      console.error("[notify] appeal.ready_for_review failed:", e);
    }
  }
}

export async function notifyOutcome(appealId: string): Promise<void> {
  const a = await prisma.appeal.findFirst({
    where: { id: appealId },
    include: {
      denial: { include: { claim: { include: { practice: { include: { users: true } } } } } },
    },
  });
  if (!a) return;
  const practice = a.denial.claim.practice;
  const owner = practice.users.find((u) => u.role === "OWNER") ?? practice.users[0];
  if (!owner) return;
  const isWin = a.outcome === "WON" || a.outcome === "PARTIAL";
  await notify({
    practiceId: practice.id,
    template: isWin ? "appeal.recovered" : "appeal.lost",
    recipient: owner.email,
    subject: isWin
      ? `Recovery: $${a.recoveredAmount} on appeal ${a.id.slice(-8)}`
      : `Appeal denied — ${a.id.slice(-8)}`,
    body: isWin
      ? `Good news: an appeal was recovered.\n\nAmount: $${a.recoveredAmount}\nOur fee: $${a.ourFee}\nDetails: ${baseUrl()}/appeals/${a.id}`
      : `An appeal came back denied. Review the outcome: ${baseUrl()}/appeals/${a.id}`,
  });
}

export async function notifyInvoiceIssued(invoiceId: string): Promise<void> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { practice: true },
  });
  if (!inv?.practice.billingEmail) return;
  await notify({
    practiceId: inv.practiceId,
    template: "invoice.issued",
    recipient: inv.practice.billingEmail,
    subject: `Invoice from Overturn — $${(inv.totalCents / 100).toFixed(2)}`,
    body:
      `Your recovery-fee invoice is ready.\n\n` +
      `Period: ${inv.periodStart.toISOString().slice(0, 10)} – ${inv.periodEnd.toISOString().slice(0, 10)}\n` +
      `Total: $${(inv.totalCents / 100).toFixed(2)}\n` +
      (inv.stripeHostedUrl ? `Pay online: ${inv.stripeHostedUrl}\n` : "") +
      `Detail: ${baseUrl()}/invoices/${inv.id}`,
  });
}

function baseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
