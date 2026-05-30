#!/usr/bin/env python3
"""Enrich docs/sales/leads.csv + generate personalized cold-email drafts.

What this does:
  1. For each lead row with a `website` and no `email`/`owner_or_pm_name`,
     fetch the practice's homepage + /about + /contact + /team + /staff
     pages. Extract publicly-listed email addresses and provider names.
  2. Update leads.csv in place with whatever we find.
  3. Generate a personalized cold-email draft as a .eml file in
     `outreach/drafts/<slug>.eml`. The .eml format imports cleanly into
     Gmail / Outlook drafts so YOU can review and hit send manually.

What this DOES NOT do:
  - Send the emails. (Drafts only — you review then send.)
  - Scrape LinkedIn, Hunter.io, ZoomInfo, etc. (TOS violations.)
  - Fabricate addresses.

Run as:
    python scripts/sales/enrich_and_draft.py
    # or with --dry-run to skip writing files
"""

from __future__ import annotations

import argparse
import csv
import logging
import os
import re
import sys
import time
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import httpx

ROOT = Path(__file__).resolve().parents[2]
LEADS_CSV = ROOT / "docs" / "sales" / "leads.csv"
DRAFTS_DIR = ROOT / "outreach" / "drafts"
LINKEDIN_DIR = ROOT / "outreach" / "linkedin"
THROTTLE_SECONDS = 2.0  # be a good citizen
TIMEOUT = 10.0
USER_AGENT = (
    "OverturnSalesScript/1.0 (research; reading public Contact/About pages; "
    "contact: noah.safar@yale.edu)"
)

# Pages most likely to hold contact info, in order.
CANDIDATE_PATHS = [
    "/",
    "/contact",
    "/contact-us",
    "/about",
    "/about-us",
    "/team",
    "/our-team",
    "/staff",
    "/providers",
    "/clinicians",
]

# Avoid fetching binary / asset paths
SKIP_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".css", ".js", ".ico")

EMAIL_RE = re.compile(r"\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})\b")
# Title patterns suggesting the listed person is an owner / decision-maker
TITLE_HINTS = re.compile(
    r"(?i)(founder|owner|medical director|clinical director|director of operations|"
    r"practice manager|office manager|administrator|principal|managing partner|"
    r"chief executive|president|CEO|practice owner)"
)
# Provider-credential hints (good fallback when no explicit title)
CRED_HINTS = re.compile(r"(?i)\b(MD|DO|DPT|PhD|PsyD|LCSW|APRN|NP|MS|MSN|RN)\b\.?")

