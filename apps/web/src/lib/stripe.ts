// Stripe client + dev-stub fallback.
//
// Production path: STRIPE_SECRET_KEY is set, the real Stripe SDK is used.
// Dev path: no key, we generate plausible-looking stub IDs so the rest of
// the flow (issue invoice → mark OPEN → display hosted-URL stub) exercises
// the same code paths.
//
// Webhook signature verification only runs when the real SDK is active.

import "server-only";
import Stripe from "stripe";

const KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export const stripeMode: "live" | "stub" = KEY ? "live" : "stub";

const realClient: Stripe | null = KEY
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ? new Stripe(KEY, { apiVersion: "2025-08-27.basil" as any })
  : null;

export interface CreateCustomerInput {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}

export interface CreatedCustomer {
  id: string;
}

export interface IssueInvoiceInput {
  customerId: string;
  description: string;
  lineItems: Array<{
    description: string;
    amountCents: number; // total fee in cents
  }>;
  // Used so a re-issue is idempotent in case the network drops mid-call.
  idempotencyKey: string;
}

export interface IssuedInvoice {
  id: string;
  hostedInvoiceUrl: string | null;
  status: string;
}

const stubInvoiceUrl = (id: string) =>
  `${process.env.STRIPE_STUB_BASE_URL ?? "http://localhost:3000/stub-stripe"}/invoice/${id}`;

export async function createCustomer(input: CreateCustomerInput): Promise<CreatedCustomer> {
  if (!realClient) {
    return { id: `cus_stub_${Math.random().toString(36).slice(2, 12)}` };
  }
  const c = await realClient.customers.create({
    email: input.email,
    name: input.name,
    metadata: input.metadata,
  });
  return { id: c.id };
}

export async function issueInvoice(input: IssueInvoiceInput): Promise<IssuedInvoice> {
  if (!realClient) {
    const id = `in_stub_${input.idempotencyKey.slice(0, 12)}`;
    return { id, hostedInvoiceUrl: stubInvoiceUrl(id), status: "open" };
  }
  // 1. Add invoice items
  for (const item of input.lineItems) {
    await realClient.invoiceItems.create(
      {
        customer: input.customerId,
        amount: item.amountCents,
        currency: "usd",
        description: item.description,
      },
      { idempotencyKey: `${input.idempotencyKey}-item-${item.description.slice(0, 30)}` },
    );
  }
  // 2. Create + finalize invoice
  const inv = await realClient.invoices.create(
    {
      customer: input.customerId,
      description: input.description,
      collection_method: "send_invoice",
      days_until_due: 14,
      auto_advance: true,
    },
    { idempotencyKey: `${input.idempotencyKey}-create` },
  );
  if (!inv.id) {
    throw new Error("Stripe returned an invoice with no id");
  }
  const finalized = await realClient.invoices.finalizeInvoice(inv.id);
  return {
    id: finalized.id ?? inv.id,
    hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
    status: finalized.status ?? "open",
  };
}

/** Verify and parse a Stripe webhook payload. Returns null in stub mode. */
export function constructWebhookEvent(
  payload: string,
  signature: string | null,
): Stripe.Event | null {
  if (!realClient || !WEBHOOK_SECRET) return null;
  if (!signature) throw new Error("missing stripe-signature header");
  return realClient.webhooks.constructEvent(payload, signature, WEBHOOK_SECRET);
}
