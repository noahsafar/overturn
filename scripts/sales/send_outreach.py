#!/usr/bin/env python3
"""Send cold-outreach emails for leads in docs/sales/leads.csv.

Auth: Gmail OAuth — reuses the refresh token from the Aiden project at
  ~/.aiden/token.pickle (gmail.send scope already granted there). Falls
  back to SMTP + App Password from ~/.config/overturn/gmail.env if the
  Aiden token is unavailable.

What this does:
  - Reads leads.csv. Filters to rows with email + empty first_outreach_date.
  - Renders a specialty-tailored draft per lead.
  - Sends via Gmail SMTP, throttled. Updates leads.csv in place
    (first_outreach_date = today, channel = email).
  - Appends a JSON record per send to outreach/sent-log.jsonl.

Safety:
  - --dry-run is the default. Pass --send to actually transmit.
  - --limit N caps how many leads to touch this run (default 10).
  - --throttle SEC waits between sends (default 60).
  - --filter STATE=CT (etc.) narrows the set.

Examples:
    # Preview the next 5 sends:
    python scripts/sales/send_outreach.py --limit 5

    # Send the next 10 with 60s between (default throttle):
    python scripts/sales/send_outreach.py --send --limit 10

    # Just CT leads, 30s throttle:
    python scripts/sales/send_outreach.py --send --filter state=CT --throttle 30
"""

from __future__ import annotations

import argparse
import base64
import csv
import datetime as dt
import json
import os
import pickle
import re
import smtplib
import ssl
import sys
import time
from email.message import EmailMessage
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEADS_CSV = ROOT / "docs" / "sales" / "leads.csv"
LOG_FILE = ROOT / "outreach" / "sent-log.jsonl"
CRED_FILE = Path.home() / ".config" / "overturn" / "gmail.env"
AIDEN_TOKEN = Path.home() / ".aiden" / "token.pickle"

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465  # SSL

# Hard global guardrail. Bypass with --i-know-what-im-doing.
HARD_DAILY_CAP = 50

SIGNATURE = "Noah Safar · Yale '27 · 203-435-5609"

# Subject + body template. {variables} are filled from the lead row.
SUBJECT_TEMPLATE = "{specialty_short} practice + denied claims — Yale student question"

BODY_TEMPLATE = """\
{greeting},

I'm a Yale student building Overturn — software that automates appeals on denied insurance claims for small in-network practices. We draft the appeal letter against the payer's published medical policies, cite real chart notes, get a human at your practice to approve, then submit through the portal.

{specialty_line} denials — {denial_examples} — are some of the hardest to work without a dedicated appeals team. I'd love 15 minutes to learn how {practice_name} handles them today.

Not pitching — research call.

Thanks,
{signature}
"""