# Junk LOCAL parts to ignore (template / privacy / common boilerplate)
EMAIL_BLOCKLIST = {
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "postmaster",
    "abuse",
    "privacy",
    "compliance",
    "legal",
    "webmaster",
    "example",
    "your-email",
    "youremail",
    "test",
    "name@",
}
# Junk DOMAINS — error trackers, CDN telemetry, payment providers' placeholder
# accounts, common framework noise. None of these are real practice contacts.
DOMAIN_BLOCKLIST = {
    "sentry.wixpress.com",
    "sentry.io",
    "wix.com",
    "wixpress.com",
    "wixsite.com",
    "squarespace.com",
    "godaddy.com",
    "google-analytics.com",
    "googletagmanager.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "linkedin.com",
    "stripe.com",
    "mailchimp.com",
    "constantcontact.com",
    "sentry-next.wixpress.com",
}
# Candidate name patterns that are obvious CTA / button text, not actual names.
NAME_FALSE_POSITIVES = re.compile(
    r"(?i)^(empathy meet|our staff|read more|online scheduling|"
    r"available read|learn more|book now|click here|view all|see more|"
    r"contact us|providers? richard|providers? team|our team)$"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("enrich")


@dataclass
class Enrichment:
    emails: list[str]
    candidate_names: list[str]
    candidate_owner: str | None


def _strip_tags(html: str) -> str:
    """Best-effort HTML → text. Avoids the BeautifulSoup dep."""
    # Remove script/style content entirely
    html = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", html, flags=re.I | re.S)
    # Decode common HTML entities
    html = html.replace("&nbsp;", " ").replace("&amp;", "&").replace("&#64;", "@").replace("&#46;", ".")
    # Strip remaining tags
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    return text


def _is_internal_link(href: str, base: str) -> bool:
    try:
        p = urlparse(urljoin(base, href))
        return urlparse(base).netloc == p.netloc
    except Exception:
        return False


def _slug(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s or "lead"


def _filter_emails(emails: Iterable[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for e in emails:
        e = e.strip().lower()
        if e in seen:
            continue
        seen.add(e)
        local, _, domain = e.partition("@")
        # Drop blocklist locals + obvious junk
        if any(b in local for b in EMAIL_BLOCKLIST):
            continue
        # Drop email-looking strings that are actually filenames/CSS
        if local.endswith(("2x", "3x", "png", "jpg")):
            continue
        # Drop telemetry / CDN / framework placeholder domains
        if domain in DOMAIN_BLOCKLIST:
            continue
        if any(domain.endswith("." + d) or domain == d for d in DOMAIN_BLOCKLIST):
            continue
        # Drop emails whose local part is a hex hash (32-char hex = Sentry-style)
        if len(local) >= 28 and re.fullmatch(r"[0-9a-f]+", local):
            continue
        out.append(e)
    # Prefer namelike emails (firstlast@, first.last@, first@) over generic info@/admin@
    def _rank(addr: str) -> tuple[int, str]:
        local = addr.split("@", 1)[0]
        if local in ("info", "office", "admin", "hello", "contact"):
            return (1, addr)
        return (0, addr)
    return sorted(out, key=_rank)


def _extract_names(text: str) -> tuple[list[str], str | None]:
    """Return (candidate_names_with_titles, best_owner_guess)."""
    candidates: list[str] = []
    owner_guess: str | None = None

    # Strategy 1: look for the title hints with the surrounding words
    for m in TITLE_HINTS.finditer(text):
        title = m.group(0)
        # Grab the 60 characters before the title and look for "Name Name" patterns
        start = max(m.start() - 80, 0)
        window = text[start : m.start()]
        # Capture "Firstname [Middle] Lastname" sequences (capitalized)
        for nm in re.finditer(r"\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b", window):
            name = nm.group(1).strip()
            # Drop CTA-text false positives
            if NAME_FALSE_POSITIVES.match(name):
                continue
            entry = f"{name} ({title})"
            if entry not in candidates:
                candidates.append(entry)
            if owner_guess is None and re.search(r"(?i)owner|founder|president|CEO|managing partner|principal", title):
                owner_guess = entry

    # Strategy 2: provider-credentials right after a name
    if owner_guess is None:
        for m in CRED_HINTS.finditer(text):
            cred = m.group(0)
            start = max(m.start() - 60, 0)
            window = text[start : m.start()]
            nm_match = re.search(r"\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\s*,?\s*$", window)
            if nm_match:
                name = nm_match.group(1).strip()
                entry = f"{name}, {cred}"
                if entry not in candidates:
                    candidates.append(entry)

    return candidates[:15], owner_guess


def _fetch(client: httpx.Client, url: str) -> str | None:
    if any(url.lower().endswith(ext) for ext in SKIP_EXTENSIONS):
        return None
    try:
        r = client.get(url, follow_redirects=True, timeout=TIMEOUT)
        if r.status_code != 200:
            log.debug("  %s → %d", url, r.status_code)
            return None
        ctype = r.headers.get("content-type", "")
        if "html" not in ctype.lower() and "text/" not in ctype.lower():
            return None
        return r.text
    except httpx.RequestError as e:
        log.debug("  %s → %s", url, e)
        return None


def enrich_one(website: str) -> Enrichment:
    """Fetch a few candidate pages on `website` and extract emails + names."""
    if not website:
        return Enrichment([], [], None)
    if not website.startswith(("http://", "https://")):
        website = "https://" + website

    all_text: list[str] = []
    emails: list[str] = []

    with httpx.Client(headers={"User-Agent": USER_AGENT}) as client:
        for path in CANDIDATE_PATHS:
            url = urljoin(website, path)
            html = _fetch(client, url)
            time.sleep(THROTTLE_SECONDS)  # ALWAYS sleep, even on miss — be polite
            if not html:
                continue
            log.info("  fetched %s", url)
            text = _strip_tags(html)
            all_text.append(text)
            for m in EMAIL_RE.finditer(html):
                emails.append(m.group(1))

    full_text = " ".join(all_text)
    candidate_names, owner_guess = _extract_names(full_text)
    return Enrichment(
        emails=_filter_emails(emails),
        candidate_names=candidate_names,
        candidate_owner=owner_guess,
    )


def _strip_credentials(name: str) -> list[str]:
    """Return just the actual name parts, dropping credentials + suffixes.

    'Ernest F Santoro III DPT FAAOMPT' → ['Ernest', 'F', 'Santoro']
    'David M. Aversa MD MPH' → ['David', 'M.', 'Aversa']
    'Dr. Richard Yun, MD' → ['Richard', 'Yun']
    """
    # Drop everything after the first comma
    name = name.split(",", 1)[0].strip()
    # Drop the leading "Dr." / "Dr"
    name = re.sub(r"^(?:Dr|Mr|Mrs|Ms|Prof)\.?\s+", "", name, flags=re.I)
    # Token-by-token: drop credentials + roman numerals
    cred_set = {
        "MD", "DO", "PhD", "PsyD", "DPT", "DC", "DDS", "DPM",
        "LCSW", "LMHC", "LMFT", "APRN", "PMHNP", "NP", "FNP", "ANP",
        "RN", "BSN", "MSN", "MS", "MA", "BA", "BS", "MBA", "MPH", "MEd",
        "FAAOMPT", "OCS", "DNP", "PA-C", "PA", "DABNM", "FACS", "FAAP",
        "FAAFP", "ABPP", "DCC",
    }
    cred_lower = {c.lower() for c in cred_set}
    roman = re.compile(r"^(I{1,3}|IV|V|VI{0,3}|IX|X|Jr|Sr|II|III|IV)\.?$", re.I)
    parts: list[str] = []
    for tok in name.replace(",", "").split():
        tt = tok.rstrip(".")
        if tt.lower() in cred_lower:
            continue
        if roman.match(tt):
            continue
        parts.append(tok.rstrip(","))
    return parts


def _make_salutation(owner_name: str, title: str) -> str:
    """Produce 'Dr. Lastname' / 'Firstname' / 'there'."""
    if not owner_name:
        return "there"
    parts = _strip_credentials(owner_name)
    if not parts:
        return "there"
    has_dr = bool(re.search(r"(?i)\b(Dr|MD|DO|PhD|DPT|PsyD|DNP|DC)\b", owner_name + " " + title))
    if has_dr and len(parts) >= 2:
        return f"Dr. {parts[-1]}"
    return parts[0]


def render_draft(row: dict[str, str]) -> str:
    """Pick the right cold-email variant + personalize."""
    practice = row.get("practice_name", "your practice").strip()
    city = row.get("city", "your area").strip()
    specialty = row.get("specialty", "").strip().lower()
    owner_name = (row.get("owner_or_pm_name") or "").strip()
    title = (row.get("title") or "").strip()

    # Pick variant
    is_owner = bool(title) and re.search(r"(?i)owner|founder|president|director|MD|DPT|PsyD", title)
    is_pm = bool(title) and re.search(r"(?i)practice manager|administrator|office manager", title)

    salutation = _make_salutation(owner_name, title)

    spec_phrase = "specialty practice"
    if "behavioral" in specialty or "psychiatry" in specialty or "psychotherapy" in specialty:
        spec_phrase = "behavioral health practice"
    elif "physical therapy" in specialty:
        spec_phrase = "physical therapy practice"

    if is_pm:
        # Variant B (practice manager)
        body = f"""Hi {salutation},

Saw on LinkedIn (or your practice's About page) that you run operations at {practice}. I'm a Yale student building Overturn — AI agents that draft and submit appeals on denied insurance claims for small {spec_phrase}s. Outcomes-based pricing: practice pays nothing unless we recover money.

I'm trying to learn how practices like {practice} handle denial follow-up today — what gets worked vs. written off, who does the work, what makes it slow. Would you have 15-20 minutes for a research call? I'm not pitching yet, just trying to understand the problem from people who live it.

Some times next week: Mon 2 PM, Tue 11 AM, Thu 3 PM ET. Happy to be flexible.

Thanks,
Noah Safar
Yale 'XX
[phone]
"""
        subject = f"How does {practice} work denied claims?"
    elif is_owner:
        # Variant A (owner-physician)
        body = f"""{salutation},

I'm a Yale student building Overturn — software that automates appeals on denied insurance claims for small {spec_phrase}s. We draft the appeal letter, verify every citation against the payer's published medical policies, get a human at your practice to approve, then submit through the portal.

I'd love 15 minutes to learn how {practice} handles denials today — what your biller actually does with them, which ones get worked, which ones get written off. I'm trying to understand whether the problem we've built for is the problem you actually have.

No pitch, no slides. Genuine research call. I can come to your {city} office or do it over Zoom — your call.

Available windows next week: Mon 2 PM, Tue 11 AM, Thu 3 PM ET.

Thanks,
Noah Safar
Yale 'XX · [phone]
"""
        subject = f"Yale student building denial-recovery tooling — 15 min?"
    else:
        # Variant C (generic owner / unspecified)
        body = f"""Hi {salutation},

I'm a Yale student building Overturn — AI agents that handle appeals on denied insurance claims for small {spec_phrase}s. End-to-end: drafting against the payer's published policy, citing real chart notes, submitting through the portal. Outcomes-based pricing — practice pays nothing unless we recover money.

I'm not pitching yet. I want to understand how {practice} handles denials today before I tell you whether what we've built actually solves your problem. 15 minutes next week?

Available: Mon 2 PM, Tue 11 AM, Thu 3 PM ET.

Thanks,
Noah Safar
Yale 'XX
[phone]
"""
        subject = f"{city} {spec_phrase} + denied claims — Yale student question"

    return subject, body


def render_linkedin_dm(row: dict[str, str]) -> tuple[str, str]:
    """Return (connect_note, follow_up). LinkedIn limits connect notes to
    300 chars."""
    practice = row.get("practice_name", "your practice").strip()
    specialty = row.get("specialty", "").strip().lower()
    spec_phrase = "behavioral-health practice"
    if "physical therapy" in specialty:
        spec_phrase = "physical-therapy practice"

    salutation = _make_salutation(
        row.get("owner_or_pm_name", ""),
        row.get("title", ""),
    )
    name_prefix = "" if salutation == "there" else f"{salutation} — "

    connect_note = (
        f"{name_prefix}I'm a Yale student building Overturn, software that "
        f"automates denial appeals for small {spec_phrase}s. Trying to learn "
        f"how teams like {practice} handle denials today. Open to connecting "
        f"+ a quick research question?"
    )
    if len(connect_note) > 300:
        # Trim politely
        connect_note = connect_note[:297].rsplit(" ", 1)[0] + "..."

    follow_up = (
        f"Thanks for connecting, {salutation if salutation != 'there' else 'there'}. "
        f"As I mentioned — I'm building Overturn at Yale, AI agents that draft "
        f"+ submit appeals on denied claims (outcomes-based pricing: you pay "
        f"nothing unless we recover money).\n\n"
        f"Before I get into whether it'd help you, I want to learn how "
        f"{practice} handles denial follow-up today. Would you have 15 minutes "
        f"for a research call next week? Some times: Mon 2 PM, Tue 11 AM, "
        f"Thu 3 PM ET."
    )
    return connect_note, follow_up


def write_linkedin_dm(connect_note: str, follow_up: str, slug: str) -> Path:
    LINKEDIN_DIR.mkdir(parents=True, exist_ok=True)
    path = LINKEDIN_DIR / f"{slug}.txt"
    path.write_text(
        f"=== CONNECT NOTE ({len(connect_note)} chars; LinkedIn limit 300) ===\n\n"
        f"{connect_note}\n\n"
        f"=== FOLLOW-UP (send after they accept) ===\n\n"
        f"{follow_up}\n",
        encoding="utf-8",
    )
    return path


def write_eml(subject: str, body: str, to_addr: str, slug: str) -> Path:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = "noah.safar@yale.edu"
    msg["To"] = to_addr
    msg.set_content(body)
    DRAFTS_DIR.mkdir(parents=True, exist_ok=True)
    path = DRAFTS_DIR / f"{slug}.eml"
    path.write_bytes(bytes(msg))
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-enrich", action="store_true", help="skip web fetches, only regenerate drafts")
    args = ap.parse_args()

    if not LEADS_CSV.exists():
        log.error("leads.csv not found at %s", LEADS_CSV)
        return 1

    with LEADS_CSV.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(csv.DictReader(open(LEADS_CSV, encoding="utf-8")).fieldnames or [])

    if not rows:
        log.error("leads.csv has no data rows")
        return 1

    enriched = 0
    drafts_written = 0
    for row in rows:
        practice = row.get("practice_name", "").strip()
        if not practice:
            continue
        log.info("→ %s (%s)", practice, row.get("city"))

        # 1. Enrich if needed
        if not args.skip_enrich and row.get("website") and not row.get("email"):
            enr = enrich_one(row["website"])
            if enr.emails:
                row["email"] = enr.emails[0]
                enriched += 1
                log.info("  + email: %s (also found: %s)", row["email"], enr.emails[1:5] or "—")
            if enr.candidate_owner and not row.get("owner_or_pm_name"):
                # Format: "Name (title)" — extract name part
                name_match = re.match(r"^([^()]+?)\s*\(([^)]+)\)$", enr.candidate_owner)
                if name_match:
                    row["owner_or_pm_name"] = name_match.group(1).strip()
                    row["title"] = name_match.group(2).strip()
                else:
                    row["owner_or_pm_name"] = enr.candidate_owner
                log.info("  + owner: %s", enr.candidate_owner)
            if enr.candidate_names:
                # Append candidate names to notes for manual review
                existing_notes = row.get("notes", "") or ""
                tag = f"[candidates: {'; '.join(enr.candidate_names[:5])}]"
                if tag not in existing_notes:
                    row["notes"] = (existing_notes + " " + tag).strip()

        # 2. Generate draft if we now have an email
        if row.get("email"):
            subject, body = render_draft(row)
            slug = _slug(practice)
            if args.dry_run:
                log.info("  (dry-run) would write draft → %s.eml", slug)
            else:
                path = write_eml(subject, body, row["email"], slug)
                log.info("  ✎ draft → %s", path.relative_to(ROOT))
                drafts_written += 1

        # 3. Always generate a LinkedIn DM (no email required — you'll need
        # to manually find them on LinkedIn anyway)
        slug = _slug(practice)
        connect_note, follow_up = render_linkedin_dm(row)
        if not args.dry_run:
            path = write_linkedin_dm(connect_note, follow_up, slug)
            log.info("  ⋈ linkedin → %s", path.relative_to(ROOT))

    # 3. Write enriched CSV
    if not args.dry_run and not args.skip_enrich:
        with LEADS_CSV.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        log.info("✓ leads.csv updated (%d enriched, %d drafts)", enriched, drafts_written)
    else:
        log.info("(dry-run) %d would-be-enriched, %d would-be-drafts", enriched, drafts_written)

    return 0


if __name__ == "__main__":
    sys.exit(main())
