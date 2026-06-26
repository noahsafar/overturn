#!/usr/bin/env python3
"""One-shot: add batch 2 leads found 2026-06-09."""
import csv, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEADS_CSV = ROOT / "docs" / "sales" / "leads.csv"

NEW_LEADS = [
    # --- MN / WI / KS / NE ---
    {"practice_name": "Lakes Dermatology", "city": "St. Louis Park", "state": "MN", "specialty": "Dermatology", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "hello@lakesderm.com", "phone": "", "website": "https://www.lakesderm.com", "source": "research 2026-06-09", "notes": "Independent derm, 2 locations. Email from site."},
    {"practice_name": "Dermatology Partners of Rochester", "city": "Rochester", "state": "MN", "specialty": "Dermatology", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "scheduling@mndermatologypartners.com", "phone": "", "website": "https://mn-dermatology-partners.com", "source": "research 2026-06-09", "notes": "Independent derm. Email from site."},
    {"practice_name": "Koca Chiropractic Clinic", "city": "Omaha", "state": "NE", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "solutions@kocachiropractic.com", "phone": "", "website": "https://kocachiropractic.com", "source": "research 2026-06-09", "notes": "Independent chiro. Omaha NE. Email from site."},
    {"practice_name": "Body in Motion Physical Therapy", "city": "Prairie Village", "state": "KS", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Sushma Patel", "title": "PT, MTC/Owner", "email": "contact@bodyinmotionkc.com", "phone": "", "website": "https://bodyinmotionkc.com", "source": "research 2026-06-09", "notes": "Owner-led PT. Kansas City area. Email from site."},
    {"practice_name": "Advanced Chiropractic Wichita", "city": "Wichita", "state": "KS", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "office@advancedchiroict.com", "phone": "", "website": "https://www.advancedchiroict.com", "source": "research 2026-06-09", "notes": "Independent chiro. Wichita KS. Email from contact page."},
    {"practice_name": "Complete Physical Therapy", "city": "Lincoln", "state": "NE", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Nick Reiss", "title": "PT, DPT/Owner", "email": "office@completeptlincoln.com", "phone": "", "website": "https://completeptlincoln.com", "source": "research 2026-06-09", "notes": "Owner-PT. Lincoln NE. Email from site."},
    {"practice_name": "Milwaukee Advanced Physical Therapy", "city": "Milwaukee", "state": "WI", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@milwaukeeadvancedpt.com", "phone": "", "website": "https://www.milwaukeeadvancedpt.com", "source": "research 2026-06-09", "notes": "Independent PT. Milwaukee WI. Email from site."},
    {"practice_name": "Howard Chiropractic Clinic", "city": "Green Bay", "state": "WI", "specialty": "Chiropractic", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Dennis King", "title": "DC", "email": "drdjk@hccgb.com", "phone": "", "website": "https://www.howardchiropractic.info", "source": "research 2026-06-09", "notes": "Multi-physician independent chiro since 1988. Owner email from contact page."},

    # --- UT / NM / MT / ID ---
    {"practice_name": "Dynamic Physical Therapy", "city": "Salt Lake City", "state": "UT", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@dynamicptut.com", "phone": "", "website": "https://dynamicptut.com", "source": "research 2026-06-09", "notes": "Independent PT. Salt Lake City. Email from contact page."},
    {"practice_name": "Dermatology of New Mexico", "city": "Albuquerque", "state": "NM", "specialty": "Dermatology", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Suraj Reddy & Dr. Shilpa Reddy", "title": "MD/Owners", "email": "contact@dermatologynm.com", "phone": "", "website": "https://dermatologynm.com", "source": "research 2026-06-09", "notes": "Owner-physician couple. Independent derm Albuquerque. Email from site."},
    {"practice_name": "Inspire Physical Therapy and Wellness", "city": "Missoula", "state": "MT", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@inspireptmissoula.com", "phone": "", "website": "https://www.inspireptmissoula.com", "source": "research 2026-06-09", "notes": "Independent PT. Missoula MT. Email from contact page."},
    {"practice_name": "Range Physical Therapy + Wellness", "city": "Missoula", "state": "MT", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Maddie Leininger Small", "title": "PT, DPT/Owner", "email": "info@rangeptmontana.com", "phone": "", "website": "https://www.rangeptmontana.com", "source": "research 2026-06-09", "notes": "Women-owned boutique PT. Missoula MT. Email from site."},
    {"practice_name": "Scally Mental Health", "city": "Missoula", "state": "MT", "specialty": "Behavioral health (counseling)", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Shannon Scally", "title": "NP/Founder", "email": "info@scallymentalhealth.com", "phone": "", "website": "https://www.spmhmontana.com", "source": "research 2026-06-09", "notes": "Founder-NP led behavioral health. Missoula MT. Email from site."},
    {"practice_name": "West Billings Physical Therapy & Sports Medicine", "city": "Billings", "state": "MT", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "Dan Sebastian", "title": "PT/Co-owner", "email": "info@westbillingspt.com", "phone": "", "website": "https://westbillingspt.com", "source": "research 2026-06-09", "notes": "Co-owner PT. Billings MT. Email from site."},
    {"practice_name": "Tree City Counseling Center", "city": "Boise", "state": "ID", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@tcccounselors.org", "phone": "", "website": "https://www.treecitycounselorsboise.com", "source": "research 2026-06-09", "notes": "Independent counseling. Boise ID. Email from contact page."},
    {"practice_name": "Idaho Physio", "city": "Idaho Falls", "state": "ID", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "admin@idahophysio.com", "phone": "", "website": "https://www.idahophysio.com", "source": "research 2026-06-09", "notes": "Independent PT. Idaho Falls ID. Email from site."},

    # --- AL / MS / AR / LA ---
    {"practice_name": "Birmingham Physical Therapy & Sports Medicine", "city": "Vestavia Hills", "state": "AL", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "BirminghamPT@gmail.com", "phone": "", "website": "https://birminghamphysicaltherapy.com", "source": "research 2026-06-09", "notes": "Orthopedic PT. Vestavia Hills AL. Email from contact page."},
    {"practice_name": "Agile Physical Therapy", "city": "Vestavia Hills", "state": "AL", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Lisa Altamirano", "title": "PT/Owner", "email": "info@myagilept.com", "phone": "", "website": "https://www.myagilept.com", "source": "research 2026-06-09", "notes": "Orthopedic, sports, dance PT. Owner-led. Birmingham AL area. Email from site."},
    {"practice_name": "Steel City Speech", "city": "Birmingham", "state": "AL", "specialty": "Pediatric speech+OT", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "contact@steelcityspeech.com", "phone": "", "website": "https://www.steelcityspeech.com", "source": "research 2026-06-09", "notes": "Pediatric speech and OT. Birmingham AL. Email from site."},
    {"practice_name": "Excel Pediatric Therapy Services", "city": "Montgomery", "state": "AL", "specialty": "Pediatric OT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "Rusty Becker", "title": "Founder", "email": "frontoffice.excelrehab@gmail.com", "phone": "", "website": "https://excelpediatrictherapy.com", "source": "research 2026-06-09", "notes": "Pediatric OT and speech. Montgomery AL. Email from contact page."},
    {"practice_name": "In Touch Physical Therapy", "city": "Jackson", "state": "MS", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Sharmon Robinson", "title": "PT, DPT/Owner", "email": "intouchPT601@gmail.com", "phone": "", "website": "https://intouchphysicaltherapyms.com", "source": "research 2026-06-09", "notes": "Orthopedic outpatient PT. Owner-led. Jackson MS. Email from site."},
    {"practice_name": "Bright Steps Therapy", "city": "Hattiesburg", "state": "MS", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "Shannon & Marcus Houston", "title": "DPT/Owners", "email": "info@brightstepstherapyllc.com", "phone": "", "website": "https://brightstepstherapy.com", "source": "research 2026-06-09", "notes": "Pediatric PT, OT, speech. Owner couple. Hattiesburg MS. Email from contact page."},
    {"practice_name": "Let's Talk Therapy Services", "city": "Little Rock", "state": "AR", "specialty": "Pediatric speech+OT+PT", "providers_estimate": "3-5", "owner_or_pm_name": "Christy Wygal & Roxann Owen", "title": "Co-Owners", "email": "info@letstalkar.com", "phone": "", "website": "https://letstalkar.com", "source": "research 2026-06-09", "notes": "Pediatric speech, OT, PT. Co-owner led. Little Rock AR. Email from contact page."},
    {"practice_name": "PlayRx Therapy", "city": "Sherwood", "state": "AR", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "1-3", "owner_or_pm_name": "Sarah Clark", "title": "MS OTR/L/Founder", "email": "office@playrxtherapy.com", "phone": "", "website": "https://www.playrxtherapy.com", "source": "research 2026-06-09", "notes": "Founder-OT led pediatric therapy. Sherwood AR. Email from contact page."},
    {"practice_name": "Kidsource Therapy", "city": "Benton", "state": "AR", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@kidsourcetherapy.com", "phone": "", "website": "https://kidsourcetherapy.com", "source": "research 2026-06-09", "notes": "Pediatric OT, PT, speech. 2 AR locations. Email from contact page."},
    {"practice_name": "Horizon Ortho Rehab & Diagnostics", "city": "North Little Rock", "state": "AR", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@horizonordclinic.com", "phone": "", "website": "https://horizonordclinic.com", "source": "research 2026-06-09", "notes": "PT, chiro, OT, rehab. North Little Rock AR. Email from site."},
    {"practice_name": "Southern Oaks Pediatric Therapy", "city": "New Orleans", "state": "LA", "specialty": "Pediatric speech+feeding", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@southernoakspediatric.com", "phone": "", "website": "https://www.southernoakspediatric.com", "source": "research 2026-06-09", "notes": "Pediatric speech, language, feeding. New Orleans LA. Email from site."},
    {"practice_name": "Spark Pediatric Therapy", "city": "New Orleans", "state": "LA", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "1-3", "owner_or_pm_name": "Kristen Fernandez", "title": "Founder", "email": "hello@sparkpediatrictherapy.com", "phone": "", "website": "https://www.sparkpediatrictherapy.com", "source": "research 2026-06-09", "notes": "Founder-led pediatric therapy. New Orleans LA. Email from contact page."},
    {"practice_name": "Function First Physical Therapy", "city": "Shreveport", "state": "LA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "contactus@functionfirstla.com", "phone": "", "website": "https://functionfirstla.com", "source": "research 2026-06-09", "notes": "Orthopedic sports PT. Shreveport LA. Email from contact page."},
    {"practice_name": "Nola Speech and Language", "city": "New Orleans", "state": "LA", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Lesley Gattuso Brown", "title": "MCD CCC-SLP/Owner", "email": "lesley@nolaspeechandlanguage.com", "phone": "", "website": "https://www.nolaspeechandlanguage.com", "source": "research 2026-06-09", "notes": "Owner-SLP pediatric speech. New Orleans LA. Email from contact page."},
]


def main():
    with LEADS_CSV.open(newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        existing_rows = list(reader)

    existing_practices = {r.get("practice_name", "").strip().lower() for r in existing_rows}
    existing_emails = {r.get("email", "").strip().lower() for r in existing_rows if r.get("email", "").strip()}

    to_add = []
    for lead in NEW_LEADS:
        name_key = lead["practice_name"].strip().lower()
        email_key = lead.get("email", "").strip().lower()
        if name_key in existing_practices:
            print(f"SKIP (dup name): {lead['practice_name']}")
            continue
        if email_key and email_key in existing_emails:
            print(f"SKIP (dup email): {lead['practice_name']} — {email_key}")
            continue
        to_add.append(lead)
        existing_practices.add(name_key)
        if email_key:
            existing_emails.add(email_key)

    if not to_add:
        print("Nothing new to add.")
        return

    with LEADS_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        for lead in to_add:
            row = {field: "" for field in fieldnames}
            row.update(lead)
            row["STATUS"] = "📋 READY"
            writer.writerow(row)

    print(f"Added {len(to_add)} leads.")


if __name__ == "__main__":
    main()