# Map keyword in specialty field -> (short label for subject, longer label
# for the "X denials" line, comma-list of specific denial types).
SPECIALTY_MAP = [
    # (regex, short, long, denial_examples)
    (r"pediatric.*ot|pediatric.*occupational", "Pediatric OT", "Pediatric OT",
     "sensory integration not \"medically necessary\", visit caps, frequency reductions"),
    (r"pediatric.*speech|speech.*pediatric|speech/language|speech/feeding",
     "Pediatric speech", "Pediatric speech and feeding",
     "habilitative-vs-rehabilitative coding, frequency reductions, \"developmental vs medical\" exclusions"),
    (r"pediatric", "Pediatrics", "Pediatrics",
     "developmental screening, ADHD med PAs, behavioral health carve-outs"),
    (r"pelvic", "Pelvic floor PT", "Pelvic floor PT",
     "medical necessity, visit caps, \"diagnostic code mismatch\", internal-exam coverage"),
    (r"physical therapy|^pt$|\bpt\b", "PT", "PT",
     "visit caps, medical necessity, direct-access fights, prior auth"),
    (r"speech", "Speech therapy", "Speech therapy",
     "habilitative-vs-rehabilitative coding, frequency reductions, medical necessity"),
    (r"occupational", "OT", "OT",
     "sensory integration medical necessity, visit caps, frequency reductions"),
    (r"derm.*mohs|mohs", "Dermatology + Mohs", "Dermatology + Mohs",
     "cosmetic-vs-medical determinations, Mohs documentation tier disputes, biologic prior auths"),
    (r"derm", "Dermatology", "Dermatology",
     "cosmetic-vs-medical determinations, Mohs documentation, biologics (Dupixent, Skyrizi, Cosentyx)"),
    (r"chiro", "Chiropractic", "Chiropractic",
     "visit caps, \"maintenance care\" determinations, medical necessity"),
    (r"optom", "Optometry", "Optometry",
     "medical-vs-vision split, diabetic retinopathy screening, contact-lens medical necessity"),
    (r"ophth", "Ophthalmology", "Ophthalmology",
     "cataract surgery medical necessity, intravitreal injections (Eylea, Lucentis), premium-IOL coding"),
    (r"podiatry|foot", "Podiatry", "Podiatry",
     "diabetic foot care medical necessity, orthotics, \"routine\" exclusions"),
    (r"counsel|psycho|behavioral|mental health", "Counseling", "Counseling",
     "session-limit denials, telehealth parity, parity-law violations"),
    (r"psych", "Psychiatry", "Psychiatry",
     "session limits, controlled-substance PAs, telehealth parity, medication management billing"),
    (r"allergy|immun", "Allergy/Immunology", "Allergy/Immunology",
     "biologics (Xolair, Dupixent), immunotherapy build-up, food challenges"),
    (r"gastro|\bgi\b", "GI", "GI",
     "screening-vs-diagnostic colonoscopy coding, biologics for IBD (Remicade, Stelara, Entyvio), capsule endoscopy"),
    (r"\bent\b|ear nose|otolar", "ENT", "ENT",
     "septoplasty cosmetic-vs-functional, sleep studies, hearing aids"),
    (r"plastic", "Plastic surgery", "Plastic / reconstructive",
     "functional-vs-cosmetic determinations, breast reconstruction medical necessity, ptosis repair"),
    (r"pain", "Pain management", "Pain management",
     "ESI medical necessity, RFA frequency limits, SCS trials, opioid PAs"),
    (r"urol", "Urology", "Urology",
     "prostate biopsy medical necessity, urodynamics, BPH procedures (Rezum, UroLift)"),
    (r"neurol", "Neurology", "Neurology",
     "MRI necessity, EEG/EMG, infusion therapies, Botox for migraine"),
    (r"rheum", "Rheumatology", "Rheumatology",
     "biologic step therapy (Remicade, Orencia, Actemra), infusion necessity, J-code reimbursement"),
    (r"endocr", "Endocrinology", "Endocrinology",
     "CGM coverage, GLP-1 prior auths, growth hormone, thyroid imaging"),
    (r"cardio", "Cardiology", "Cardiology",
     "imaging medical necessity, stress test denials, device coverage"),
    (r"sleep", "Sleep medicine", "Sleep medicine",
     "PSG medical necessity, CPAP compliance, sleep study tier disputes"),
    (r"audio", "Audiology", "Audiology",
     "hearing aid coverage, scope-of-practice billing, diagnostic-vs-screening"),
    (r"dental|dent", "Dental", "Dental",
     "medical-vs-dental crossover (TMJ, sleep apnea, oral surgery), pre-treatment estimates"),
    (r"primary care|family|internal med", "Primary care", "Primary care",
     "referral denials, preventive-vs-diagnostic coding, GLP-1 / CGM prior auths, chronic-disease E/M downcoding"),
]

DEFAULT_SPECIALTY = ("Independent practice", "Specialty",
                     "medical necessity, prior auth, visit caps, downcoding")


FOLLOWUP_BODY_TEMPLATE = """\
{greeting},

Quick follow-up — sent a note a few days back about how {practice_name} handles denied insurance claims. Inboxes get full, so making sure it didn't slip past.

If you're in-network and have denial-recovery pain (or know who handles it), I'd love 15 minutes — just research, nothing to sell. If you're out-of-network or this isn't a fit, totally understand and please disregard.

Thanks,
{signature}
"""


