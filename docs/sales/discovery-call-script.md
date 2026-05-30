# Discovery call script — 30 minutes

The master plan's day-1 checklist says: *"Write down 30 questions to ask
your first pilot prospect."* This is that, narrowed to 20 (you won't get
through 30), ordered, and wrapped in a structure that produces both
learning and a path to a pilot signature.

**Two goals for this call, in priority order:**
1. **Learn**. What do they actually do today? What's broken? Don't lead.
2. **Earn the right to a follow-up**. Don't try to close — try to be invited back.

If you find yourself pitching, stop. The call is them talking, you listening.

---

## Pre-call prep (5 min, day of)

- [ ] Re-read the practice's website. Note their specialty, size, EHR if visible.
- [ ] Pull up the prospect's LinkedIn. Note their tenure + any posts about ops.
- [ ] Have `leads.csv` open with their row.
- [ ] Have a fresh blank document for notes.
- [ ] Have your laptop ready to **screenshare the demo if asked** — but don't volunteer it.
- [ ] Voice recording on (with their permission — ask at the top).

---

## The arc (30 minutes)

| Phase | Time | Goal |
|---|---|---|
| Open | 2 min | Set frame, get permission to record |
| Their world | 12 min | Listen. Take notes. |
| Specific pain | 8 min | Probe denial workflow concretely |
| Their reaction (only if asked) | 5 min | Show, don't pitch |
| Close | 3 min | Earn the right to follow up |

---

## Phase 1 — Open (2 min)

> *"Thanks again for taking this. Quick frame: I'm trying to understand how
> practices like yours handle denied claims today, before I tell you anything
> about what we've built. I'd rather learn than pitch. Mind if I record this
> for my own notes? Won't share it anywhere."*

Pause. Wait for the "sure." Most people say yes.

> *"Great. Tell me about [Practice Name]. How many providers, what specialties,
> what's your day-to-day role?"*

(They'll talk for 2-3 minutes. Just listen.)

---

## Phase 2 — Their world (12 min)

The 20 questions, ordered. Don't ask all of them. Pick the ones that follow
naturally from what they just said. Always follow up with "tell me more about
that" or "what does that actually look like?"

**About the practice:**

1. How many providers do you have, and how has that changed in the last 2-3 years?
2. What's your specialty mix? Any sub-specialty you do a lot of (e.g., couples therapy, IOP)?
3. What EHR / PM system do you run on?
4. Who handles billing? In-house, outsourced, or a mix?

**About denials specifically — the heart of the call:**

5. Roughly how many denials a week do you see?
6. What's the breakdown of denial reasons you see most? CO-50, CO-197, timely filing, anything else?
7. Of those, what percent actually get appealed?
8. What happens to the ones that don't? *(Listen carefully here. The answer is almost always "they get written off." That's your wedge.)*
9. When you DO appeal — walk me through the steps. Who pulls the chart? Who writes the letter? How long does each appeal take to put together?
10. What's the longest part of that process?
11. How often does an appeal actually succeed? Do you track win rate by payer or denial code?
12. Which payers are the worst? *(They'll vent. Take notes — these are the payers you'll prioritize support for.)*
13. Has anyone ever told you to "just write that one off"? Tell me about that decision.

**About the people:**

14. Tell me about your biller(s). How long have they been with you? What do they spend most of their time on?
15. If your biller had 4 free hours a week, what would you have them do that they don't currently get to?
16. Have you ever lost a biller and tried to backfill the role? What was that like?

**About money:**

17. If I told you there was $X of denied claims sitting in your AR right now that nobody's worked, do you have a guess what X is?
18. How do you currently price your billing operation? Percent of collections? Salary? Flat fee?
19. If a vendor offered to work denied claims and only get paid on what they recovered, would that be appealing or does it feel like a catch?

**About them:**

20. Have you tried any RCM or denial-management software before? What worked, what didn't?

---

## Phase 3 — Probe specific pain (8 min)

By now you have a pile of facts. Now you pick ONE specific recent denial they
mentioned and walk through it in detail. This is what teaches you the most.

