#!/usr/bin/env python3
"""One-shot: add batch 2026-06-10b leads."""
import csv, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEADS_CSV = ROOT / "docs" / "sales" / "leads.csv"

NEW_LEADS = [
    # --- NV / NM / CO / UT ---
    {"practice_name": "Pillar Kinetic", "city": "Las Vegas", "state": "NV", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Erica Wong & Dr. Joseph White", "title": "Co-founders", "email": "info@pillarkinetic.com", "phone": "", "website": "https://pillarkinetic.com", "source": "research 2026-06-10", "notes": "Co-founder PT practice. Las Vegas NV. Email from site."},
    {"practice_name": "TRU Physical Therapy", "city": "Henderson", "state": "NV", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "truphysicaltherapy.frontdesk@gmail.com", "phone": "", "website": "https://truphysicaltherapy.com", "source": "research 2026-06-10", "notes": "Independent PT. Henderson NV. Email from contact page."},
    {"practice_name": "Northwest Reno Chiropractic", "city": "Reno", "state": "NV", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. David Rovetti", "title": "DC", "email": "office@northwestrenochiropractic.com", "phone": "", "website": "https://www.northwestrenochiropractic.com", "source": "research 2026-06-10", "notes": "Independent chiro. Reno NV. Email from contact page."},
    {"practice_name": "Choice City Physical Therapy", "city": "Fort Collins", "state": "CO", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Sam Fischer", "title": "DPT", "email": "info@choicecitypt.com", "phone": "", "website": "https://choicecitypt.com", "source": "research 2026-06-10", "notes": "Independent PT. Fort Collins CO. Email from contact page."},
    {"practice_name": "Bare Physical Therapy", "city": "Fort Collins", "state": "CO", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Tony Bare", "title": "DPT/Owner", "email": "tony@barephysicaltherapy.com", "phone": "", "website": "https://barephysicaltherapy.com", "source": "research 2026-06-10", "notes": "Owner-PT. Fort Collins CO. Email from contact page."},
    {"practice_name": "Colorado Mobile PT", "city": "Fort Collins", "state": "CO", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Leslie Jamison", "title": "PT, DPT", "email": "appointments@coloradomobilept.com", "phone": "", "website": "https://coloradomobilept.com", "source": "research 2026-06-10", "notes": "Mobile/in-home PT. Fort Collins/Loveland CO. Email from site."},
    {"practice_name": "Synergy Physical Therapy & Wellness", "city": "Pueblo", "state": "CO", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "Joe Ruzich", "title": "PT, DPT/Owner", "email": "office@synergyptw.com", "phone": "", "website": "https://synergyptw.com", "source": "research 2026-06-10", "notes": "Owner-PT. Pueblo CO. Email from contact page."},
    {"practice_name": "Santa Fe Psychotherapy and Consulting", "city": "Santa Fe", "state": "NM", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "Paolo Giudici & Michael Giudici", "title": "Managing Partners", "email": "info@santafepsychotherapy.org", "phone": "", "website": "https://santafepsychotherapy.org", "source": "research 2026-06-10", "notes": "Partner-led psychotherapy. Santa Fe NM. Email from site."},
    {"practice_name": "A New Hope Therapy Center", "city": "Las Cruces", "state": "NM", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@anewhopetc.org", "phone": "", "website": "https://www.anewhopetc.org", "source": "research 2026-06-10", "notes": "Child/teen counseling. Las Cruces NM. Email from site."},
    {"practice_name": "Spine Craft Utah", "city": "Provo", "state": "UT", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "spinecraftutah@gmail.com", "phone": "", "website": "https://spinecraftutah.com", "source": "research 2026-06-10", "notes": "Independent chiro. Provo UT. Email from site."},
    {"practice_name": "Mountainside Speech Therapy", "city": "South Ogden", "state": "UT", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Rachel Smith", "title": "SLP/Founder", "email": "rachel@mountainsidespeech.com", "phone": "", "website": "https://mountainsidespeech.com", "source": "research 2026-06-10", "notes": "Founder-SLP pediatric speech. South Ogden UT. Email from contact page."},

    # --- MN / WI / IL / MO ---
    {"practice_name": "On The Grow Speech Therapy", "city": "Madison", "state": "WI", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Nicole", "title": "SLP/Owner", "email": "nicole@otgspeech.com", "phone": "", "website": "https://www.otgspeech.com", "source": "research 2026-06-10", "notes": "Owner-SLP pediatric speech. Madison WI. Email from contact page."},
    {"practice_name": "Sunny Speech Therapy", "city": "Madison", "state": "WI", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Nicole Vieth", "title": "MS CCC-SLP/Owner", "email": "nicole@sunnyspeechwi.com", "phone": "", "website": "https://www.sunnyspeechwi.com", "source": "research 2026-06-10", "notes": "Owner-SLP pediatric speech. Madison WI. Email from site."},
    {"practice_name": "Central Wisconsin Speech Therapy", "city": "Wausau", "state": "WI", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Karla Retrum", "title": "Contact", "email": "karla.retrum@centralwisconsinspeechtherapy.com", "phone": "", "website": "https://www.centralwisconsinspeechtherapy.com", "source": "research 2026-06-10", "notes": "Pediatric and adult speech. Wausau WI. Email from site."},
    {"practice_name": "Lakeland Therapy Clinic", "city": "Chippewa Falls", "state": "WI", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@lakelandtherapyclinic.com", "phone": "", "website": "https://lakelandtherapyclinic.com", "source": "research 2026-06-10", "notes": "PT, OT, speech. Chippewa Falls WI. Email from site."},
    {"practice_name": "Coulee Physical Therapy", "city": "La Crosse", "state": "WI", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Sarah Ziolkowski", "title": "PT/Owner", "email": "couleept@gmail.com", "phone": "", "website": "https://couleephysicaltherapy.com", "source": "research 2026-06-10", "notes": "Owner-PT. La Crosse WI. Email from site."},
    {"practice_name": "Darling Pediatric Therapy", "city": "Naperville", "state": "IL", "specialty": "Pediatric OT+speech+feeding", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "hello@darlingpediatrictherapy.com", "phone": "", "website": "https://www.darlingpediatrictherapy.com", "source": "research 2026-06-10", "notes": "Pediatric OT, speech, feeding. Naperville IL. Email from contact page."},
    {"practice_name": "Impact Pediatric Therapy & Lactation Support", "city": "Geneva", "state": "IL", "specialty": "Pediatric speech+OT+PT+feeding", "providers_estimate": "3-5", "owner_or_pm_name": "Jess Groenendyk", "title": "MA CCC-SLP/Owner", "email": "jess@impactpediatrictherapy.org", "phone": "", "website": "https://www.impactpediatrictherapy.org", "source": "research 2026-06-10", "notes": "Owner-SLP pediatric therapy. Geneva IL. Email from site."},
    {"practice_name": "My Recess Therapy", "city": "St. Charles", "state": "IL", "specialty": "Pediatric OT+speech+PT", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@myrecess.com", "phone": "", "website": "https://www.myrecess.com", "source": "research 2026-06-10", "notes": "Sensory-based pediatric therapy. St. Charles/Elgin IL. Email from site."},
    {"practice_name": "CU Speech Therapy", "city": "Champaign", "state": "IL", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Rachel Miebach", "title": "MA CCC-SLP/Owner", "email": "rachel@cuspeechtherapy.com", "phone": "", "website": "https://www.cuspeechtherapy.com", "source": "research 2026-06-10", "notes": "Owner-SLP pediatric speech. Champaign IL. Email from site."},
    {"practice_name": "Bloomington Pediatric Speech Therapy", "city": "Bloomington", "state": "IL", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Leslie Garthaus", "title": "SLP/Founder", "email": "info@bloomingtonpediatricspeech.com", "phone": "", "website": "https://www.bloomingtonpediatricspeech.com", "source": "research 2026-06-10", "notes": "Founder-SLP pediatric speech. Bloomington IL. Email from contact page."},
    {"practice_name": "Myofascial Physical Therapy LLC", "city": "Rockford", "state": "IL", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Carl Patrnchak", "title": "PT/Owner", "email": "carl@myofascialrockford.com", "phone": "", "website": "https://myofascialphysicaltherapyllc.com", "source": "research 2026-06-10", "notes": "Owner-PT myofascial specialty. Rockford IL. Email from contact page."},
    {"practice_name": "OWL Therapy Services", "city": "Rochester", "state": "MN", "specialty": "Pediatric speech+OT", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "team@owltherapyservices.com", "phone": "", "website": "https://www.owltherapyservices.com", "source": "research 2026-06-10", "notes": "Pediatric speech and OT. Rochester MN. Email from site."},

    # --- GA / FL / NC / SC ---
    {"practice_name": "Dermatology Associates Savannah", "city": "Savannah", "state": "GA", "specialty": "Dermatology", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Collins", "title": "MD", "email": "savannahoffice@skinmdga.com", "phone": "", "website": "https://dermatologyassociatesga.com", "source": "research 2026-06-10", "notes": "Independent derm. Savannah GA. Email from contact page."},
    {"practice_name": "Proactive Rehabilitation & Wellness", "city": "Augusta", "state": "GA", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Rafael Salazar II", "title": "MHS OTR/L/Owner", "email": "info@pro-activehealth.com", "phone": "", "website": "https://pro-activehealth.com", "source": "research 2026-06-10", "notes": "Owner-OT led PT and wellness. Augusta GA. Email from contact page."},
    {"practice_name": "Georgia Psychology & Counseling", "city": "Augusta", "state": "GA", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Adrian Janit", "title": "Founder/Psychologist", "email": "frontoffice@gapsych.com", "phone": "", "website": "https://gapsych.com", "source": "research 2026-06-10", "notes": "Founder-led psychology practice. Augusta GA. Email from site."},
    {"practice_name": "Thrive Therapy Savannah", "city": "Savannah", "state": "GA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "Hiral Patel & Christy Andrews", "title": "Co-founders", "email": "admin@thrivetherapyga.com", "phone": "", "website": "https://thrivetherapyga.com", "source": "research 2026-06-10", "notes": "Co-founder PT/OT/SLP. Savannah GA. Email from site."},
    {"practice_name": "Body Mechanix Physiotherapy", "city": "Tallahassee", "state": "FL", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Brandon Alkire", "title": "DPT/Owner", "email": "frontdesk@bodymechanixpt.com", "phone": "", "website": "https://www.bodymechanixpt.com", "source": "research 2026-06-10", "notes": "Owner-PT. Tallahassee FL. Accepts major insurance. Email from site."},
    {"practice_name": "Symmetry Physical Therapy Miami", "city": "Miami", "state": "FL", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Natalia Sikaczowski", "title": "PT DPT/Founder", "email": "info@symmetryptmiami.com", "phone": "", "website": "https://symmetryptmiami.com", "source": "research 2026-06-10", "notes": "Founder-PT. Miami FL. Email from site."},
    {"practice_name": "SanaMente Counseling", "city": "Tampa", "state": "FL", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "office@smctampa.com", "phone": "", "website": "https://www.smctampa.com", "source": "research 2026-06-10", "notes": "Independent counseling. Tampa FL. Email from contact page."},
    {"practice_name": "Advance In Motion Physical Therapy", "city": "Wilmington", "state": "NC", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "admin@aimpts.com", "phone": "", "website": "https://aimpts.com", "source": "research 2026-06-10", "notes": "Independent PT. Wilmington NC. Email from site."},
    {"practice_name": "PT by the Sea", "city": "Wilmington", "state": "NC", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "ptbythesea.nc@gmail.com", "phone": "", "website": "https://ptbythesea.com", "source": "research 2026-06-10", "notes": "Independent PT. Wilmington NC. Email from contact page."},
    {"practice_name": "Winter to Spring Wellness", "city": "Asheville", "state": "NC", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "Julie Scroggs", "title": "LCMHCS LCAS/Clinical Director", "email": "hello@wintertospringwellness.com", "phone": "", "website": "https://www.traumatherapync.com", "source": "research 2026-06-10", "notes": "Trauma-informed counseling. Asheville NC. Email from site."},
    {"practice_name": "East Cooper Behavioral Health", "city": "Mount Pleasant", "state": "SC", "specialty": "Behavioral health (counseling)", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@ecbh-llc.com", "phone": "", "website": "https://www.ecbh-llc.com", "source": "research 2026-06-10", "notes": "Independent behavioral health. Mount Pleasant SC. Email from site."},
    {"practice_name": "Thrive Pediatric Therapy & Family Services", "city": "Myrtle Beach", "state": "SC", "specialty": "Pediatric OT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "thrivepediatrictherapysc@gmail.com", "phone": "", "website": "https://www.thrivepediatrictherapysc.com", "source": "research 2026-06-10", "notes": "Pediatric OT and speech. Myrtle Beach SC. Email from contact page."},
    {"practice_name": "Connections Pediatric Therapy", "city": "Myrtle Beach", "state": "SC", "specialty": "Pediatric OT+PT+speech", "providers_estimate": "3-5", "owner_or_pm_name": "Lindsey", "title": "Owner", "email": "lindsey@connectionspediatric.com", "phone": "", "website": "https://connectionspediatric.com", "source": "research 2026-06-10", "notes": "Owner-led pediatric therapy. Myrtle Beach SC. Email from contact page."},

    # --- TX / OH / PA / VA ---
    {"practice_name": "BestHealth Chiropractic Clinic", "city": "Fort Worth", "state": "TX", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Fajardo", "title": "DC", "email": "info@besthealthclinic.com", "phone": "", "website": "https://www.besthealthclinic.com", "source": "research 2026-06-10", "notes": "Independent chiro. Fort Worth TX. Email from contact page."},
    {"practice_name": "River Oaks Chiropractic", "city": "Fort Worth", "state": "TX", "specialty": "Chiropractic", "providers_estimate": "3-5", "owner_or_pm_name": "Dale White Jr. DC", "title": "Owner", "email": "frontoffice@txriveroaks.com", "phone": "", "website": "https://www.riveroakschiropracticclinic.com", "source": "research 2026-06-10", "notes": "Family-owned multi-physician chiro. Fort Worth TX. Email from contact page."},
    {"practice_name": "K Chiropractic", "city": "Lubbock", "state": "TX", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Karim Shoujaa", "title": "DC/Owner", "email": "kchiropracticlbk@gmail.com", "phone": "", "website": "https://www.k-chiropractic.com", "source": "research 2026-06-10", "notes": "Owner-DC. Lubbock TX. Email from site."},
    {"practice_name": "Greater Dayton Ear Nose and Throat", "city": "Vandalia", "state": "OH", "specialty": "ENT (otolaryngology)", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Stewart Adam III", "title": "MD", "email": "patientcontact@greaterdaytonent.com", "phone": "", "website": "https://www.greaterdaytonent.com", "source": "research 2026-06-10", "notes": "Independent ENT. Dayton area OH. Email from site."},
    {"practice_name": "Pamer Chiropractic Health Center", "city": "Akron", "state": "OH", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@pamerchiro.com", "phone": "", "website": "https://www.pamerchiro.com", "source": "research 2026-06-10", "notes": "Independent chiro. Akron OH. Email from site."},
    {"practice_name": "Toledo Chiropractic LLC", "city": "Toledo", "state": "OH", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Steven", "title": "DC", "email": "toledochiropractic@ameritech.net", "phone": "", "website": "https://www.toledochiropractic.net", "source": "research 2026-06-10", "notes": "Independent chiro. Toledo OH. Email from contact page."},
    {"practice_name": "Chiropractic Care Center PA", "city": "Washington", "state": "PA", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Michael J. McCort", "title": "DC", "email": "ccc@chiropracticcarecenterpa.com", "phone": "", "website": "https://chiropracticcarecenterpa.com", "source": "research 2026-06-10", "notes": "Independent chiro. Washington PA. Email from contact page."},
    {"practice_name": "Virginia Sleep Center", "city": "Richmond", "state": "VA", "specialty": "Sleep medicine", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@virginiasleepcenter.com", "phone": "", "website": "https://virginiasleepcenter.com", "source": "research 2026-06-10", "notes": "Independent sleep medicine. Richmond VA. Email from site."},
    {"practice_name": "Achilles Foot and Ankle Center", "city": "Richmond", "state": "VA", "specialty": "Podiatry", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. James B. Baldwin III", "title": "DPM", "email": "help@achillesfootandankle.com", "phone": "", "website": "https://achillesfootandankle.com", "source": "research 2026-06-10", "notes": "Owner-podiatrist. Richmond VA. Email from site."},
    {"practice_name": "Podiatry Associates of Virginia", "city": "Virginia Beach", "state": "VA", "specialty": "Podiatry", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "virginiafootdoc@hotmail.com", "phone": "", "website": "https://www.podiatryassociatesofvirginia.com", "source": "research 2026-06-10", "notes": "Independent podiatry. Virginia Beach VA. Email from contact page."},
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
