#!/usr/bin/env python3
"""One-shot: add batch 2026-06-11 leads."""
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEADS_CSV = ROOT / "docs" / "sales" / "leads.csv"

NEW_LEADS = [
    # --- IL / MN / WI suburbs ---
    {"practice_name": "Physical Therapy Advantage", "city": "North Aurora", "state": "IL", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@ptadvantagepc.com", "phone": "", "website": "https://www.ptadvantagepc.com", "source": "research 2026-06-11", "notes": "Independent PT. North Aurora IL. Email from contact page."},
    {"practice_name": "Break Free Physical Therapy", "city": "Springfield", "state": "IL", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Steve Hanley", "title": "PT/Founder", "email": "info@breakfreephysicaltherapy.com", "phone": "", "website": "https://www.breakfreephysicaltherapy.com", "source": "research 2026-06-11", "notes": "Founder-PT. Springfield IL. Email from site."},
    {"practice_name": "Synapse Pediatric Therapy", "city": "Evanston", "state": "IL", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@synapsepediatrictherapy.com", "phone": "", "website": "https://www.synapsepediatrictherapy.com", "source": "research 2026-06-11", "notes": "Pediatric PT, OT, speech. Evanston IL. Email from site."},
    {"practice_name": "Advance Clinical Services", "city": "Kenosha", "state": "WI", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "Nicholas Olsen", "title": "LCSW/CEO", "email": "reception@advanceclinicalservices.com", "phone": "", "website": "https://advanceclinicalservices.com", "source": "research 2026-06-11", "notes": "CEO-led counseling. Kenosha WI. Email from site."},
    {"practice_name": "Wisconsin Wellness", "city": "Appleton", "state": "WI", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@wisconsinwellness.com", "phone": "", "website": "https://wisconsinwellness.com", "source": "research 2026-06-11", "notes": "Independent counseling. Appleton WI. Email from site."},
    {"practice_name": "Therapy Time for KIDS", "city": "Appleton", "state": "WI", "specialty": "Pediatric speech+feeding", "providers_estimate": "1-3", "owner_or_pm_name": "Sally LaCroix", "title": "SLP/Owner", "email": "info@ttfkids.com", "phone": "", "website": "https://www.ttfkids.com", "source": "research 2026-06-11", "notes": "Owner-SLP speech and feeding. Appleton WI. Email from site."},
    {"practice_name": "Fox Valley Physical Therapy & Wellness Clinic", "city": "Oshkosh", "state": "WI", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "Steve & Regina Sobojinski", "title": "Co-founders", "email": "admin@foxvalleyphysicaltherapy.com", "phone": "", "website": "https://www.foxvalleyphysicaltherapy.com", "source": "research 2026-06-11", "notes": "Co-founder PT/OT/pediatric. Oshkosh WI. Email from site."},
    {"practice_name": "Simply Spoken Therapy", "city": "Kenosha", "state": "WI", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "hello@simplyspokentherapy.com", "phone": "", "website": "https://www.simplyspokentherapy.com", "source": "research 2026-06-11", "notes": "Pediatric speech. Kenosha WI. Email from site."},
    {"practice_name": "Symmetry Chiropractic and Physical Therapy Duluth", "city": "Duluth", "state": "MN", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "duluth@symmetrycpt.com", "phone": "", "website": "https://symmetrychiropracticandphysicaltherapy.com", "source": "research 2026-06-11", "notes": "PT and chiro. Duluth MN. Email from location page."},
    {"practice_name": "Insight Counseling Duluth", "city": "Duluth", "state": "MN", "specialty": "Behavioral health (counseling)", "providers_estimate": "1-3", "owner_or_pm_name": "Dina", "title": "Founder", "email": "hello@insightduluth.com", "phone": "", "website": "https://www.insightcounselingduluth.com", "source": "research 2026-06-11", "notes": "Founder-led counseling. Duluth MN. Email from site."},
    {"practice_name": "Autonomy Counseling PLLC", "city": "Moorhead", "state": "MN", "specialty": "Behavioral health (counseling)", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "autonomypllc@gmail.com", "phone": "", "website": "https://www.autonomycounseling.com", "source": "research 2026-06-11", "notes": "Independent counseling. Moorhead MN. Email from contact page."},
    {"practice_name": "Maverick Physiotherapy", "city": "St. Paul", "state": "MN", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@maverickphysio.com", "phone": "", "website": "https://themaverickphysio.com", "source": "research 2026-06-11", "notes": "Independent PT. St. Paul MN. Email from site."},

    # --- Urology / Allergy / OB-GYN ---
    {"practice_name": "Geist Center for Allergy Asthma & Immunology", "city": "Indianapolis", "state": "IN", "specialty": "Allergy/Immunology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Maria Ermitano", "title": "MD", "email": "geistallergy@gmail.com", "phone": "", "website": "https://geistallergy.com", "source": "research 2026-06-11", "notes": "Independent allergy/immunology. Indianapolis IN. Email from contact page."},
    {"practice_name": "Modern Urology", "city": "Frederick", "state": "CO", "specialty": "Urology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Carolyn Fronczak", "title": "MD/Owner", "email": "hello@modernurology.com", "phone": "", "website": "https://modernurology.com", "source": "research 2026-06-11", "notes": "Owner-urologist. Denver metro CO. Email from site."},
    {"practice_name": "Cascade Women's Health PC", "city": "Portland", "state": "OR", "specialty": "OB-GYN", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Marguerite Cohen", "title": "MD", "email": "info@cwh-pc.com", "phone": "", "website": "https://www.cascadewomenshealth.org", "source": "research 2026-06-11", "notes": "Independent OB-GYN. Portland OR. Email from contact page."},
    {"practice_name": "Tennessee Valley Urology Center", "city": "Cleveland", "state": "TN", "specialty": "Urology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Edward McIntire", "title": "MD", "email": "info@tnvalleyurology.com", "phone": "", "website": "https://tnvalleyurology.com", "source": "research 2026-06-11", "notes": "Independent urology. Cleveland TN. Email from contact page."},
    {"practice_name": "Allergy & Asthma Institute of Southeast Michigan", "city": "Farmington Hills", "state": "MI", "specialty": "Allergy/Immunology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Chad Mayer", "title": "DO/Owner", "email": "contact@theallergydoc.com", "phone": "", "website": "https://www.theallergydoc.com", "source": "research 2026-06-11", "notes": "Owner-allergist. Farmington Hills MI. Email from contact page."},
    {"practice_name": "Advanced Allergy and Asthma of Virginia", "city": "Midlothian", "state": "VA", "specialty": "Allergy/Immunology", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Barry Feinstein", "title": "MD", "email": "info@advancedallergyva.com", "phone": "", "website": "https://www.advancedallergyva.com", "source": "research 2026-06-11", "notes": "Independent allergy. Richmond suburb VA. Email from contact page."},
    {"practice_name": "St. Louis Family Allergy & Asthma", "city": "St. Peters", "state": "MO", "specialty": "Allergy/Immunology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Sonia Cajigal", "title": "MD/Owner", "email": "info@stlfamilyallergy.com", "phone": "", "website": "https://stlouisallergyasthma.com", "source": "research 2026-06-11", "notes": "Owner-allergist. St. Louis area MO. Email from site."},
    {"practice_name": "Greater Atlanta Women's Healthcare", "city": "Atlanta", "state": "GA", "specialty": "OB-GYN", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Camille Davis-Williams", "title": "MD", "email": "info@gawhc.com", "phone": "", "website": "https://www.greateratlantawomenshealthcare.com", "source": "research 2026-06-11", "notes": "Independent OB-GYN. Atlanta GA. Email from contact page."},
    {"practice_name": "Asthma & Allergy Specialists PA", "city": "Charlotte", "state": "NC", "specialty": "Allergy/Immunology", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "triage@asthmanc.com", "phone": "", "website": "https://asthmanc.com", "source": "research 2026-06-11", "notes": "Independent allergy. Charlotte NC. Email from contact page."},

    # --- FL / GA / AL new cities ---
    {"practice_name": "Function Physical Therapy Naples", "city": "Naples", "state": "FL", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Phil Standhart", "title": "PT/Owner", "email": "info@functionptnaples.com", "phone": "", "website": "https://functionptnaples.com", "source": "research 2026-06-11", "notes": "Owner-PT. Naples FL. Email from site."},
    {"practice_name": "Kinetic Physical Therapy Naples", "city": "Naples", "state": "FL", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Angelo Stefanides", "title": "PT/Owner", "email": "info@kineticpt-naples.com", "phone": "", "website": "https://www.kineticpt-naples.com", "source": "research 2026-06-11", "notes": "Owner-PT. Naples FL. Email from site."},
    {"practice_name": "Greater Daytona Physical Therapy", "city": "Daytona Beach", "state": "FL", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "office@daytonapt.com", "phone": "", "website": "https://daytonapt.com", "source": "research 2026-06-11", "notes": "Independent PT. Daytona Beach FL. Email from site."},
    {"practice_name": "Teachout Chiropractic & Wellness Center", "city": "Fort Myers", "state": "FL", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@teachoutchiropractic.com", "phone": "", "website": "https://www.teachoutchiropractic.com", "source": "research 2026-06-11", "notes": "Independent chiro. Fort Myers FL. Email from contact page."},
    {"practice_name": "Florida Physio", "city": "Clearwater", "state": "FL", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Leighton Peavler", "title": "DPT/Owner", "email": "info@floridaphysio.com", "phone": "", "website": "https://floridaphysio.com", "source": "research 2026-06-11", "notes": "Owner-PT. Clearwater FL. Email from contact page."},
    {"practice_name": "Physical Evidence Chiropractic", "city": "Boca Raton", "state": "FL", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. David Lipman", "title": "DC/Owner", "email": "info@physicalevidencechiropractic.com", "phone": "", "website": "https://physicalevidencechiropractic.com", "source": "research 2026-06-11", "notes": "Owner-DC. Boca Raton FL. Email from contact page."},
    {"practice_name": "Purpose Physical Therapy", "city": "St. Petersburg", "state": "FL", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Ken Clark", "title": "PT DPT/Owner", "email": "frontdesk@purposephysicaltherapy.com", "phone": "", "website": "https://purposephysicaltherapy.com", "source": "research 2026-06-11", "notes": "Owner-PT. St. Petersburg FL. Email from site."},
    {"practice_name": "Center for Physical Rehabilitation Valdosta", "city": "Valdosta", "state": "GA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "referrals@centerforphysicalrehab.com", "phone": "", "website": "https://www.centerforphysicalrehab.com", "source": "research 2026-06-11", "notes": "Independent PT. Valdosta GA. Email from site."},
    {"practice_name": "Cormier Chiropractic & Physical Therapy Center", "city": "Mobile", "state": "AL", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Cevin Cormier", "title": "DC/Owner", "email": "hello@cormierchiro.com", "phone": "", "website": "https://cormierchiro.com", "source": "research 2026-06-11", "notes": "Owner-DC. Mobile AL. Email from contact page."},
    {"practice_name": "Alabama Dermatology & Skin Specialists", "city": "Huntsville", "state": "AL", "specialty": "Dermatology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. John Evans", "title": "MD/Owner", "email": "contact@alderm.com", "phone": "", "website": "https://www.alabamadermatologyspecialists.com", "source": "research 2026-06-11", "notes": "Independent derm. Huntsville AL. Email from contact page."},
    {"practice_name": "Houston County Chiropractic", "city": "Dothan", "state": "AL", "specialty": "Chiropractic", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Chris Fischer & Dr. Melissa Fischer", "title": "DC/Owners", "email": "info@houcochiro.com", "phone": "", "website": "https://www.houcochiro.com", "source": "research 2026-06-11", "notes": "Husband-wife owner chiro. Dothan AL. Email from contact page."},

    # --- CA / TX new cities ---
    {"practice_name": "Center for Physical Therapy Long Beach", "city": "Long Beach", "state": "CA", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Kyle Baldwin", "title": "DPT/Owner", "email": "cptlongbeach@gmail.com", "phone": "", "website": "https://www.physicaltherapylb.com", "source": "research 2026-06-11", "notes": "Owner-PT. Long Beach CA. Email from site."},
    {"practice_name": "Center for Developing Kids", "city": "Pasadena", "state": "CA", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Michaelann Gabriele", "title": "OTD/Co-Director", "email": "info@centerfordevelopingkids.com", "phone": "", "website": "https://centerfordevelopingkids.com", "source": "research 2026-06-11", "notes": "Co-director OT pediatric therapy. Pasadena CA. Email from contact page."},
    {"practice_name": "Dermatology Specialists of Pasadena", "city": "Pasadena", "state": "CA", "specialty": "Dermatology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Narineh Zohrabian", "title": "MD FAAD/Owner", "email": "contact@pasadenadermatology.com", "phone": "", "website": "https://pasadenadermatology.com", "source": "research 2026-06-11", "notes": "Owner-derm. Pasadena CA. Email from contact page."},
    {"practice_name": "Synergy Speech-Language Pathology", "city": "South Pasadena", "state": "CA", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@synergyslp.com", "phone": "", "website": "https://www.synergyslp.com", "source": "research 2026-06-11", "notes": "Independent pediatric speech. South Pasadena CA. Email from contact page."},
    {"practice_name": "Ashwood Physical Therapy", "city": "Ventura", "state": "CA", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Sam Fisher", "title": "DPT/Owner", "email": "ashwoodptventura@gmail.com", "phone": "", "website": "https://www.ashwoodphysicaltherapy.com", "source": "research 2026-06-11", "notes": "Owner-PT. Ventura CA. Email from contact page."},
    {"practice_name": "Golden Hills Orthopedic and Sports PT", "city": "San Jose", "state": "CA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "therapy@goldenhillspt.com", "phone": "", "website": "https://goldenhillspt.com", "source": "research 2026-06-11", "notes": "Independent PT. San Jose CA. Email from contact page."},
    {"practice_name": "Evergreen Physical Therapy", "city": "San Jose", "state": "CA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "Stuart & Linda Katzman", "title": "Co-owners", "email": "info@evergreenptonline.com", "phone": "", "website": "https://www.evergreenptonline.com", "source": "research 2026-06-11", "notes": "Co-owner PT. San Jose CA. Email from contact page."},
    {"practice_name": "Irvine Physical Medicine and Rehabilitation", "city": "Irvine", "state": "CA", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Mark Wardenburg", "title": "DC/Founder", "email": "cs@irvinepmr.com", "phone": "", "website": "https://irvinepmr.com", "source": "research 2026-06-11", "notes": "Founder-led PM&R. Irvine CA. Email from site."},
    {"practice_name": "Tier 1 Physical Therapy and Sports Medicine", "city": "El Paso", "state": "TX", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "therrera@tier1pt.com", "phone": "", "website": "https://tier1pt.com", "source": "research 2026-06-11", "notes": "Independent PT. El Paso TX. Email from contact page."},
    {"practice_name": "Pediatric Therapy Associates Corpus Christi", "city": "Corpus Christi", "state": "TX", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "ot@pediatrictherapyassociatescc.com", "phone": "", "website": "https://pediatrictherapyassociatescc.com", "source": "research 2026-06-11", "notes": "Pediatric therapy. Corpus Christi TX. Email from contact page."},
    {"practice_name": "Central Texas Therapy Spot", "city": "Waco", "state": "TX", "specialty": "Pediatric speech+OT", "providers_estimate": "1-3", "owner_or_pm_name": "Amy Warlick", "title": "MA CCC-SLP/Owner", "email": "cttsofficeassistant@gmail.com", "phone": "", "website": "https://www.centraltexastherapyspot.com", "source": "research 2026-06-11", "notes": "Owner-SLP pediatric therapy. Waco TX. Email from site."},
    {"practice_name": "East Texas Children's Therapy Services", "city": "Tyler", "state": "TX", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "Donna Duncan", "title": "Office Manager", "email": "info@childrens-therapy.net", "phone": "", "website": "https://www.childrens-therapy.net", "source": "research 2026-06-11", "notes": "Pediatric therapy. Tyler TX. Email from contact page."},
    {"practice_name": "Busy Bodies Pediatric Therapy", "city": "Tyler", "state": "TX", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "Bo Keeling", "title": "Founder", "email": "busybodiespedipt@gmail.com", "phone": "", "website": "https://www.busybodiestherapy.com", "source": "research 2026-06-11", "notes": "Founder-led pediatric therapy. Tyler TX. Email from site."},
    {"practice_name": "iPOW PT & Wellness", "city": "Amarillo", "state": "TX", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "lauren@ipowpt.com", "phone": "", "website": "https://www.ipowpt.com", "source": "research 2026-06-11", "notes": "Independent PT. Amarillo TX. Email from site."},
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
