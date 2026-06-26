#!/usr/bin/env python3
"""One-shot: add batch 2026-06-10c leads."""
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEADS_CSV = ROOT / "docs" / "sales" / "leads.csv"

NEW_LEADS = [
    # --- WA / OR / CA / NV ---
    {"practice_name": "Cornerstone Physical Therapy Spokane", "city": "Spokane", "state": "WA", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Juan & Dr. Stacy Jaramillo", "title": "Co-owners", "email": "welcome@ptcornerstone.com", "phone": "", "website": "https://ptcornerstone.com", "source": "research 2026-06-10", "notes": "Co-owner PT. Spokane WA. Email from contact page."},
    {"practice_name": "Coates Chiropractic", "city": "Tacoma", "state": "WA", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Brooke Coates", "title": "DC/Owner", "email": "coateschiropractic@gmail.com", "phone": "", "website": "https://coateschiropractic.com", "source": "research 2026-06-10", "notes": "Owner-DC. Tacoma WA. Email from contact page."},
    {"practice_name": "Westgate Physical Therapy", "city": "Tacoma", "state": "WA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@westgatept.com", "phone": "", "website": "https://www.westgatept.com", "source": "research 2026-06-10", "notes": "Independent PT. Tacoma WA. Accepts insurance. Email from site."},
    {"practice_name": "Whatcom Community Physical Therapy", "city": "Bellingham", "state": "WA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "Paul Fitzgerald", "title": "DPT/CEO/Founder", "email": "info@wc-pt.com", "phone": "", "website": "https://wc-pt.com", "source": "research 2026-06-10", "notes": "Founder-PT. Bellingham WA. Email from site."},
    {"practice_name": "Olympia Physical Therapy & Rehabilitation", "city": "Olympia", "state": "WA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "office@olympiapt.com", "phone": "", "website": "https://www.olympiapt.com", "source": "research 2026-06-10", "notes": "Independent PT. Olympia WA. Email from contact page."},
    {"practice_name": "Crater Chiropractic Clinic", "city": "Medford", "state": "OR", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Michael Warren", "title": "DC", "email": "admin@craterchiro.com", "phone": "", "website": "https://www.craterchiro.com", "source": "research 2026-06-10", "notes": "Independent chiro. Medford OR. Email from contact page."},
    {"practice_name": "Transformative Health & Wellness", "city": "Corvallis", "state": "OR", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@transformativehw.com", "phone": "", "website": "https://www.transformativehw.com", "source": "research 2026-06-10", "notes": "Behavioral health. Corvallis OR. Accepts insurance. Email from contact page."},
    {"practice_name": "Authentic Hope Counseling", "city": "Corvallis", "state": "OR", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "contact@authentichopeoregon.org", "phone": "", "website": "https://www.authentichopeoregon.org", "source": "research 2026-06-10", "notes": "Behavioral health. Corvallis OR. Email from contact page."},
    {"practice_name": "Campus Commons Physical Therapy", "city": "Sacramento", "state": "CA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@campuscommonspt.com", "phone": "", "website": "https://campuscommonsphysicaltherapy.com", "source": "research 2026-06-10", "notes": "Independent PT. Sacramento CA. Email from contact page."},
    {"practice_name": "Williams Physical Therapy", "city": "Redding", "state": "CA", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@williamspt.com", "phone": "", "website": "https://williamsptredding.com", "source": "research 2026-06-10", "notes": "Independent owner-operated PT. Redding CA. Email from contact page."},
    {"practice_name": "Giel Chiropractic", "city": "Fresno", "state": "CA", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Joseph W. Giel Jr.", "title": "DC/Owner", "email": "contact@gielchiropractic.com", "phone": "", "website": "https://www.gielchiropractic.com", "source": "research 2026-06-10", "notes": "Owner-DC. Fresno CA. Email from site."},
    {"practice_name": "Wonders Pediatric Therapy", "city": "Oakland", "state": "CA", "specialty": "Pediatric OT", "providers_estimate": "1-3", "owner_or_pm_name": "Debbie Yun", "title": "OT/Founder", "email": "info@wonderspediatrictherapy.com", "phone": "", "website": "https://wonderspediatrictherapy.com", "source": "research 2026-06-10", "notes": "Founder-OT pediatric therapy. Oakland CA. Email from contact page."},
    {"practice_name": "HEALTHSMITH", "city": "Reno", "state": "NV", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Vicky McCoy", "title": "DC/Owner", "email": "welcome@healthsmithreno.com", "phone": "", "website": "https://healthsmithreno.com", "source": "research 2026-06-10", "notes": "Owner-DC. Reno NV. Email from contact page."},

    # --- KS / NE / ND / SD / WY ---
    {"practice_name": "Sioux Falls Wellness Counseling", "city": "Sioux Falls", "state": "SD", "specialty": "Behavioral health (counseling)", "providers_estimate": "1-3", "owner_or_pm_name": "Rita Hansen", "title": "Owner", "email": "rita@siouxfallswellness.com", "phone": "", "website": "https://www.siouxfallswellness.com", "source": "research 2026-06-10", "notes": "Owner-led counseling. Sioux Falls SD. Email from site."},
    {"practice_name": "Revival Counseling Services", "city": "Sioux Falls", "state": "SD", "specialty": "Behavioral health (counseling)", "providers_estimate": "1-3", "owner_or_pm_name": "Erin Davis", "title": "MS LPC-MH/Owner", "email": "revivalcounselingservices@gmail.com", "phone": "", "website": "https://revivalcounselingservices.org", "source": "research 2026-06-10", "notes": "Owner-led counseling. Sioux Falls SD. Email from site."},
    {"practice_name": "Mindful Health Counseling & Wellness", "city": "Bismarck", "state": "ND", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "contactus@mindfulhealthnd.com", "phone": "", "website": "https://www.mindfulhealthnd.com", "source": "research 2026-06-10", "notes": "Independent counseling. Bismarck ND. Email from site."},
    {"practice_name": "Rural Routes Therapies", "city": "Bismarck", "state": "ND", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "hello@ruralroutestherapies.com", "phone": "", "website": "https://ruralroutestherapies.com", "source": "research 2026-06-10", "notes": "Pediatric speech/SLP. Bismarck ND. Email from site."},
    {"practice_name": "Myna Therapy Services", "city": "Fargo", "state": "ND", "specialty": "Pediatric speech+OT+PT", "providers_estimate": "3-5", "owner_or_pm_name": "Elaine Doerfler", "title": "SLP/Owner", "email": "info@mynatherapy.com", "phone": "", "website": "https://www.mynatherapy.com", "source": "research 2026-06-10", "notes": "Owner-SLP pediatric therapy. Fargo ND. Email from site."},
    {"practice_name": "Apex Physical Therapy & Wellness", "city": "West Fargo", "state": "ND", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "office@apexptwellness.com", "phone": "", "website": "https://apexptwellness.com", "source": "research 2026-06-10", "notes": "Independent PT. West Fargo ND. Email from site."},
    {"practice_name": "Topeka Sports & Family Chiropractic", "city": "Topeka", "state": "KS", "specialty": "Chiropractic", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "tsfchiropractic@gmail.com", "phone": "", "website": "https://www.tsfchiropractic.com", "source": "research 2026-06-10", "notes": "Multi-physician chiro. Topeka KS. Email from contact page."},
    {"practice_name": "Bolz Chiropractic", "city": "Topeka", "state": "KS", "specialty": "Chiropractic", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Timothy Bolz & Dr. Anna Bolz", "title": "DC/Owners", "email": "info@bolzchiropractic.com", "phone": "", "website": "https://www.bolzchiropractic.com", "source": "research 2026-06-10", "notes": "Husband-wife owner chiro. Topeka KS. Email from site."},
    {"practice_name": "Speech Solutions", "city": "Lawrence", "state": "KS", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Lisa Graves", "title": "MS CCC-SLP/Owner", "email": "info@speechsolutions.co", "phone": "", "website": "https://www.speechsolutions.co", "source": "research 2026-06-10", "notes": "Owner-SLP speech therapy. Lawrence KS. Email from site."},
    {"practice_name": "Cornerstone Counseling PC", "city": "Grand Island", "state": "NE", "specialty": "Behavioral health (counseling)", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "lpcornerstone83@gmail.com", "phone": "", "website": "https://www.cornerstonecounselingpc.com", "source": "research 2026-06-10", "notes": "Independent counseling. Grand Island NE. Email from site."},
    {"practice_name": "Mertens Counseling", "city": "Kearney", "state": "NE", "specialty": "Behavioral health (counseling)", "providers_estimate": "1-3", "owner_or_pm_name": "Emily Mertens", "title": "LIMHP CMFT/Owner", "email": "admin@mertenscounseling.com", "phone": "", "website": "https://www.mertenscounseling.com", "source": "research 2026-06-10", "notes": "Owner-therapist. Kearney NE. Email from site."},
    {"practice_name": "Performance Physical Therapy WY", "city": "Cheyenne", "state": "WY", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "performanceptwy@gmail.com", "phone": "", "website": "https://performanceptwy.com", "source": "research 2026-06-10", "notes": "Independent PT. Cheyenne WY. Email from site."},
    {"practice_name": "Physical Therapy Center of Wyoming", "city": "Cheyenne", "state": "WY", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "ptcwyo@gmail.com", "phone": "", "website": "https://www.ptcwyo.com", "source": "research 2026-06-10", "notes": "Independent PT. Cheyenne WY. Email from contact page."},
    {"practice_name": "Laramie Spinal Care Center", "city": "Laramie", "state": "WY", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Jeremy Jones", "title": "DC/Owner", "email": "info@laramiespinalcarecenter.com", "phone": "", "website": "https://www.laramiespinalcarecenter.com", "source": "research 2026-06-10", "notes": "Owner-DC. Laramie WY. Email from site."},

    # --- Audiology / Optometry / GI ---
    {"practice_name": "Columbus Hearing", "city": "Dublin", "state": "OH", "specialty": "Audiology", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Abbey Bavaro & Dr. Jessica Lockhart", "title": "Co-owners/Audiologists", "email": "info@columbushears.com", "phone": "", "website": "https://columbushears.com", "source": "research 2026-06-10", "notes": "Co-owner audiology. Dublin OH. Email from contact page."},
    {"practice_name": "Audiology & Hearing Services Lansing", "city": "Lansing", "state": "MI", "specialty": "Audiology", "providers_estimate": "1-3", "owner_or_pm_name": "Kathy Debler", "title": "MA CCC-A/Owner", "email": "kdeblerl@audiohearingservices.com", "phone": "", "website": "https://audiohearingservices.com", "source": "research 2026-06-10", "notes": "Owner-audiologist. Lansing MI. Email from contact page."},
    {"practice_name": "Denver Audiology", "city": "Denver", "state": "CO", "specialty": "Audiology", "providers_estimate": "1-3", "owner_or_pm_name": "Bunny Barber", "title": "MS CCC-A/Owner", "email": "patientcare@denveraudiology.net", "phone": "", "website": "https://denveraudiology.net", "source": "research 2026-06-10", "notes": "Owner-audiologist. Denver CO. Email from contact page."},
    {"practice_name": "All Eyes Optometry", "city": "Ann Arbor", "state": "MI", "specialty": "Optometry", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@alleyesoptometry.com", "phone": "", "website": "https://www.alleyesoptometry.com", "source": "research 2026-06-10", "notes": "Independent optometry. Ann Arbor MI. Email from contact page."},
    {"practice_name": "Seven Hills Eye Care", "city": "Cincinnati", "state": "OH", "specialty": "Optometry", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Jenna Stoffel", "title": "OD/Owner", "email": "reception@sevenhillseyecare.com", "phone": "", "website": "https://www.sevenhillseyecare.com", "source": "research 2026-06-10", "notes": "Owner-OD. Cincinnati OH. Email from contact page."},
    {"practice_name": "Infinity Eye Care", "city": "Indianapolis", "state": "IN", "specialty": "Optometry", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Mark & Dr. Karina Snyder", "title": "Co-owners", "email": "info@infinityeyecarein.com", "phone": "", "website": "https://infinityeyecarein.com", "source": "research 2026-06-10", "notes": "Co-owner optometry. Indianapolis IN. Email from contact page."},
    {"practice_name": "Look East Eyecare", "city": "Nashville", "state": "TN", "specialty": "Optometry", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@lookeastnashville.com", "phone": "", "website": "https://www.lookeastnashville.com", "source": "research 2026-06-10", "notes": "Independent optometry. Nashville TN. Email from contact page."},
    {"practice_name": "Look + See Vision Care", "city": "Austin", "state": "TX", "specialty": "Optometry", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Tammy Vo", "title": "OD/Founder", "email": "lookandseevision@gmail.com", "phone": "", "website": "https://lookandseevision.com", "source": "research 2026-06-10", "notes": "Owner-OD. Austin TX. Email from contact page."},
    {"practice_name": "Downtown Eyes", "city": "Minneapolis", "state": "MN", "specialty": "Optometry", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Mary Ann Zastrow", "title": "OD/Owner", "email": "info@downtowneyes.com", "phone": "", "website": "https://www.downtowneyes.com", "source": "research 2026-06-10", "notes": "Owner-OD. Minneapolis MN. Email from contact page."},
    {"practice_name": "Midwest Audiology Specialists", "city": "North Liberty", "state": "IA", "specialty": "Audiology", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Tanya Van Voorst & Dr. Jill Beecher", "title": "Co-founders", "email": "office@mwaudiology.com", "phone": "", "website": "https://www.mwaudiology.com", "source": "research 2026-06-10", "notes": "Co-founder audiology. North Liberty IA. Email from contact page."},
    {"practice_name": "Gastroenterology Center of Northern Virginia", "city": "Arlington", "state": "VA", "specialty": "Gastroenterology", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Gabriel Herman", "title": "MD", "email": "portalresponse@gcofnova.com", "phone": "", "website": "https://gcofnova.com", "source": "research 2026-06-10", "notes": "Independent GI. Arlington VA. Email from contact page."},
    {"practice_name": "Kansas City Gastroenterology and Hepatology", "city": "Kansas City", "state": "MO", "specialty": "Gastroenterology", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Bradley Freilich & Dr. Paresh Patel", "title": "MD/Owners", "email": "consults@kcgi.health", "phone": "", "website": "https://kcgi.health", "source": "research 2026-06-10", "notes": "Independent GI. Kansas City MO. Email from contact page."},

    # --- Upstate NY / NJ / CT ---
    {"practice_name": "Queen City Physical Therapy", "city": "Buffalo", "state": "NY", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "Joseph DellaValle", "title": "DPT/Owner", "email": "office@queencitypt.com", "phone": "", "website": "https://queencitypt.com", "source": "research 2026-06-10", "notes": "Owner-PT. Buffalo NY. Email from contact page."},
    {"practice_name": "Flower City Dermatology", "city": "Rochester", "state": "NY", "specialty": "Dermatology", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Kathryn Somers", "title": "MD/Owner", "email": "info@flowercitydermatology.com", "phone": "", "website": "https://flowercitydermatology.com", "source": "research 2026-06-10", "notes": "Owner-derm. Rochester NY. Email from site."},
    {"practice_name": "Morgan Physical Therapy", "city": "Cicero", "state": "NY", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Gary Morgan", "title": "PT/Owner", "email": "garymorgan@morganpt.com", "phone": "", "website": "https://www.morganpt.com", "source": "research 2026-06-10", "notes": "Owner-PT. Syracuse area NY. Email from contact page."},
    {"practice_name": "Positive Motion Physical Therapy", "city": "Albany", "state": "NY", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@positivemotionpt.com", "phone": "", "website": "https://www.positivemotionpt.com", "source": "research 2026-06-10", "notes": "Independent PT. Albany NY. Email from contact page."},
    {"practice_name": "Little Sprouts Pediatric Therapy", "city": "Monmouth County", "state": "NJ", "specialty": "Pediatric speech+feeding", "providers_estimate": "1-3", "owner_or_pm_name": "Christina Shannon & Alexandra Sorce", "title": "Co-owners", "email": "admin@littlesproutstherapyllc.com", "phone": "", "website": "https://www.littlesproutstherapyllc.com", "source": "research 2026-06-10", "notes": "Co-owner pediatric speech and feeding. Monmouth/Ocean County NJ. Email from site."},
    {"practice_name": "10 on 10 Physical Therapy", "city": "Morris Plains", "state": "NJ", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Namrata Agarwal", "title": "DPT/Owner", "email": "enquiry@10on10pt.com", "phone": "", "website": "https://10on10pt.com", "source": "research 2026-06-10", "notes": "Owner-PT. Morris Plains NJ. Email from site."},
    {"practice_name": "Carroll Physical Therapy", "city": "Denville", "state": "NJ", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dan Carroll", "title": "PT FAAOMPT/Owner", "email": "info@carrollpt.com", "phone": "", "website": "https://carrollpt.com", "source": "research 2026-06-10", "notes": "Owner-PT. Denville NJ. Email from site."},
    {"practice_name": "Springboard Pediatric Therapy", "city": "Whippany", "state": "NJ", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "Trish O'Brien Meyer", "title": "Owner", "email": "admin@springboardtherapy.com", "phone": "", "website": "https://www.springboardtherapy.com", "source": "research 2026-06-10", "notes": "Owner-led pediatric therapy. Whippany NJ. Email from site."},
    {"practice_name": "Dermatology Specialists of Monmouth County", "city": "West Long Branch", "state": "NJ", "specialty": "Dermatology", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "office@ogmfderm.com", "phone": "", "website": "https://dermatologyspecialistsofmonmouthcounty.com", "source": "research 2026-06-10", "notes": "Independent derm. Monmouth County NJ. Email from contact page."},
    {"practice_name": "Physical Therapy Associates of Norwalk", "city": "Norwalk", "state": "CT", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "therapyasso@optimum.net", "phone": "", "website": "https://ptanorwalk.com", "source": "research 2026-06-10", "notes": "Independent PT. Norwalk CT. Email from about page."},
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