> *"You mentioned a BCBS CO-50 denial last week. Walk me through what happened
> exactly. From the moment the ERA came in — what did you see, what did you
> do, who did what, how long did it take?"*

Listen for:
- The specific motion of grabbing chart notes, writing the letter, finding the policy
- Who they get stuck on (the biller? the clinician for chart access? the payer's portal?)
- What they DON'T say (do they mention citation verification? probably not — they just write what they remember the policy saying)
- Where the real bottleneck is

You'll know the call is going well if at this point they say something like
*"yeah, we have a pile of those that we just never get to"* or *"my biller spends
a whole day on a single appeal."* That's product-market-fit oxygen.

---

## Phase 4 — Demo (only if invited, 5 min)

Do NOT volunteer a demo unless they ask. If they ask — "so what does your
thing actually do?" — pivot to:

> *"Happy to show you for 5 minutes. The short version: practice manager
> drops the ERA in, our agent drafts the appeal letter with verified
> citations against the payer's published policy, your reviewer signs off,
> we submit. Pricing is 25% of recovered, zero if we don't recover. Want
> to see what the dashboard looks like?"*

Then:
- Open localhost:3000.
- Show the dashboard with real-looking numbers (the seeded data).
- Click into a denial. Show the chart-excerpt textarea: *"This is where your
  biller pastes the chart context. Today she does this manually; phase 2
  we'll auto-pull from your EHR."*
- Click "Start appeal." Show the workflow ticking through to READY.
- Show the draft + the verified citations.
- Show the invoices page: *"Here's where the line items show up when we win."*

Do not click through every page. **5 minutes max.** End on the invoice page so
their last visual is "money came back."

---

## Phase 5 — Close (3 min)

Don't try to sign them. Try to earn the right to come back.

If the call went well:

> *"This was incredibly helpful. Two things I'd love to know if you're open
> to it. First — can I send you a one-page summary of what I heard, just so
> I'm sure I got it right? Second — if I came back in two weeks with a more
> concrete proposal, would you take a 20-minute call to look at it?"*

If they say yes to both — you have a soft warm lead. That's the goal.

If they said something like "this sounds great, what would a pilot look like":

> *"Honestly the simplest version: 2-page agreement, you give us SFTP access
> to your clearinghouse so denials flow in, we work them for 60 days, you
> review every draft before it goes out, we charge 25% of anything we
> recover. If we recover nothing, you pay nothing. Want me to draft up
> that 2-pager and send it for your attorney to review?"*

If they're skeptical:

> *"Totally fair. Mind if I send you a one-page summary of what I heard,
> just so I'm sure I understood, and circle back in a quarter to see if
> things have changed?"*

---

## Post-call (15 min, within 1 hour)

- [ ] Fill in `leads.csv` row: outcome, next-step date, key quotes.
- [ ] Write the one-page summary email (template in `followup-templates.md`, "PostCall").
- [ ] If you said you'd send something specific — DO IT TODAY. Speed of response is the #1 trust signal at this stage.

---

## Calibration: what counts as a good call

| Outcome | Quality |
|---|---|
| They booked a follow-up + asked for the pilot agreement draft | A+ — pilot in sight |
| They booked a follow-up | A |
| They said "send me a one-pager" | B+ |
| They said "nice meeting you" | C — probably dead, file for re-engagement |
| They asked a lot of technical questions about HIPAA and BAAs | Often a YES sign disguised as scrutiny — they're imagining a real deployment |
| They asked "how do I know you won't make up the citations" | Goldilocks question — your answer (the deterministic verifier) is the strongest part of the pitch |

## Things you'll be tempted to do — and shouldn't

- **Don't promise specific savings numbers.** "You could recover $200K/year" without backing data feels like sales theater. Better: "Our model is 75% win rate at 25% fee; you can do the math on your denial volume."
- **Don't trash their current billing company by name.** They might be loyal. Critique the system, not the company.
- **Don't extend the call past 30 min unless they ask.** Respecting time is a strong trust signal.
- **Don't apologize for being a student.** It's your asset, not your handicap.
