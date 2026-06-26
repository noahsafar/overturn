#!/usr/bin/env python3
"""One-shot: add 45 verified leads found 2026-06-09."""
import csv, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEADS_CSV = ROOT / "docs" / "sales" / "leads.csv"

NEW_LEADS = [
    # --- MD / VA Pediatric Therapy ---
    {"practice_name": "The Therapy Spot", "city": "Baltimore", "state": "MD", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "office@thetherapyspot.biz", "phone": "", "website": "https://www.baltimoretherapyspot.com", "source": "research 2026-06-09", "notes": "Pediatric speech, OT, PT. Email confirmed on contact page."},
    {"practice_name": "Small Successes Pediatric Speech Therapy", "city": "Ellicott City", "state": "MD", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Monica Kile Levine", "title": "Owner/SLP", "email": "info@smallsuccessestherapy.com", "phone": "", "website": "https://www.smallsuccessestherapy.com", "source": "research 2026-06-09", "notes": "Owner-operated pediatric speech therapy. Email from contact page."},
    {"practice_name": "Annapolis Children's Therapy Center", "city": "Annapolis", "state": "MD", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "5-10", "owner_or_pm_name": "Renee Hillmann Prentice", "title": "PT/Owner", "email": "actcemail@annapolischildrenstherapy.com", "phone": "", "website": "https://www.annapolischildrenstherapy.com", "source": "research 2026-06-09", "notes": "Pediatric PT, OT, speech, craniosacral. Owner-PT. Email from contact page."},
    {"practice_name": "Phoenix Therapies+", "city": "Forest Hill", "state": "MD", "specialty": "Pediatric speech+OT+feeding", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@phoenixspeechtherapy.net", "phone": "", "website": "https://www.myphoenixplus.net", "source": "research 2026-06-09", "notes": "Pediatric speech, OT, feeding, ed advocacy. Email from homepage."},
    {"practice_name": "ITR Physical Therapy", "city": "Bethesda", "state": "MD", "specialty": "Physical therapy (pelvic + pediatric)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@itrphysicaltherapy.com", "phone": "", "website": "https://itrphysicaltherapy.com", "source": "research 2026-06-09", "notes": "Pelvic health and pediatric PT. Email from location page."},
    {"practice_name": "Exceptional Children's Center", "city": "Alexandria", "state": "VA", "specialty": "Pediatric OT+speech+feeding", "providers_estimate": "5-10", "owner_or_pm_name": "Philip & Tracy Greer", "title": "Owners", "email": "info@exceptionalchildrenscenter.com", "phone": "", "website": "https://www.exceptionalchildrenscenter.com", "source": "research 2026-06-09", "notes": "Pediatric OT, speech, feeding. Owner-couple. Email from footer."},
    {"practice_name": "Fairfax Pediatric Therapy", "city": "Fairfax", "state": "VA", "specialty": "Pediatric OT+speech", "providers_estimate": "1-3", "owner_or_pm_name": "Ariel Shen", "title": "OT/Owner", "email": "ariel@fairfaxpediatrictherapy.com", "phone": "", "website": "https://fairfaxpediatrictherapy.com", "source": "research 2026-06-09", "notes": "Boutique pediatric OT, speech, music therapy. Owner email from contact page."},
    {"practice_name": "Pediatric Therapy Specialists", "city": "Fairfax", "state": "VA", "specialty": "Pediatric OT+PT", "providers_estimate": "3-5", "owner_or_pm_name": "Tasha Malhotra", "title": "Co-Owner", "email": "tasha@novapedtherapy.com", "phone": "", "website": "https://novapedtherapy.com", "source": "research 2026-06-09", "notes": "Pediatric OT, PT. Co-owner email from contact page."},
    {"practice_name": "Spectrum Pediatrics", "city": "Alexandria", "state": "VA", "specialty": "Pediatric OT+PT+speech+feeding", "providers_estimate": "5-10", "owner_or_pm_name": "Molly James", "title": "Practice Manager", "email": "therapy@spectrumpediatrics.com", "phone": "", "website": "https://www.spectrumpediatrics.com", "source": "research 2026-06-09", "notes": "Pediatric OT, PT, speech, feeding. Email from homepage contact section."},
    {"practice_name": "Skills on the Hill", "city": "Arlington", "state": "VA", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "5-10", "owner_or_pm_name": "Kristen Masci", "title": "Owner/CEO", "email": "sothva@skillsonthehill.com", "phone": "", "website": "https://skillsonthehill.com", "source": "research 2026-06-09", "notes": "Pediatric OT, PT, speech. Owner-CEO. Email from contact page."},
    {"practice_name": "Little Hands Pediatric Therapy", "city": "Ashburn", "state": "VA", "specialty": "Pediatric OT+PT+speech+feeding", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "office@littlehandspediatrictherapy.com", "phone": "", "website": "https://littlehandspediatrictherapy.com", "source": "research 2026-06-09", "notes": "Pediatric OT, PT, speech, feeding. Email from contact-us page."},

    # --- OH / MI Physical Therapy & Pediatric Therapy ---
    {"practice_name": "Fitness Matters Physical Therapy", "city": "Columbus", "state": "OH", "specialty": "Physical therapy", "providers_estimate": "5-10", "owner_or_pm_name": "Travis", "title": "", "email": "travis@fm2us.com", "phone": "", "website": "https://fm2us.com", "source": "research 2026-06-09", "notes": "4 Columbus-area locations. Named owner email confirmed on all location pages."},
    {"practice_name": "In Motion Physical Therapy", "city": "University Heights", "state": "OH", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "office@inmotionptohio.com", "phone": "", "website": "https://inmotionptohio.com", "source": "research 2026-06-09", "notes": "PT, sports rehab, vestibular. Cleveland area. Email from homepage."},
    {"practice_name": "Outlive Performance Physical Therapy", "city": "Columbus", "state": "OH", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@outliveperformancept.com", "phone": "", "website": "https://www.outliveperformancept.com", "source": "research 2026-06-09", "notes": "Sports performance PT. Independent. Email from site."},
    {"practice_name": "WAVE PT & Pilates", "city": "Cincinnati", "state": "OH", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@anchorcincy.com", "phone": "", "website": "https://makeawavecincy.com", "source": "research 2026-06-09", "notes": "PT + Pilates. Independent boutique. Email from contact page."},
    {"practice_name": "Alternative Physical Therapy", "city": "Toledo", "state": "OH", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@alternativephysicaltherapy.com", "phone": "", "website": "https://www.alternativephysicaltherapy.com", "source": "research 2026-06-09", "notes": "Whole-body and aquatic PT. Independent. Email from site."},
    {"practice_name": "Pediatric Therapy Partners", "city": "Lewis Center", "state": "OH", "specialty": "Pediatric OT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "Nicole Studer", "title": "Owner/OT", "email": "info@ptpohio.com", "phone": "", "website": "https://ptpohio.com", "source": "research 2026-06-09", "notes": "Pediatric OT and speech. Columbus-area. Owner OT. Email from site."},
    {"practice_name": "Blossom Pediatric Therapy Partners", "city": "Columbus", "state": "OH", "specialty": "Pediatric OT+speech", "providers_estimate": "1-3", "owner_or_pm_name": "Alyssa Moody", "title": "Founder", "email": "alyssa@blossomptp.com", "phone": "", "website": "https://www.blossomptp.com", "source": "research 2026-06-09", "notes": "Pediatric OT and speech. Founder email from contact page."},
    {"practice_name": "Onward Pediatric Therapies", "city": "Columbus", "state": "OH", "specialty": "Pediatric OT+PT", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@onwardpediatrictherapies.com", "phone": "", "website": "https://onwardpediatrictherapies.com", "source": "research 2026-06-09", "notes": "Pediatric PT and OT. Columbus. Email from site."},
    {"practice_name": "Michigan Pediatric Therapy", "city": "Farmington Hills", "state": "MI", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "info@mipediatrictherapy.com", "phone": "", "website": "https://mipediatrictherapy.com", "source": "research 2026-06-09", "notes": "Pediatric OT, PT, speech. Detroit metro. Email from contact page."},
    {"practice_name": "Building Blocks Pediatric Therapy", "city": "Auburn Hills", "state": "MI", "specialty": "Pediatric OT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "Jake Schmidt", "title": "Owner", "email": "jake@bbpediatrictherapy.com", "phone": "", "website": "https://bbpediatrictherapy.com", "source": "research 2026-06-09", "notes": "Pediatric OT, speech, ABA. Owner email confirmed from site."},
    {"practice_name": "Vitality At Home Physical & OT", "city": "Grand Rapids", "state": "MI", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Jenna Smith", "title": "PT, DPT/Owner", "email": "vitalityptgr@gmail.com", "phone": "", "website": "https://vitalityptgr.com", "source": "research 2026-06-09", "notes": "Home-based PT and OT. Owner email from contact page."},
    {"practice_name": "Premier Rehabilitation", "city": "Lansing", "state": "MI", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "Jeffrey Cook & Tyler Wilson", "title": "Co-Owners", "email": "reception@premierrehabpt.com", "phone": "", "website": "https://premierrehabpt.com", "source": "research 2026-06-09", "notes": "PT and sports medicine. Co-owner led. Email from contact page."},

    # --- NC / TN / KY Dermatology, Rheumatology, Chiropractic ---
    {"practice_name": "North Carolina Center for Dermatology", "city": "Durham", "state": "NC", "specialty": "Dermatology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Jeffrey Scales", "title": "MD/Owner", "email": "nccd14@gmail.com", "phone": "", "website": "https://nccdermatology.com", "source": "research 2026-06-09", "notes": "Independent derm. Owner email published on site."},
    {"practice_name": "Raleigh Rheumatology Associates", "city": "Raleigh", "state": "NC", "specialty": "Rheumatology", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Atul Kapila", "title": "MD", "email": "info@raleighrheumatology.com", "phone": "", "website": "https://raleighrheumatology.com", "source": "research 2026-06-09", "notes": "Independent rheumatology. 2 physicians. Email from site."},
    {"practice_name": "Triangle Arthritis & Rheumatology Associates", "city": "Raleigh", "state": "NC", "specialty": "Rheumatology", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "choneycutt@trianglearthritis.com", "phone": "", "website": "https://www.trianglearthritis.com", "source": "research 2026-06-09", "notes": "Independent rheumatology. Practice admin email from privacy policy page."},
    {"practice_name": "East Nashville Chiropractic Clinic", "city": "Nashville", "state": "TN", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@eastnashvillechiro.com", "phone": "", "website": "https://eastnashvillechiro.com", "source": "research 2026-06-09", "notes": "Independent chiro. Nashville. Email confirmed across 3 site pages."},
    {"practice_name": "The DERM Center", "city": "Chattanooga", "state": "TN", "specialty": "Dermatology", "providers_estimate": "1-3", "owner_or_pm_name": "Emily Brewer", "title": "FNP-BC, DCNP/Founder", "email": "info@thedermcentertn.com", "phone": "", "website": "https://thedermcentertn.com", "source": "research 2026-06-09", "notes": "Founder-owned NP-led derm. Independent. Email from site."},
    {"practice_name": "Knoxville Center for Dermatology and Plastic Surgery", "city": "Knoxville", "state": "TN", "specialty": "Dermatology", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Carley Fowler & Dr. Daniel Fowler", "title": "MD/Owners", "email": "appointments@knoxdermplastics.com", "phone": "", "website": "https://knoxvillecenterfordermatologyandplasticsurgery.com", "source": "research 2026-06-09", "notes": "Husband-wife owner team, derm + plastics. Email from contact page."},
    {"practice_name": "Greater Knoxville Dermatology", "city": "Powell", "state": "TN", "specialty": "Dermatology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Cynthia Kang-Rotondo", "title": "MD, FAAD/Owner", "email": "skin@greaterknoxvillederm.com", "phone": "", "website": "https://greaterknoxvillederm.com", "source": "research 2026-06-09", "notes": "Owner-physician derm. Knoxville area. Email from site."},
    {"practice_name": "Reissing Health Family Chiropractic", "city": "Farragut", "state": "TN", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@reissinghealth.com", "phone": "", "website": "https://reissinghealth.com", "source": "research 2026-06-09", "notes": "Family chiropractic. Knoxville suburb. Email from site."},
    {"practice_name": "Central Kentucky Chiropractic", "city": "Lexington", "state": "KY", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "office@centralkychiropractic.com", "phone": "", "website": "https://centralkychiropractic.com", "source": "research 2026-06-09", "notes": "Independent chiro. Lexington KY. Email from contact page."},
    {"practice_name": "Stinson Chiropractic Center", "city": "Lexington", "state": "KY", "specialty": "Chiropractic", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Jeffrey Stinson", "title": "DC/Owner", "email": "stinsonchiropractic@gmail.com", "phone": "", "website": "https://www.drjeffreystinson.com", "source": "research 2026-06-09", "notes": "3-physician chiro. Lexington KY. Email from site."},
    {"practice_name": "Downtown Louisville Chiropractic & Rehab", "city": "Louisville", "state": "KY", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "downtown.chirorehab@gmail.com", "phone": "", "website": "https://downtown-louisville-chiropractic.com", "source": "research 2026-06-09", "notes": "Independent chiro + rehab. Louisville KY. Email from contact page."},

    # --- CO / VA Behavioral Health ---
    {"practice_name": "Lokiten Behavioral Health", "city": "Colorado Springs", "state": "CO", "specialty": "Behavioral health (counseling)", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "intakes@lokitenbh.com", "phone": "", "website": "https://www.lokitenbh.com", "source": "research 2026-06-09", "notes": "2 CO locations. In-network. Intake email from contact page."},
    {"practice_name": "Four Pillars Counseling", "city": "Fort Collins", "state": "CO", "specialty": "Behavioral health (counseling)", "providers_estimate": "10-20", "owner_or_pm_name": "Kelly Keeler", "title": "MA LPC ACS/Owner", "email": "counselor@fourpillarscounseling.org", "phone": "", "website": "https://www.fourpillarscounseling.org", "source": "research 2026-06-09", "notes": "Owner-led. ~12 therapists. Accepts Medicaid + major CO insurers. Email from site."},
    {"practice_name": "Integrated Counseling and Wellness", "city": "Fort Collins", "state": "CO", "specialty": "Behavioral health (counseling)", "providers_estimate": "10-20", "owner_or_pm_name": "", "title": "", "email": "info@integratedwellnessfc.com", "phone": "", "website": "https://integratedwellnessfc.com", "source": "research 2026-06-09", "notes": "~12 clinicians. In-network with major CO insurers. Email from rates/insurance page."},
    {"practice_name": "Parker Counseling Services", "city": "Parker", "state": "CO", "specialty": "Behavioral health (counseling)", "providers_estimate": "5-10", "owner_or_pm_name": "Aaron Anderson", "title": "MS LMFT/Clinical Director", "email": "receptionist@parkercounseling.org", "phone": "", "website": "https://www.parkercounseling.org", "source": "research 2026-06-09", "notes": "9 therapists. In-network major insurers. Independent since 2007. Email from contact page."},
    {"practice_name": "Peaks Counseling", "city": "Centennial", "state": "CO", "specialty": "Behavioral health (counseling)", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "info@peakscounseling.com", "phone": "", "website": "https://peakscounseling.com", "source": "research 2026-06-09", "notes": "6 counselors. In-network major CO insurers. Email from contact page."},
    {"practice_name": "Greenwood Counseling Center", "city": "Centennial", "state": "CO", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "Tamra Hughes", "title": "Owner", "email": "tamra@greenwoodcounselingcenter.com", "phone": "", "website": "https://greenwoodcounselingcenter.com", "source": "research 2026-06-09", "notes": "EMDR specialty. 3 CO locations. Owner email from join-our-team page."},
    {"practice_name": "Iris Therapy Services", "city": "Arlington", "state": "VA", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@iristherapyservices.com", "phone": "", "website": "https://www.iristherapyservices.com", "source": "research 2026-06-09", "notes": "Psychotherapy + psych testing. Arlington VA. Email from contact page."},
    {"practice_name": "Active & Connected Family Therapy", "city": "Arlington", "state": "VA", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "hello@activeconnected.com", "phone": "", "website": "https://activeconnected.com", "source": "research 2026-06-09", "notes": "4 clinicians. Accepts Anthem/BCBS, Aetna, Cigna. Email from location page."},
    {"practice_name": "RVA Counseling", "city": "Richmond", "state": "VA", "specialty": "Behavioral health (counseling)", "providers_estimate": "10-20", "owner_or_pm_name": "Michelle A. Buhrandt", "title": "LCSW/Owner", "email": "scheduling@rvacounseling.com", "phone": "", "website": "https://www.rvacounseling.com", "source": "research 2026-06-09", "notes": "Owner-led. ~16 clinicians. In-network major insurers. Email from site."},
    {"practice_name": "Sea Level Counseling & Wellness", "city": "Norfolk", "state": "VA", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@sealevelcw.com", "phone": "", "website": "https://www.sealevelcounselingandwellness.com", "source": "research 2026-06-09", "notes": "Trauma-informed counseling. Norfolk VA. In-network major insurers. Email from contact page."},
    {"practice_name": "Breakforth Counseling", "city": "Roanoke", "state": "VA", "specialty": "Behavioral health (counseling)", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "info@breakforthcounseling.com", "phone": "", "website": "https://breakforthcounseling.com", "source": "research 2026-06-09", "notes": "10 clinicians. Locally owned. Roanoke VA. Email from site."},
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