def pick_specialty(specialty_field: str):
    s = (specialty_field or "").lower()
    for pattern, short, long_, examples in SPECIALTY_MAP:
        if re.search(pattern, s):
            return short, long_, examples
    return DEFAULT_SPECIALTY


# Credentials that strongly imply "Dr."
DR_CREDENTIALS = re.compile(r"\b(MD|DO|DPM|DDS|DMD|DC|OD|DPT|MPT|PsyD|PhD|FAAD|FACOG|FACFAS|MBA|MS|MPH|FAAOMPT|OCS|FRCS|FACS)\b", re.I)
# LCSW / LMHC / NP etc. = first-name greeting feels right
FIRST_NAME_CREDENTIALS = re.compile(r"\b(LCSW|LMHC|LMFT|LPC|APRN|PMHNP|PMHNP-BC|CNM|RN|OTR|OTR/L|CCC-SLP|SLP|PA-C)\b", re.I)


def render_greeting(owner_field: str) -> str:
    """Pick a greeting based on the owner_or_pm_name column.

    "Dr. Wagner" if MD/DO/etc credential found, "Hi Jay and Kate" for two owners
    with first-name credentials, "Hi team" if blank or ambiguous.
    """
    owner = (owner_field or "").strip()
    if not owner:
        return "Hi team"

    # Two-owner pattern: "Jay & Kate Neiswinter DPT" or "Sarika Banker MD & Vishal Saggar MD"
    if " & " in owner or " and " in owner:
        # Try to extract first names
        parts = re.split(r"\s*[&]\s*|\s+and\s+", owner)
        first_names = []
        for p in parts:
            p = p.strip()
            # Take the first token that's capitalized and not a credential
            for tok in p.split():
                if DR_CREDENTIALS.fullmatch(tok) or FIRST_NAME_CREDENTIALS.fullmatch(tok):
                    continue
                if tok[:1].isupper():
                    first_names.append(tok)
                    break
        if len(first_names) >= 2:
            return f"Hi {first_names[0]} and {first_names[1]}"

    # Strip trailing credentials and titles to find the actual name
    name_tokens = []
    for tok in owner.split():
        if DR_CREDENTIALS.fullmatch(tok) or FIRST_NAME_CREDENTIALS.fullmatch(tok):
            continue
        if tok.lower() in {"dr.", "dr"}:
            continue
        name_tokens.append(tok)

    if not name_tokens:
        return "Hi team"

    has_dr_credential = bool(DR_CREDENTIALS.search(owner))
    if has_dr_credential:
        # Use "Dr. <Last>". Last name = last token of the cleaned name.
        return f"Dr. {name_tokens[-1].rstrip(',')}"
    else:
        # First-name basis
        return f"Hi {name_tokens[0].rstrip(',')}"


def render_email(row: dict) -> tuple[str, str]:
    specialty_short, specialty_long, denial_examples = pick_specialty(row.get("specialty", ""))
    greeting = render_greeting(row.get("owner_or_pm_name", ""))

    subject = SUBJECT_TEMPLATE.format(specialty_short=specialty_short)
    body = BODY_TEMPLATE.format(
        greeting=greeting,
        specialty_line=specialty_long,
        denial_examples=denial_examples,
        practice_name=row.get("practice_name", "your practice"),
        signature=SIGNATURE,
    )
    return subject, body


