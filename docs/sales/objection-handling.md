# Objection handling

Pre-drafted answers to the seven objections you will hear most. Memorize the
shape; don't recite verbatim. The principle is always: **acknowledge → reframe → ask a question back.**

---

## 1. "We already have a billing company / in-house biller doing this."

Wrong framing on their part — and the most common opener. Don't argue.

> *"Totally — and I'd bet your biller is the reason your claims get filed at
> all. What I'm noticing across practices like yours is that biller queues
> tend to fill up with new claims, and denial follow-up is the thing that
> falls off the end. So my question isn't 'replace your biller' — it's
> 'what percent of your denials actually get worked today, and what happens
> to the rest?' If the answer is anything less than 100%, that gap is what
> we recover."*

Then ask: *"Can you ballpark — what percent of denials end up worked vs written off?"*

---

## 2. "I'd be worried about an AI making up citations or facts."

This is your favorite objection. It's where the deterministic verifier lives.

> *"That's the right thing to worry about — generic chat-AI tools absolutely
> hallucinate citations, and an appeal with a made-up policy reference can
> get your provider in real trouble. Two things on how we handle it. First,
> every policy quote in our draft gets checked verbatim against the payer's
> actual published medical policy before the appeal ever reaches your
> reviewer — if the quote isn't in the document, our system rejects the
> draft and asks the model to redraft. We treat that check as the load-bearing
> safety. Second, you approve every appeal in the first 60 days. The agent
> can't submit without your sign-off. If you're not happy with a draft, you
> edit it or reject it — same as you would for a draft from a biller."*

Then ask: *"Would seeing the verifier in action help? Takes me 30 seconds to
demo it rejecting a hallucinated quote."*

---

## 3. "What about HIPAA / where does the data go?"

The signal that they're considering it seriously. Be ready.

> *"Right question. The honest version: we don't store any PHI until our BAAs
> are signed with AWS and our LLM provider — both of which are HIPAA-eligible
> with BAAs available. PHI is encrypted at rest with AES-256, in transit with
> TLS 1.3, and never used to train any model. We log every single PHI access
> in an immutable audit trail — your compliance officer can export it any
> time. If you want the technical details I can send you our security
> one-pager."*

If you don't have the security one-pager yet, you can offer to draft one
within 48 hours. Better: send `docs/production-wiring.md` (or a sanitized
version of it) since it's already written.

---

## 4. "How does the pricing work — really?"

People ask this when they smell a too-good-to-be-true.

> *"It's simple by design. 25% of what we recover for you. Nothing else.
> No setup fee, no monthly minimum, no per-seat seat fee. If we work
> 100 of your denials and recover $30,000, we invoice you $7,500. If we
> work 100 of your denials and recover nothing, we invoice you zero.*
>
> *The reason we can do that is we use AI for the draft — the agent costs
> us about $4 per appeal in LLM tokens. A human biller costs $50-60 per
> appeal. So we have margin even at 25%."*

Then ask: *"Does that pricing model raise any other questions?"*

---

## 5. "What if you make a mistake and it costs us money / our license?"

This is a real concern, not a stall.

> *"Three layers of safety. One, the deterministic citation check — no
> fabricated policy references. Two, your reviewer signs off on every
> appeal in the first 60 days, so you have a human gate. Three, we
> carry [E&O insurance once you get it; right now: 'we're working on'].
> And we contract liability the same way your billing company would —
> we own our errors."*

If they push: *"What's your worst-case fear? Let me address it specifically."*

---

## 6. "Have you done this before? Who else uses you?"

The hardest question. You haven't.

> *"Honestly — you'd be one of our first design partners. That's the trade.
> You get attention you wouldn't get from a Series B vendor. I'm personally
> reviewing every appeal you submit for the first 60 days, and I'll fly
> [or take the train, you're at Yale] to your office if anything breaks.
> The flip side: I get to learn how to build the right thing for practices
> like yours."*

Don't lie. Don't list fake customers. The "design partner" framing is
honest AND attractive to the kind of practice owner you actually want
(early adopters who like having direct influence).

---

## 7. "Send me some information and I'll get back to you."

The professional polite no. Don't accept it.

> *"Happy to send a one-pager. Realistically I know how those go though —
> the email lands, gets buried under three other things, and we never
> talk again. Would it be more useful if I scheduled a 20-minute follow-up
> for two weeks from now? I'll send the one-pager ahead so you can skim,
> and we use the 20 min to talk about what you'd actually want to see
> in a pilot. If by then you're not interested, you just no-show and I
> stop emailing."*

The "you just no-show and I stop emailing" line is the magic — it gives
them an out, which paradoxically makes them more likely to take the slot.

---

## Edge cases

**"My biller will hate this."** — *"That's a real concern. Most billers like it once they see what it actually does — it works the queue they never get to, not the work they're already doing. Want me to walk through what your biller would actually see day-to-day?"*

**"We're already evaluating [competitor]."** — *"What stage are you at with them? What do you like about their approach?"* (Listen, then differentiate on outcomes-based pricing and the deterministic verifier — usually they don't have either.)

**"We're a Yale Medicine affiliate / hospital-system practice."** — They're not your ICP. Politely: *"Sounds like you might be on a different procurement track than where we're targeting first. Mind if I check back in 6-12 months once we've got hospital-level BAAs sorted?"*

**"How much money does this make a practice like mine?"** — Don't guess. *"Honest answer is it depends on your denial volume and your current write-off rate. If you can share your monthly denial count and roughly how many get worked, I can build a number based on industry-average win rates. Or we just pilot for 60 days at zero cost and you see the real number."*
