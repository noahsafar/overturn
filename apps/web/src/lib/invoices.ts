// Invoice lifecycle helpers.
//
// Invoices roll up InvoiceLineItems (one per recovered Appeal) into a single
// monthly charge per practice. The lifecycle is:
//
//   DRAFT       — outcomes accumulate here as ERAs arrive.
//   OPEN        — issued to Stripe; customer can pay via hosted URL.
//   PAID        — Stripe webhook confirmed payment.
//   VOID / UNCOLLECTIBLE — terminal failure states.
//
// Issuance can only happen on a DRAFT invoice with ≥1 line item.

import "server-only";
import { prisma } from "@overturn/db";
import { notifyInvoiceIssued } from "./notifications";
import { createCustomer, issueInvoice as issueStripeInvoice } from "./stripe";

export class InvoiceError extends Error {
  constructor(
    public code: "no_lines" | "wrong_status" | "no_billing_email" | "stripe_failed",
    msg: string,
  ) {
    super(msg);
  }
}

export async function ensureStripeCustomer(practiceId: string): Promise<string> {
  const p = await prisma.practice.findUnique({ where: { id: practiceId } });
  if (!p) throw new Error(`practice ${practiceId} not found`);
  if (p.stripeCustomerId) return p.stripeCustomerId;
  if (!p.billingEmail) {
    throw new InvoiceError("no_billing_email", "practice has no billingEmail");
  }
  const c = await createCustomer({
    email: p.billingEmail,
    name: p.name,
    metadata: { practiceId: p.id, npi: p.npi },
  });
  await prisma.practice.update({
    where: { id: p.id },
    data: { stripeCustomerId: c.id },
  });
  return c.id;
}

export async function issueInvoice(invoiceId: string): Promise<{ stripeInvoiceId: string; hostedInvoiceUrl: string | null }>
{
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: true, practice: true },
  });
  if (!inv) throw new InvoiceError("wrong_status", "invoice not found");
  if (inv.status !== "DRAFT") {
    throw new InvoiceError("wrong_status", `invoice is ${inv.status}, not DRAFT`);
  }
  if (inv.lineItems.length === 0) {
    throw new InvoiceError("no_lines", "invoice has no line items");
  }

  const customerId = await ensureStripeCustomer(inv.practiceId);

  const stripeRes = await issueStripeInvoice({
    customerId,
    description: `Overturn recovery fees — ${inv.periodStart.toISOString().slice(0, 7)}`,
    lineItems: inv.lineItems.map((li) => ({
      description: li.description,
      amountCents: li.feeCents,
    })),
    idempotencyKey: `inv-${inv.id}`,
  });

  await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      status: "OPEN",
      stripeInvoiceId: stripeRes.id,
      stripeHostedUrl: stripeRes.hostedInvoiceUrl,
      issuedAt: new Date(),
    },
  });

  // Fire notification, but don't fail the request if email errors.
  try {
    await notifyInvoiceIssued(inv.id);
  } catch (e) {
    console.error("[invoices] notifyInvoiceIssued failed:", e);
  }

  return { stripeInvoiceId: stripeRes.id, hostedInvoiceUrl: stripeRes.hostedInvoiceUrl };
}

export async function markInvoicePaid(stripeInvoiceId: string): Promise<void> {
  const inv = await prisma.invoice.findUnique({
    where: { stripeInvoiceId },
  });
  if (!inv) return; // unknown invoice — ignore (webhook may pre-date our row)
  if (inv.status === "PAID") return;
  await prisma.invoice.update({
    where: { id: inv.id },
    data: { status: "PAID", paidAt: new Date() },
  });
}

export async function voidInvoice(invoiceId: string): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "VOID" },
  });
}