def load_credentials() -> tuple[str, str]:
    """Read OVERTURN_GMAIL_USER / OVERTURN_GMAIL_APP_PASSWORD from env or
    ~/.config/overturn/gmail.env."""
    user = os.environ.get("OVERTURN_GMAIL_USER")
    pw = os.environ.get("OVERTURN_GMAIL_APP_PASSWORD")
    if user and pw:
        return user, pw

    if not CRED_FILE.exists():
        die(f"Missing credentials. Create {CRED_FILE} with:\n"
            f"  OVERTURN_GMAIL_USER=you@example.com\n"
            f"  OVERTURN_GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx\n"
            f"App Password setup: https://myaccount.google.com/apppasswords")

    for line in CRED_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        if k == "OVERTURN_GMAIL_USER":
            user = v.strip()
        elif k == "OVERTURN_GMAIL_APP_PASSWORD":
            pw = v.strip()

    if not (user and pw):
        die(f"{CRED_FILE} is missing OVERTURN_GMAIL_USER or OVERTURN_GMAIL_APP_PASSWORD.")
    return user, pw


def die(msg: str, code: int = 1) -> "typing.NoReturn":  # noqa: F821
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def read_leads() -> tuple[list[str], list[dict]]:
    with LEADS_CSV.open(newline="") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames), list(reader)


def write_leads(fieldnames: list[str], rows: list[dict]) -> None:
    with LEADS_CSV.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(rows)


def parse_filter(filters: list[str]) -> dict[str, str]:
    out = {}
    for f in filters or []:
        k, _, v = f.partition("=")
        if not (k and v):
            die(f"Invalid --filter: {f!r}. Use key=value (e.g. state=CT).")
        out[k.strip()] = v.strip()
    return out


def matches_filter(row: dict, filt: dict[str, str]) -> bool:
    for k, v in filt.items():
        if (row.get(k, "") or "").lower() != v.lower():
            return False
    return True


def already_sent_today_count() -> int:
    if not LOG_FILE.exists():
        return 0
    today = dt.date.today().isoformat()
    n = 0
    for line in LOG_FILE.read_text().splitlines():
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("date") == today and rec.get("status") == "sent":
            n += 1
    return n


def log_send(record: dict) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a") as f:
        f.write(json.dumps(record) + "\n")


def open_sender():
    """Return an OAuth-backed Gmail sender, falling back to SMTP if needed.

    Both return objects with .send(to, subject, body) -> msg_id (str) and
    work as context managers.
    """
    try:
        return OAuthSender()
    except Exception as e:
        # Fall back to SMTP App Password
        if not CRED_FILE.exists() and not (os.environ.get("OVERTURN_GMAIL_USER") and os.environ.get("OVERTURN_GMAIL_APP_PASSWORD")):
            die(f"OAuth send failed ({e}) and no SMTP credentials found at {CRED_FILE}.")
        return _SMTPSender()


class _SMTPSender:
    def __init__(self):
        self.user, self.pw = load_credentials()
        self.sender = self.user
        ctx = ssl.create_default_context()
        self._smtp = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=30)
        self._smtp.login(self.user, self.pw)

    def send(self, to: str, subject: str, body: str) -> str:
        send_one(self._smtp, self.user, to, subject, body)
        return ""

    def close(self):
        try:
            self._smtp.quit()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()


def render_followup(row: dict) -> tuple[str, str]:
    """Render the follow-up email. Subject = 'Re: ' + original subject."""
    specialty_short, _, _ = pick_specialty(row.get("specialty", ""))
    greeting = render_greeting(row.get("owner_or_pm_name", ""))
    orig_subject = SUBJECT_TEMPLATE.format(specialty_short=specialty_short)
    subject = f"Re: {orig_subject}"
    body = FOLLOWUP_BODY_TEMPLATE.format(
        greeting=greeting,
        practice_name=row.get("practice_name", "your practice"),
        signature=SIGNATURE,
    )
    return subject, body


def followed_up_emails() -> set[str]:
    """Return set of email addresses already followed-up (from sent-log)."""
    out: set[str] = set()
    if not LOG_FILE.exists():
        return out
    for line in LOG_FILE.read_text().splitlines():
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("kind") == "followup" and rec.get("status") == "sent":
            e = (rec.get("to") or "").strip().lower()
            if e:
                out.add(e)
    return out


