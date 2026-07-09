// Autopilot — policy-gated automatic submission of appeal drafts.
//
// Runs when the worker reports a draft is READY (via /api/internal/notify).
// If the practice has Autopilot enabled and the draft clears every guardrail,
// we submit it immediately and tell the practice it happened. If any check
// fails — or the worker submit call fails — the appeal falls back to the
// normal human-review path, so Autopilot can never lose an appeal, only
// occasionally decline to speed one up.
//
// Guardrails (all must pass):
//   - practice.autoPilotEnabled
//   - draft status READY with a letter and PENDING outcome, not yet submitted
//   - verified confidence >= practice.autoPilotMinConfidence
//   - denied amount <= practice.autoPilotMaxAmountCents (when a cap is set)
//   - filing deadline not passed

import "server-only";
import { prisma } from "@overturn/db";
import { worker } from "./worker";
import { notify } from "./notifications";

export type AutopilotDecision =
  | { action: "submitted" }
  | { action: "declined"; reason: string }
  | { action: "failed"; reason: string };

export async function runAutopilot(appealId: string): Promise<AutopilotDecision> {
  const appeal = await prisma.appeal.findUnique({
    where: { id: appealId },
    include: {
      denial: {
        include: {
          claim: { include: { practice: { include: { users: true } }, payer: true } },
        },
      },
    },
  });
  if (!appeal) return { action: "declined", reason: "appeal not found" };

  const practice = appeal.denial.claim.practice;

  if (!practice.autoPilotEnabled) {
    return { action: "declined", reason: "autopilot disabled" };
  }
  if (appeal.status !== "READY" || !appeal.draftLetter) {
    return { action: "declined", reason: `draft not ready (status=${appeal.status})` };
  }
  if (appeal.submittedAt || appeal.outcome !== "PENDING") {
    return { action: "declined", reason: "already submitted or decided" };
  }

  const confidence = appeal.confidenceScore;
  if (confidence == null || confidence < practice.autoPilotMinConfidence) {
    return {
      action: "declined",
      reason: `confidence ${confidence ?? "n/a"} below threshold ${practice.autoPilotMinConfidence}`,
    };
  }

  const deniedCents = Math.round(Number(appeal.denial.deniedAmount) * 100);
  if (
    practice.autoPilotMaxAmountCents != null &&
    deniedCents > practice.autoPilotMaxAmountCents
  ) {
    return {
      action: "declined",
      reason: `denied amount $${(deniedCents / 100).toFixed(2)} above cap $${(practice.autoPilotMaxAmountCents / 100).toFixed(2)}`,
    };
  }

  if (appeal.denial.filingDeadline && appeal.denial.filingDeadline < new Date()) {
    return { action: "declined", reason: "filing deadline passed" };
  }

  // Mark submitted first (same contract the human approve route uses — the
  // submit workflow expects the appeal to be in SUBMITTED state), then call
  // the worker. If the worker call fails, revert so the appeal goes back to
  // the human queue untouched.
  const now = new Date();
  await prisma.appeal.update({
    where: { id: appeal.id },
    data: { submittedAt: now, outcome: "SUBMITTED", autoSubmittedAt: now },
  });

  try {
    await worker.submit(appeal.id);
  } catch (e) {
    await prisma.appeal.update({
      where: { id: appeal.id },
      data: { submittedAt: null, outcome: "PENDING", autoSubmittedAt: null },
    });
    return { action: "failed", reason: `worker submit failed: ${(e as Error).message}` };
  }

  // System audit event — no userId, this was a policy decision, not a person.
  await prisma.auditEvent
    .create({
      data: {
        practiceId: practice.id,
        userId: null,
        action: "appeal.auto_submit",
        resourceType: "appeal",
        resourceId: appeal.id,
        metadata: {
          confidence,
          threshold: practice.autoPilotMinConfidence,
          deniedCents,
          capCents: practice.autoPilotMaxAmountCents,
        },
      },
    })
    .catch(() => {});

  // Tell the practice it happened (owner + admins).
  const recipients = practice.users.filter((u) => u.role !== "STAFF");
  const payerName = appeal.denial.claim.payer.name;
  for (const u of recipients.length > 0 ? recipients : practice.users) {
    try {
      await notify({
        practiceId: practice.id,
        template: "appeal.auto_submitted",
        recipient: u.email,
        subject: `Autopilot submitted an appeal — $${(deniedCents / 100).toFixed(2)} to ${payerName}`,
        body:
          `Autopilot submitted an appeal with ${(confidence * 100).toFixed(0)}% confidence ` +
          `(threshold ${(practice.autoPilotMinConfidence * 100).toFixed(0)}%).\n\n` +
          `Review it: ${baseUrl()}/appeals/${appeal.id}`,
        resourceId: appeal.id,
      });
    } catch (e) {
      console.error("[autopilot] notify failed:", e);
    }
  }

  return { action: "submitted" };
}

function baseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
