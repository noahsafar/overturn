# How to actually send the outreach

I prepped the artifacts. You push the send buttons. This is by design — you
should never let a script send emails or LinkedIn messages from your
@yale.edu account without you eyeballing each one. The cost of one
malformed mass-blast is your Yale email getting flagged by Google.

## What got produced

- `outreach/drafts/<slug>.eml` — one per lead with a real email. RFC-822 format.
  Drag-and-drop into Gmail's compose window to import as a draft.
- `outreach/linkedin/<slug>.txt` — one per lead. Has a 300-char connect note
  + a longer follow-up message you send after they accept.

Run `python scripts/sales/enrich_and_draft.py` again any time you update
`leads.csv` to regenerate.

## Sending the email drafts (5 minutes per draft, ~20 min total)

The current Gmail UI doesn't let you import .eml files as drafts directly,
so the workflow is:

1. Open `outreach/drafts/revive-physical-therapy.eml` in your text editor.
2. In Gmail (logged into your @yale.edu), click Compose.
3. Copy the `Subject:` line into Gmail's subject field.
4. Copy the body (everything after the blank line below the headers) into
   Gmail's body. The body has quoted-printable encoding for em-dashes —
   most text editors will display them correctly, but if you see literal
   `=E2=80=94` strings, replace those with `—`. Or just use plain `--`.
5. Set the To: field from the `.eml` `To:` header.
6. **Read it once carefully.** Fix the `[phone]` placeholder. Update the
   `Yale 'XX` to your actual class year. Verify the salutation isn't weird.
7. Send.

**Alternative: import via Thunderbird.** If you've got a few hours of drafts
to send, Thunderbird natively imports .eml files as drafts via
File → Open → Saved Message. You can open all of them at once, edit, and
forward each through your @yale.edu IMAP.

## Sending the LinkedIn DMs

LinkedIn explicitly forbids automated sending and will rate-limit + ban
accounts that try. So this is manual copy-paste, but the messages are
already drafted:

1. Find the lead on LinkedIn (search "[practice name]" or the owner's name).
2. Click "Connect" → "Add a note".
3. Open `outreach/linkedin/<slug>.txt` in your editor.
4. Copy the "CONNECT NOTE" section into the LinkedIn note field. **It's
   pre-trimmed under 300 chars, but verify.**
5. Send.
6. When/if they accept, open `outreach/linkedin/<slug>.txt` again. Copy
   the "FOLLOW-UP" section. Send as a DM.

## Recommended cadence

Don't send all 30 in one morning. Gmail considers it spammy if a new account
suddenly sends 30 outbound emails with similar bodies.

Spread it over 3-4 days:

- **Day 1 (Mon)**: 8 cold emails + 3 LinkedIn connect requests.
- **Day 2 (Tue)**: 8 more cold emails + 4 LinkedIn connect requests.
- **Day 3 (Wed)**: 8 more cold emails.
- **Day 4 (Thu)**: remaining + first round of LinkedIn follow-ups (for
  anyone who accepted the connect).
- **Day 5+ (Fri-next-Mon)**: re-pings for non-replies, manage incoming.

## After you send: tracking replies

Update `leads.csv` after each send:
- `first_outreach_date` — date you sent
- `channel` — "email" or "linkedin"
- `reply_received` — Y/N once a reply lands
- `call_booked` — Y/N + the date
- `outcome` — short description after the call (pilot interest / declined / follow-up)
- `notes` — anything they said that's worth remembering

A real CRM is overkill at this scale. The CSV plus disciplined updates is
enough for the first 30 leads. Move to Notion / Attio / HubSpot once you
have 5+ live conversations.

## What the script can't do (and what to do about it)

| Limitation | What to do |
|---|---|
| Some sites (Quinnipiac PT) blocked our requests with 403 | Manually look up their contact info on their website / via a personal Google search |
| No email found for Integrated Wellness Group, Integrated Rehab | Use Hunter.io free tier (50/month) with their domain, or check the practice's About / Team page on a fresh browser session |
| Candidate names in the `notes` field are noisy | Open each practice's "Our Team" page yourself, identify the owner / practice manager, update the `owner_or_pm_name` + `title` columns in `leads.csv`, re-run script |
| 23 more leads needed to hit 30 | See `lead-research.md` — Tier 2 (free databases) is the next stop |

## A note on reply rates

Cold-email reply rate with the Yale-from-address signal: 8-15%. So with 30
emails sent over 4 days, you should expect 3-5 replies. Of those, ~half
will book a call. Your goal: **3 booked discovery calls by end of week 1.**

If you're not seeing replies by day 7, the most likely fix isn't more
volume — it's tighter personalization. Re-read the practice's website before
each email and rewrite the first sentence to reference something specific
about them. That move alone roughly doubles reply rates.