def run_followup_batch(args) -> int:
    """Send follow-ups to leads with first_outreach_date >= followup_days ago,
    no reply_received, and no prior follow-up logged in sent-log.jsonl."""
    filt = parse_filter(args.filter)
    fieldnames, rows = read_leads()
    today = dt.date.today()
    cutoff = today - dt.timedelta(days=args.followup_days)
    already = followed_up_emails()

    candidates = []
    for i, row in enumerate(rows):
        first = (row.get("first_outreach_date") or "").strip()
        if not first:
            continue
        try:
            first_dt = dt.date.fromisoformat(first)
        except ValueError:
            continue
        if first_dt > cutoff:
            continue
        if (row.get("reply_received") or "").strip():
            continue
        if not (row.get("email") or "").strip():
            continue
        if not matches_filter(row, filt):
            continue
        email = row["email"].strip().lower()
        if email in already:
            continue
        if args.practice and args.practice.lower() not in (row.get("practice_name", "") or "").lower():
            continue
        candidates.append((i, row))

    if not candidates:
        print("No follow-up candidates. Nothing to send.")
        return 0

    candidates = candidates[: args.limit]

    sent_today = already_sent_today_count()
    remaining_cap = HARD_DAILY_CAP - sent_today
    if not args.i_know_what_im_doing and len(candidates) > remaining_cap:
        print(f"Already sent {sent_today} today. Hard cap is {HARD_DAILY_CAP}. "
              f"Trimming follow-ups to {max(0, remaining_cap)}.")
        candidates = candidates[: max(0, remaining_cap)]
        if not candidates:
            print("Cap reached. Use --i-know-what-im-doing to override.")
            return 0

    print(f"{'DRY-RUN' if not args.send else 'SEND'} FOLLOW-UP: {len(candidates)} email(s). "
          f"Throttle={args.throttle}s. Already sent today: {sent_today}.")
    print()

    # Preview first one
    if candidates:
        _, row = candidates[0]
        subj, body = render_followup(row)
        print("─" * 72)
        print(f"To:      {row['email']}")
        print(f"Subject: {subj}")
        print()
        print(body)
        if len(candidates) > 1:
            print(f"… and {len(candidates) - 1} more.")
        print("─" * 72)

    if not args.send:
        print("\nDry-run only. Pass --send to actually transmit follow-ups.")
        return 0

    today_iso = today.isoformat()
    sent_count = 0
    err_count = 0
    with open_sender() as sender:
        for idx, (_, row) in enumerate(candidates):
            subj, body = render_followup(row)
            to = row["email"].strip()
            try:
                msg_id = sender.send(to, subj, body)
                log_send({
                    "date": today_iso,
                    "ts": dt.datetime.now().isoformat(timespec="seconds"),
                    "to": to,
                    "subject": subj,
                    "practice": row.get("practice_name", ""),
                    "status": "sent",
                    "kind": "followup",
                    "msg_id": msg_id,
                    "from": getattr(sender, "sender", None),
                })
                sent_count += 1
                print(f"  [{idx + 1}/{len(candidates)}] follow-up sent: {row.get('practice_name', '')} -> {to}")
            except Exception as e:
                log_send({
                    "date": today_iso,
                    "ts": dt.datetime.now().isoformat(timespec="seconds"),
                    "to": to,
                    "subject": subj,
                    "practice": row.get("practice_name", ""),
                    "status": "error",
                    "kind": "followup",
                    "error": str(e),
                })
                err_count += 1
                print(f"  [{idx + 1}/{len(candidates)}] ERROR follow-up to {to}: {e}", file=sys.stderr)
            if idx < len(candidates) - 1:
                time.sleep(args.throttle)

    print()
    print(f"Done. Follow-ups sent: {sent_count}. Errors: {err_count}.")
    return 0 if err_count == 0 else 2


