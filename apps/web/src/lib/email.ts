// Resend transactional email client + dev-stub.
//
// When RESEND_API_KEY is unset we don't send a real email; we just log and
// pretend success so notification rows still get a SENT marker for the
// downstream UI.

import "server-only";

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL ?? "appeals@overturn.local";
const REPLY_TO = process.env.RESEND_REPLY_TO;

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SentEmail {
  providerRef: string;
  status: "sent" | "stub";
}

export async function sendEmail(input: SendEmailInput): Promise<SentEmail> {
  if (!KEY) {
    const stubId = `email_stub_${Math.random().toString(36).slice(2, 12)}`;
    // eslint-disable-next-line no-console
    console.log("[email-stub]", input.to, "—", input.subject);
    return { providerRef: stubId, status: "stub" };
  }

  const body: Record<string, unknown> = {
    from: FROM,
    to: [input.to],
    subject: input.subject,
    text: input.text,
  };
  if (input.html) body.html = input.html;
  if (REPLY_TO) body.reply_to = REPLY_TO;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`resend failed ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id: string };
  return { providerRef: data.id, status: "sent" };
}
