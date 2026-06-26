#!/usr/bin/env python3
"""Add new leads to docs/sales/leads.csv without duplicates."""

import csv
from pathlib import Path
import sys

# New leads found from web searches
NEW_LEADS = [
    # Physical Therapy
    {"practice_name": "Symmetry Physical Therapy", "city": "Austin", "state": "TX", "specialty": "Physical therapy (orthopedic)", "providers_estimate": "3-5", "owner_or_pm_name": "Julie Mankinen PT, OCS, FAAOMPT", "title": "Owner/Founder", "email": "info@symmetryptaustin.com", "phone": "(512) 339-1500", "website": "https://symmetryptaustin.com", "source": "tavily search 2026-06-05", "notes": "Owner-led PT practice. Orthopedic certified specialist. Julie Mankinen owner since 2012."},
    {"practice_name": "ATX Physical Therapy", "city": "Pflugerville", "state": "TX", "specialty": "Physical therapy", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "info@atxphysicaltherapy.com", "phone": "(512) 450-1300", "website": "https://atxphysicaltherapy.com", "source": "tavily search 2026-06-05", "notes": "Multiple locations in Austin area. Pflugerville location."},
    {"practice_name": "Capitol Physical Therapy", "city": "Washington", "state": "DC", "specialty": "Physical therapy", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "info@capitolptdc.com", "phone": "(202) 794-6821", "website": "https://capitolptdc.com", "source": "tavily search 2026-06-05", "notes": "Also has Upper Marlboro, MD location. Pain management & injury treatment."},
    {"practice_name": "Therapy In Motion LLC", "city": "Ellicott City", "state": "MD", "specialty": "Physical therapy", "providers_estimate": "1-3", "owner_or_pm_name": "Diane Lamothe PT", "title": "Physical Therapist", "email": "diane@therapyinmotionllc.org", "phone": "(301) 541-8713", "website": "", "source": "tavily search 2026-06-05", "notes": "Independent PT serving Howard County. Owner-operated."},
    {"practice_name": "Washington Wellness PT", "city": "Washington", "state": "DC", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "Hst@washingtonwellnesspt.com", "phone": "(202) 347-2373", "website": "https://washingtonwellnesspt.com", "source": "tavily search 2026-05-30 (already in leads)", "notes": "Two DC locations. Outpatient private practice."},
    {"practice_name": "Maryland Center for Physical Therapy", "city": "Owings Mills", "state": "MD", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "", "phone": "(410) 363-7123", "website": "https://www.marylandcenterforphysicaltherapy.com", "source": "tavily search 2026-06-05", "notes": "Independent PT-owned practice. Evidence-based practice."},
    {"practice_name": "Rebalance Physical Therapy", "city": "Philadelphia", "state": "PA", "specialty": "Physical therapy (pelvic + ortho)", "providers_estimate": "3-5", "owner_or_pm_name": "Hina Sheth", "title": "MS.PT.OSC.MTC Founder/Practitioner", "email": "info@rebalancept.com", "phone": "267-282-1301", "website": "https://rebalancept.com", "source": "tavily search 2026-06-05", "notes": "Owner-led PT. Pelvic floor + ortho specialty. Two locations."},
    {"practice_name": "Advanced Physical Therapy", "city": "Philadelphia", "state": "PA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "", "phone": "(215) 742-8099", "website": "https://advancedphysicaltherapy.org", "source": "tavily search 2026-06-05", "notes": "Philadelphia location. 2127 Rhawn St."},
    {"practice_name": "Health Check Physical Therapy", "city": "Downingtown", "state": "PA", "specialty": "Physical therapy", "providers_estimate": "3-5", "owner_or_pm_name": "Tom Suspenski PT, ATC", "title": "Owner and founder", "email": "", "phone": "", "website": "https://healthcheckpt.com", "source": "tavily search 2026-06-05", "notes": "Independently owned outpatient PT. Since 2002. Direct access provider."},

    # Behavioral Health
    {"practice_name": "Mindwell Behavioral Health", "city": "Princeton/Ewing/Pennsauken", "state": "NJ", "specialty": "Behavioral health (counseling)", "providers_estimate": "10+", "owner_or_pm_name": "", "title": "", "email": "info@mindwellcare.com", "phone": "(609) 237-7100", "website": "https://mindwellcare.com", "source": "tavily search 2026-06-05", "notes": "Private practice mental health. 3 locations in Mercer/Camden counties."},
    {"practice_name": "Blueprint Mental Health", "city": "Somerville", "state": "NJ", "specialty": "Behavioral health (counseling)", "providers_estimate": "10-20", "owner_or_pm_name": "", "title": "", "email": "clientrelations@blueprintmentalhealth.com", "phone": "908-256-6965", "website": "https://blueprintmentalhealth.com", "source": "tavily search 2026-06-05", "notes": "12 clinicians. Children, teen, adult, couples, family counseling."},
    {"practice_name": "Haven Behavioral Health", "city": "Forked River", "state": "NJ", "specialty": "Behavioral health (counseling)", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "office@havenbehavioralhealth.net", "phone": "609-971-8989", "website": "https://havenbehavioralhealth.net", "source": "tavily search 2026-06-05", "notes": "In-network with most insurances. Child, adolescent, adult, family care."},
    {"practice_name": "Westside Behavioral Care", "city": "Denver", "state": "CO", "specialty": "Behavioral health (counseling)", "providers_estimate": "10+", "owner_or_pm_name": "", "title": "", "email": "info@westsidebehavioral.com", "phone": "303-986-4197", "website": "", "source": "tavily search 2026-06-05", "notes": "Mental health therapy in greater Denver. Multiple locations."},
    {"practice_name": "Resilience Center", "city": "Houston", "state": "TX", "specialty": "Behavioral health (counseling)", "providers_estimate": "10+", "owner_or_pm_name": "", "title": "", "email": "", "phone": "346-206-3992", "website": "https://resiliencecenterhouston.com", "source": "tavily search 2026-06-05", "notes": "5 locations in greater Houston. Evidence-based therapy."},

    # Pediatrics
    {"practice_name": "Sandy Springs Pediatrics", "city": "Atlanta", "state": "GA", "specialty": "Pediatrics", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "contact@sandyspringspediatrics.com", "phone": "404-252-4611", "website": "https://sandyspringspediatrics.com", "source": "tavily search 2026-06-05", "notes": "5 board-certified pediatricians. Since 1968. 6100 Lake Forrest Dr."},
    {"practice_name": "Pediatric Associates of North Atlanta", "city": "Peachtree Corners", "state": "GA", "specialty": "Pediatrics", "providers_estimate": "5-10", "owner_or_pm_name": "Sheri Zager MD, FAAP", "title": "", "email": "", "phone": "(770) 476-9885", "website": "https://www.panapc.com", "source": "tavily search 2026-06-05", "notes": "Board-certified pediatricians. Birth through age 21."},
    {"practice_name": "Pediatric Works", "city": "Atlanta", "state": "GA", "specialty": "Pediatrics (concierge)", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@pediatricworks.co", "phone": "404-301-2191", "website": "https://www.pediatricworks.co", "source": "tavily search 2026-05-30", "notes": "Premier concierge pediatric clinic. Home visits available."},
    {"practice_name": "West Atlanta Pediatrics", "city": "Lithia Springs", "state": "GA", "specialty": "Pediatrics", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "", "phone": "739-9292", "website": "https://westatlantapediatrics.org", "source": "tavily search 2026-06-05", "notes": "Since 1992 in Lithia Springs, 2004 in Dallas. Birth through age 18."},
    {"practice_name": "Greater Atlanta Pediatrics", "city": "Stone Mountain", "state": "GA", "specialty": "Pediatrics", "providers_estimate": "3-5", "owner_or_pm_name": "Dr. Saad Hammid", "title": "", "email": "greateratlantapediatrics@gmail.com", "phone": "770-322-6161", "website": "", "source": "tavily search 2026-06-05", "notes": "20+ years experience. English, Spanish, Arabic-speaking staff."},

    # Primary Care
    {"practice_name": "Mercy Family Clinic", "city": "Dallas", "state": "TX", "specialty": "Primary care", "providers_estimate": "3-5", "owner_or_pm_name": "Ebere Israel Azubuike MD", "title": "Medical Director", "email": "", "phone": "214-942-2377", "website": "https://mercyfamilyclinic.com", "source": "tavily search 2026-06-05", "notes": "Family medicine + medical weight loss clinic. GLP-1 medications available."},
    {"practice_name": "Thomas Family Practice", "city": "Houston", "state": "TX", "specialty": "Primary care", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Sally Thomas", "title": "", "email": "", "phone": "713-461-6300", "website": "https://www.drsallythomas.com", "source": "tavily search 2026-06-05", "notes": "NCQA-certified physician. General medicine, weight management."},
    {"practice_name": "Family Practice Doctors", "city": "Humble", "state": "TX", "specialty": "Primary care", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "info@fpdrs.com", "phone": "281-570-2606", "website": "", "source": "tavily search 2026-06-05", "notes": "Primary care + urgent care. New Saturday hours 8AM-1PM."},
    {"practice_name": "KarisMed Family Medicine", "city": "Katy", "state": "TX", "specialty": "Primary care (DPC)", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "info@karismed.com", "phone": "832-930-7799", "website": "https://karismed.com", "source": "tavily search 2026-06-05", "notes": "Direct primary care. Membership-based model. Preventive, acute, chronic care."},

    # Occupational Therapy
    {"practice_name": "Creative Wonders Therapy Center", "city": "Mount Kisco", "state": "NY", "specialty": "Pediatric OT+PT+ST", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "", "phone": "914-421-8270", "website": "http://creativewonderstherapy.com", "source": "tavily search 2026-06-05", "notes": "Pediatric PT, OT, speech therapy. EI and CPSE certified. Westchester County."},
    {"practice_name": "The Therapy Nest", "city": "Rye Brook", "state": "NY", "specialty": "Pediatric OT", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "", "phone": "", "website": "https://www.thetherapynest.com", "source": "tavily search 2026-06-05", "notes": "Private OT practice. Sensory gym in Rye Brook. Serves Westchester and Fairfield."},
    {"practice_name": "Spring Ahead Pediatric", "city": "NYC", "state": "NY", "specialty": "Pediatric OT+PT+ST", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "", "phone": "(631)832-3234", "website": "https://springaheadpediatric.com", "source": "tavily search 2026-06-05", "notes": "Boutique sensory gym. Union Square + Williamsburg + Greenpoint Brooklyn locations."},

    # Acupuncture
    {"practice_name": "Tranquility Health Center", "city": "Union/Berkeley Heights", "state": "NJ", "specialty": "Acupuncture", "providers_estimate": "1-3", "owner_or_pm_name": "Jeanny Chan", "title": "Licensed Acupuncturist", "email": "", "phone": "(908) 723-1580", "website": "https://tranquilityhealthcenter.com", "source": "tavily search 2026-06-05", "notes": "Independent acupuncture practitioner. 15+ years experience. Fertility specialty."},
    {"practice_name": "Acupuncture & Holistic Health Care", "city": "East Brunswick", "state": "NJ", "specialty": "Acupuncture", "providers_estimate": "3-5", "owner_or_pm_name": "Huiyi Zhou", "title": "Acupuncturist & Herbologist", "email": "", "phone": "732-257-3472", "website": "https://www.acupunctureholistichealth.com", "source": "tavily search 2026-06-05", "notes": "2 locations in Central NJ. Acupuncture + herbal therapy."},
    {"practice_name": "Connecticut Family Acupuncture", "city": "Wethersfield", "state": "CT", "specialty": "Acupuncture", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "", "phone": "", "website": "https://www.ctfamilyacupuncture.com", "source": "tavily search 2026-06-05", "notes": "Multiple locations. Acupuncture, Chinese herbs, cupping, chiropractic."},

    # Dermatology
    {"practice_name": "Modern Dermatology of Massachusetts", "city": "Auburn", "state": "MA", "specialty": "Dermatology", "providers_estimate": "3-5", "owner_or_pm_name": "", "title": "", "email": "", "phone": "(508) 974-3037", "website": "https://www.moderndermatologyma.com", "source": "tavily search 2026-06-05", "notes": "Independent dermatology clinic. Medical, surgical, cosmetic dermatology."},
    {"practice_name": "Dermatology Associates of Concord", "city": "Concord", "state": "MA", "specialty": "Dermatology", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "", "phone": "(978) 254-1600", "website": "https://www.totalskinhealth.com", "source": "tavily search 2026-06-05", "notes": "3 locations: Concord, Cambridge, Waltham. Since 1972. Mohs micrographic surgery."},
    {"practice_name": "Plymouth Dermatology Associates", "city": "Plymouth", "state": "MA", "specialty": "Dermatology", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "", "phone": "(508) 746-5300", "website": "https://www.plymouthdermatologyma.com", "source": "tavily search 2026-06-05", "notes": "Since 1997. Medical, surgical, cosmetic dermatology."},

    # Speech Therapy
    {"practice_name": "Speech Therapy For All", "city": "Riverhead", "state": "NY", "specialty": "Pediatric speech", "providers_estimate": "5-10", "owner_or_pm_name": "", "title": "", "email": "info@speechtherapyforall.com", "phone": "631-538-0579", "website": "https://speechtherapyforall.com", "source": "tavily search 2026-06-05", "notes": "Multiple Long Island locations. Speech, OT, feeding therapy."},
    {"practice_name": "Chatty Child", "city": "NYC", "state": "NY", "specialty": "Pediatric speech", "providers_estimate": "1-3", "owner_or_pm_name": "Heather Lynn Boerner MA CCC/SLP", "title": "", "email": "info@chattychild.com", "phone": "347 491 4451", "website": "https://chattychild.com", "source": "tavily search 2026-06-05", "notes": "Private pediatric speech therapy. 20+ years experience. Mindfulness-informed."},

    # More Physical Therapy
    {"practice_name": "Spero Rehab", "city": "Austin/Katy", "state": "TX", "specialty": "Physical therapy + OT", "providers_estimate": "10-20", "owner_or_pm_name": "", "title": "", "email": "", "phone": "", "website": "https://sperorehab.com", "source": "tavily search 2026-06-05", "notes": "5 locations across Austin, Dripping Springs, Bastrop, Katy. Aquatic therapy available."},
    {"practice_name": "Texas Physical Therapy Specialists", "city": "Austin", "state": "TX", "specialty": "Physical therapy", "providers_estimate": "10-20", "owner_or_pm_name": "", "title": "", "email": "", "phone": "(512) 225-1002", "website": "https://texpts.com", "source": "tavily search 2026-06-05", "notes": "6836 Austin Center Blvd. Board-certified PTs. Sports rehab focus."},
    {"practice_name": "Individual Physical Therapy", "city": "Scotch Plains", "state": "NJ", "specialty": "Physical therapy", "providers_estimate": "5-10", "owner_or_pm_name": "Jay & Kate Neiswinter DPT", "title": "Owners", "email": "info@individualpt.com", "phone": "(908) 989-3252", "website": "https://individualpt.com", "source": "already in leads 2026-06-02", "notes": "Check if duplicate - may already exist."},

    # Chiropractic
    {"practice_name": "Macnamara Chiropractic", "city": "Danielson", "state": "CT", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. William Macnamara", "title": "", "email": "", "phone": "(860) 779-9870", "website": "https://www.macnamarachiropractic.com", "source": "tavily search 2026-06-05", "notes": "Family and community-focused. Active in Knights of Columbus."},
    {"practice_name": "Erickson Healing Arts", "city": "Manhattan", "state": "NY", "specialty": "Chiropractic", "providers_estimate": "1-3", "owner_or_pm_name": "Dr. Karen Erickson", "title": "", "email": "frontdesk@ericksonhealingarts.com", "phone": "(212) 721-0177", "website": "https://www.ericksonhealingarts.com", "source": "tavily search 2026-06-05", "notes": "Upper West Side Manhattan. Pediatric + adult chiropractic care."},

    # Optometry
    {"practice_name": "Shore Family Eyecare", "city": "Manasquan", "state": "NJ", "specialty": "Optometry", "providers_estimate": "1-3", "owner_or_pm_name": "", "title": "", "email": "", "phone": "", "website": "https://www.lowvision-nj.com", "source": "tavily search 2026-06-05", "notes": "Low vision specialist. 161 Main St Manasquan."},
]

ROOT = Path(__file__).resolve().parents[2]
LEADS_CSV = ROOT / "docs" / "sales" / "leads.csv"

def add_new_leads():
    """Add new leads to leads.csv if they don't already exist."""
    # Read existing leads
    with LEADS_CSV.open(newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        existing_rows = list(reader)

    # Track existing practice names to avoid duplicates
    existing_practices = {row.get("practice_name", "").strip().lower() for row in existing_rows}
    existing_emails = {row.get("email", "").strip().lower() for row in existing_rows}

    # Filter out duplicates
    new_leads_to_add = []
    for lead in NEW_LEADS:
        practice_name = lead.get("practice_name", "").strip().lower()
        email = lead.get("email", "").strip().lower()

        # Skip if practice name or email already exists
        if practice_name in existing_practices:
            print(f"Skipping {lead['practice_name']} - practice name already exists")
            continue
        if email and email in existing_emails:
            print(f"Skipping {lead['practice_name']} - email already exists")
            continue

        new_leads_to_add.append(lead)
        existing_practices.add(practice_name)
        if email:
            existing_emails.add(email)

    if not new_leads_to_add:
        print("No new leads to add (all duplicates)")
        return 0

    # Add new leads
    with LEADS_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        for lead in new_leads_to_add:
            # Fill in missing fields
            row = {field: "" for field in fieldnames}
            row.update(lead)
            row["STATUS"] = "📋 READY"
            writer.writerow(row)

    print(f"Added {len(new_leads_to_add)} new leads to {LEADS_CSV}")
    return len(new_leads_to_add)

if __name__ == "__main__":
    count = add_new_leads()
    sys.exit(0 if count > 0 else 1)
