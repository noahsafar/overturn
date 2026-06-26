#!/usr/bin/env python3
"""Send the Yale-faculty interview-request email (NOT the cold-sales template).

This is a one-off, separate from the leads.csv cold-outreach flow. The
recipients are Yale faculty Noah wants 30 minutes with as domain experts, so
the message is the personal "expert perspective" draft, not the practice
sales pitch in send_outreach.py.

Auth: reuses OAuthSender from send_outreach.py — same Gmail OAuth token
(sends from noah.safar@yale.edu).

Safety:
  - --dry-run is the default. Pass --send to actually transmit.
  - --throttle SEC waits between sends (default 300 = 5 min).
  - Logs each send to outreach/faculty-sent-log.jsonl (kept separate from
    the sales sent-log so it doesn't pollute outreach metrics / follow-ups).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG_FILE = ROOT / "outreach" / "faculty-sent-log.jsonl"

SUBJECT = "Yale CS undergrad — 30 min on insurance claim denials?"

BODY_TEMPLATE = """\
Dear {greeting},

I'm a computer science undergrad at Yale building a project called Overturn \
through Tsai CITY this summer. We're tackling insurance claim denials, \
building an AI approach that handles payer-specific appeals quickly.

I'd love your perspective as an expert in {expertise} — especially on how \
denials and appeals actually play out in your setting.

Would you have 30 minutes in the next week or so? Happy to work around your \
schedule, in person or by Zoom.

Thank you for your time,
Noah Safar
203-435-5609 · noah.safar@yale.edu
"""

BEHAVIORAL = "behavioral health care delivery"
PMR = "physical medicine & rehabilitation"

# (greeting, email, expertise). greeting is what follows "" before the comma.
RECIPIENTS = [
    # Psychiatry / behavioral health
    ("Dr. Krystal",        "john.krystal@yale.edu",        BEHAVIORAL),
    ("Dr. O'Malley",       "stephanie.omalley@yale.edu",   BEHAVIORAL),
    ("Dr. Kaufman",        "joy.kaufman@yale.edu",         BEHAVIORAL),
    ("Dr. Sinha",          "rajita.sinha@yale.edu",        BEHAVIORAL),
    ("Dr. Gordon",         "derrick.gordon@yale.edu",      BEHAVIORAL),
    ("Dr. Pittenger",      "christopher.pittenger@yale.edu", BEHAVIORAL),
    ("Dr. Hoffman",        "paul.hoffman@yale.edu",        BEHAVIORAL),
    ("Dr. Petrakis",       "ismene.petrakis@yale.edu",     BEHAVIORAL),
    ("Dr. Picciotto",      "marina.picciotto@yale.edu",    BEHAVIORAL),
    ("Dr. Abdelnour",      "elie.abdelnour@yale.edu",      BEHAVIORAL),
    ("Dr. Abellard",       "jessica.abellard@yale.edu",    BEHAVIORAL),
    # PM&R / physiatry
    ("Dr. Aslam",          "rummana.aslam@yale.edu",       PMR),
    ("Dr. Dundas",         "mark.dundas@yale.edu",         PMR),
    ("Dr. Morgado-Vega",   "necolle.morgado-vega@yale.edu", PMR),
    ("Dr. Raju",           "robin.raju@yale.edu",          PMR),
    ("Dr. Rosen",          "Marc.L.Rosen@yale.edu",        PMR),
    ("Dr. San Juan",       "clarisse.sanjuan@yale.edu",    PMR),
    ("Dr. Tokarz",         "thomas.tokarz@yale.edu",       PMR),
]


def render(greeting: str, expertise: str) -> str:
    return BODY_TEMPLATE.format(greeting=greeting, expertise=expertise)


def log_send(record: dict) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a") as f:
        f.write(json.dumps(record) + "\n")


def already_sent() -> set[str]:
    """Emails already sent (from faculty-sent-log.jsonl), so a restart never
    double-sends to someone who already received the email."""
    out: set[str] = set()
    if not LOG_FILE.exists():
        return out
    for line in LOG_FILE.read_text().splitlines():
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("status") == "sent":
            e = (rec.get("to") or "").strip().lower()
            if e:
                out.add(e)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--send", action="store_true",
                    help="Actually send. Without this flag, dry-run.")
    ap.add_argument("--throttle", type=int, default=300,
                    help="Seconds between sends (default 300 = 5 min).")
    ap.add_argument("--limit", type=int, default=len(RECIPIENTS),
                    help="Max sends this run (default: all).")
    args = ap.parse_args()

    sent_set = already_sent()
    skipped = [r for r in RECIPIENTS if r[1].strip().lower() in sent_set]
    targets = [r for r in RECIPIENTS if r[1].strip().lower() not in sent_set]
    targets = targets[: args.limit]

    if skipped:
        print(f"Skipping {len(skipped)} already-sent: "
              f"{', '.join(r[1] for r in skipped)}")
        print()

    print(f"{'DRY-RUN' if not args.send else 'SEND'}: {len(targets)} faculty "
          f"email(s). Throttle={args.throttle}s "
          f"(~{(len(targets) - 1) * args.throttle // 60} min total).")
    print()

    # Full preview of the first, then the recipient list.
    g0, _, e0 = targets[0]
    print("─" * 72)
    print(f"Subject: {SUBJECT}")
    print()
    print(render(g0, e0))
    print("─" * 72)
    print("\nAll recipients:")
    for g, email, e in targets:
        print(f"  {g:<18} {email:<32} ({e})")
    print("─" * 72)

    if not args.send:
        print("\nDry-run only. Pass --send to actually transmit.")
        return 0

    # Import the sender only when actually sending (needs google libs).
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from send_outreach import OAuthSender

    today = dt.date.today().isoformat()
    sent = errs = 0
    with OAuthSender() as sender:
        for idx, (greeting, email, expertise) in enumerate(targets):
            body = render(greeting, expertise)
            try:
                msg_id = sender.send(email, SUBJECT, body)
                log_send({
                    "date": today,
                    "ts": dt.datetime.now().isoformat(timespec="seconds"),
                    "to": email,
                    "subject": SUBJECT,
                    "greeting": f"Dear {greeting}",
                    "status": "sent",
                    "kind": "faculty",
                    "msg_id": msg_id,
                    "from": getattr(sender, "sender", None),
                })
                sent += 1
                print(f"  [{idx + 1}/{len(targets)}] sent -> {email}")
            except Exception as e:
                log_send({
                    "date": today,
                    "ts": dt.datetime.now().isoformat(timespec="seconds"),
                    "to": email,
                    "subject": SUBJECT,
                    "status": "error",
                    "kind": "faculty",
                    "error": str(e),
                })
                errs += 1
                print(f"  [{idx + 1}/{len(targets)}] ERROR -> {email}: {e}",
                      file=sys.stderr)
            if idx < len(targets) - 1:
                time.sleep(args.throttle)

    print(f"\nDone. Sent: {sent}. Errors: {errs}.")
    return 0 if errs == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