def run_test_send(args) -> int:
    """One-off send to args.to using a template rendered from args.as_practice
    (or a generic placeholder). Bypasses leads.csv entirely. Does NOT update
    leads.csv. Does append to sent-log.jsonl with source=test."""
    # Build a synthetic row, optionally borrowing fields from a real lead
    row = {
        "practice_name": "your practice",
        "specialty": "Physical therapy",
        "owner_or_pm_name": "",
        "email": args.to,
        "city": "",
        "state": "CT",
    }
    if args.as_practice:
        _, rows = read_leads()
        for r in rows:
            if args.as_practice.lower() in (r.get("practice_name", "") or "").lower():
                row = r
                row["email"] = args.to  # override
                break

    subj, body = render_email(row)
    print("─" * 72)
    print(f"To:      {args.to}")
    print(f"Subject: {subj}")
    print()
    print(body)
    print("─" * 72)

    if not args.send:
        print("\nDry-run only. Pass --send to actually transmit.")
        return 0

    today = dt.date.today().isoformat()
    try:
        with open_sender() as sender:
            msg_id = sender.send(args.to, subj, body)
        log_send({
            "date": today,
            "ts": dt.datetime.now().isoformat(timespec="seconds"),
            "to": args.to,
            "subject": subj,
            "practice": row.get("practice_name", ""),
            "status": "sent",
            "source": "test",
            "msg_id": msg_id,
            "from": getattr(sender, "sender", None),
        })
        print(f"\nTest email sent to {args.to} (msg id: {msg_id}).")
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        log_send({
            "date": today,
            "ts": dt.datetime.now().isoformat(timespec="seconds"),
            "to": args.to,
            "subject": subj,
            "status": "error",
            "error": str(e),
            "source": "test",
        })
        return 2


