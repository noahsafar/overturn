import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  vi.resetModules();
});

describe("stripe stub mode", () => {
  it("createCustomer returns a stub id when no key", async () => {
    const m = await import("./stripe");
    expect(m.stripeMode).toBe("stub");
    const c = await m.createCustomer({ email: "a@b.c", name: "Test" });
    expect(c.id).toMatch(/^cus_stub_/);
  });

  it("issueInvoice returns a stub id + url", async () => {
    const m = await import("./stripe");
    const inv = await m.issueInvoice({
      customerId: "cus_stub_xyz",
      description: "test",
      lineItems: [{ description: "line", amountCents: 1234 }],
      idempotencyKey: "abc123",
    });
    expect(inv.id).toMatch(/^in_stub_/);
    expect(inv.hostedInvoiceUrl).toContain(inv.id);
    expect(inv.status).toBe("open");
  });

  it("constructWebhookEvent returns null in stub mode", async () => {
    const m = await import("./stripe");
    expect(m.constructWebhookEvent("{}", null)).toBeNull();
  });
});
