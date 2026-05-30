// POST /api/webhooks/stripe — receives Stripe event callbacks.
//
// This is the ONLY route that does not go through `apiHandler` — it is
// public (Stripe calls it without our Clerk session). Signature verification
// is the gate.

import { NextResponse, type NextRequest } from "next/server";
import { constructWebhookEvent, stripeMode } from "@/lib/stripe";
import { markInvoicePaid, voidInvoice } from "@/lib/invoices";
import { prisma } from "@overturn/db";

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");

  // In stub mode we accept a JSON body verbatim (no signature). This is
  // *only* exercised in development — wiring the same code path lets us
  // hand-fire webhook events from a curl while building.
  let event: { type: string; data: { object: { id?: string } } } | null = null;
  if (stripeMode === "live") {
    try {
      event = constructWebhookEvent(payload, signature) as never;
    } catch (e) {
      console.error("[stripe-webhook] signature verification failed:", e);
      return new NextResponse("bad signature", { status: 400 });
    }
  } else {
    try {
      event = JSON.parse(payload);
    } catch {
      return new NextResponse("bad payload", { status: 400 });
    }
  }
  if (!event) return new NextResponse("no event", { status: 400 });

  // Record the webhook event so we can debug from the DB later. This is
  // the only place we accept anonymous writes.
  try {
    const stripeInvoiceId = event.data?.object?.id;
    const inv = stripeInvoiceId
      ? await prisma.invoice.findUnique({ where: { stripeInvoiceId } })
      : null;
    if (inv) {
      await prisma.auditEvent.create({
        data: {
          practiceId: inv.practiceId,
          userId: null,
          action: `stripe.${event.type}`,
          resourceType: "invoice",
          resourceId: inv.id,
          ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: req.headers.get("user-agent"),
          metadata: { stripeInvoiceId },
        },
      });
    }
  } catch (e) {
    console.error("[stripe-webhook] audit failed:", e);
  }

  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const id = event.data.object.id;
      if (id) await markInvoicePaid(id);
      break;
    }
    case "invoice.voided":
    case "invoice.marked_uncollectible": {
      const id = event.data.object.id;
      if (id) {
        const inv = await prisma.invoice.findUnique({ where: { stripeInvoiceId: id } });
        if (inv) await voidInvoice(inv.id);
      }
      break;
    }
    default:
      // Other event types we don't act on yet.
      break;
  }

  return NextResponse.json({ received: true });
}