def send_one(smtp: smtplib.SMTP_SSL, sender: str, to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    smtp.send_message(msg)


# ── OAuth (Aiden) send path ──────────────────────────────────────────────

class OAuthSender:
    """Sends Gmail messages using Aiden's stored OAuth refresh token."""

    def __init__(self):
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        if not AIDEN_TOKEN.exists():
            raise RuntimeError(f"No Aiden OAuth token at {AIDEN_TOKEN}")
        with AIDEN_TOKEN.open("rb") as f:
            creds = pickle.load(f)

        if not creds.refresh_token:
            raise RuntimeError("Aiden token has no refresh_token. Re-auth via Aiden.")
        if "https://www.googleapis.com/auth/gmail.send" not in (creds.scopes or []):
            raise RuntimeError("Aiden token is missing gmail.send scope.")

        if not creds.valid:
            creds.refresh(Request())
            # Persist refreshed token back so Aiden stays in sync
            with AIDEN_TOKEN.open("wb") as f:
                pickle.dump(creds, f)

        self.creds = creds
        self.service = build("gmail", "v1", credentials=creds, cache_discovery=False)

        # Resolve sender address from userinfo
        try:
            from googleapiclient.discovery import build as build2
            ui = build2("oauth2", "v2", credentials=creds, cache_discovery=False)
            self.sender = ui.userinfo().get().execute().get("email", "me")
        except Exception:
            self.sender = "me"

    def send(self, to: str, subject: str, body: str) -> str:
        msg = EmailMessage()
        msg["From"] = self.sender
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        res = self.service.users().messages().send(
            userId="me", body={"raw": raw}
        ).execute()
        return res.get("id", "")

    def close(self) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--send", action="store_true", help="Actually send. Without this flag, dry-run.")
    ap.add_argument("--limit", type=int, default=10, help="Max sends this run (default 10).")
    ap.add_argument("--throttle", type=int, default=60, help="Seconds between sends (default 60).")
    ap.add_argument("--filter", action="append", default=[], help="Filter rows: key=value, repeatable.")
    ap.add_argument("--practice", help="Send only to one practice by name match (substring).")
    ap.add_argument("--to", help="One-off test send to this address. Bypasses leads.csv. "
                                  "Use with --as-practice to choose which template to render.")
    ap.add_argument("--as-practice", help="With --to: render the template as if for this lead "
                                           "(substring match on practice_name). Defaults to a "
                                           "generic CT PT lead.")
    ap.add_argument("--follow-up", action="store_true",
                    help="Send follow-up emails to leads with first_outreach_date>=2 days ago "
                         "and no reply_received and no prior follow-up. Uses a shorter follow-up "
                         "template (Re: original subject).")
    ap.add_argument("--followup-days", type=int, default=2,
                    help="Min days since original outreach to qualify for follow-up (default 2).")
    ap.add_argument("--i-know-what-im-doing", action="store_true",
                    help=f"Bypass HARD_DAILY_CAP of {HARD_DAILY_CAP}.")
    args = ap.parse_args()

    # One-off test-send path
    if args.to:
        return run_test_send(args)

    # Follow-up batch path
    if args.follow_up:
        return run_followup_batch(args)

    filt = parse_filter(args.filter)
    fieldnames, rows = read_leads()

    # Build the candidate list: has email, no first_outreach_date, matches filters
    candidates = []
    for i, row in enumerate(rows):
        if (row.get("first_outreach_date") or "").strip():
            continue
        if not (row.get("email") or "").strip():
            continue
        if not matches_filter(row, filt):
            continue
        if args.practice and args.practice.lower() not in (row.get("practice_name", "") or "").lower():
            continue
        candidates.append((i, row))

    if not candidates:
        print("No candidates match. Nothing to send.")
        return 0

    # Apply --limit
    candidates = candidates[: args.limit]

    # Daily cap check
    sent_today = already_sent_today_count()
    remaining_cap = HARD_DAILY_CAP - sent_today
    if not args.i_know_what_im_doing and len(candidates) > remaining_cap:
        print(f"Already sent {sent_today} today. Hard cap is {HARD_DAILY_CAP}. "
              f"Trimming this run to {max(0, remaining_cap)}.")
        candidates = candidates[: max(0, remaining_cap)]
        if not candidates:
            print("Cap reached. Use --i-know-what-im-doing to override.")
            return 0

    print(f"{'DRY-RUN' if not args.send else 'SEND'}: {len(candidates)} email(s). "
          f"Throttle={args.throttle}s. Already sent today: {sent_today}.")
    print()

    # Preview
    for _, row in candidates[:3]:
        subj, body = render_email(row)
        print("─" * 72)
        print(f"To:      {row['email']}")
        print(f"Subject: {subj}")
        print()
        print(body)
    if len(candidates) > 3:
        print(f"… and {len(candidates) - 3} more (same template, different lead data).")
    print("─" * 72)

    if not args.send:
        print("\nDry-run only. Pass --send to actually transmit.")
        return 0

    # Connect
    today = dt.date.today().isoformat()

    sent_count = 0
    err_count = 0
    with open_sender() as sender:
        for idx, (row_idx, row) in enumerate(candidates):
            subj, body = render_email(row)
            to = row["email"].strip()
            try:
                msg_id = sender.send(to, subj, body)
                rows[row_idx]["first_outreach_date"] = today
                rows[row_idx]["channel"] = "email"
                write_leads(fieldnames, rows)
                log_send({
                    "date": today,
                    "ts": dt.datetime.now().isoformat(timespec="seconds"),
                    "to": to,
                    "subject": subj,
                    "practice": row.get("practice_name", ""),
                    "status": "sent",
                    "msg_id": msg_id,
                    "from": getattr(sender, "sender", None),
                })
                sent_count += 1
                print(f"  [{idx + 1}/{len(candidates)}] sent: {row.get('practice_name', '')} -> {to}")
            except Exception as e:
                log_send({
                    "date": today,
                    "ts": dt.datetime.now().isoformat(timespec="seconds"),
                    "to": to,
                    "subject": subj,
                    "practice": row.get("practice_name", ""),
                    "status": "error",
                    "error": str(e),
                })
                err_count += 1
                print(f"  [{idx + 1}/{len(candidates)}] ERROR sending to {to}: {e}", file=sys.stderr)

            # Throttle (skip after last)
            if idx < len(candidates) - 1:
                time.sleep(args.throttle)

    print()
    print(f"Done. Sent: {sent_count}. Errors: {err_count}.")
    return 0 if err_count == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
