"""Generate realistic test fixtures for the upload pipeline.

Produces:
  10 .era  — canonical 835 with ISA envelope
  10 .txt  — same 835 format but stored as plain text
  10 .pdf  — 835 text rendered into a PDF (text-extractable)
  10 .csv  — billing-export CSVs with varying column-name conventions

Each fixture covers a different real-world scenario: payer, denial codes,
patient demographics, multi-service claims, claim-level vs service-level CAS,
SVC sub-elements with modifiers, etc.
"""

from __future__ import annotations

import os
import textwrap
from dataclasses import dataclass, field
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas


HERE = Path(__file__).parent


# ----- Data model ---------------------------------------------------------

@dataclass
class Service:
    cpt: str
    modifier: str = ""
    billed: float = 0.0
    paid: float = 0.0
    # Each service can carry zero or more CAS adjustments
    cas: list[tuple[str, str, float]] = field(default_factory=list)  # (group, code, amt)
    dos: str = ""  # YYYYMMDD


@dataclass
class Claim:
    control_number: str
    status: str               # 1=primary, 2=secondary, 3=tertiary, 4=denied
    billed: float
    paid: float
    pat_responsibility: float
    payer_claim_id: str
    patient_last: str
    patient_first: str
    member_id: str
    dos_start: str
    dos_end: str
    services: list[Service]
    # Patient name vs subscriber: True = patient is subscriber (NM1*IL only),
    # False = patient is dependent (NM1*IL subscriber + NM1*QC patient).
    patient_is_subscriber: bool = True
    subscriber_last: str = ""
    subscriber_first: str = ""
    # Optional claim-level CAS (applied before any SVC, e.g., sequestration).
    claim_level_cas: list[tuple[str, str, float]] = field(default_factory=list)


@dataclass
class Era:
    payer_name: str
    payer_id: str
    provider_name: str
    provider_npi: str
    provider_tin: str
    check_date: str
    payment_total: float
    claims: list[Claim]
    # When True, write segments terminated by `~\n`; when False, only `\n`.
    use_tilde_terminator: bool = True


# ----- Renderer -----------------------------------------------------------

def render_era(era: Era) -> str:
    """Render an Era as canonical 835 EDI text."""
    term = "~\n" if era.use_tilde_terminator else "\n"
    out: list[str] = []

    out.append(f"ISA*00*          *00*          *ZZ*{era.payer_id:<15}*ZZ*{era.provider_tin:<15}*230101*1200*^*00501*{'000000001':>9}*0*P*:")
    out.append(f"GS*HP*{era.payer_id}*{era.provider_tin}*20230101*1200*1*X*005010X221A1")
    out.append(f"ST*835*0001")
    out.append(f"BPR*I*{era.payment_total:.2f}*C*CHK************{era.check_date}")
    out.append(f"TRN*1*0000{era.check_date}*{era.payer_id}")
    out.append(f"DTM*405*{era.check_date}")
    out.append(f"N1*PR*{era.payer_name}")
    out.append(f"N3*1000 PAYER WAY")
    out.append(f"N4*PAYERVILLE*CA*90210")
    out.append(f"N1*PE*{era.provider_name}*XX*{era.provider_npi}")
    out.append(f"REF*TJ*{era.provider_tin}")
    out.append(f"LX*1")

    for c in era.claims:
        out.append(
            f"CLP*{c.control_number}*{c.status}*{c.billed:.2f}*{c.paid:.2f}*{c.pat_responsibility:.2f}*MC*{c.payer_claim_id}*11"
        )

        # Subscriber (always emitted)
        if c.patient_is_subscriber:
            # NM1*IL carries the patient when patient = subscriber.
            out.append(f"NM1*IL*1*{c.patient_last}*{c.patient_first}****MI*{c.member_id}")
        else:
            # Distinct subscriber + dependent patient.
            out.append(f"NM1*IL*1*{c.subscriber_last}*{c.subscriber_first}****MI*{c.member_id}")
            out.append(f"NM1*QC*1*{c.patient_last}*{c.patient_first}")

        out.append(f"DTM*232*{c.dos_start}")
        out.append(f"DTM*233*{c.dos_end}")

        # Claim-level CAS (before any SVC)
        for grp, code, amt in c.claim_level_cas:
            out.append(f"CAS*{grp}*{code}*{amt:.2f}")

        # Service lines
        for s in c.services:
            mod = f">{s.modifier}" if s.modifier else ""
            out.append(f"SVC*HC>{s.cpt}{mod}*{s.billed:.2f}*{s.paid:.2f}**1")
            if s.dos:
                out.append(f"DTM*472*{s.dos}")
            for grp, code, amt in s.cas:
                out.append(f"CAS*{grp}*{code}*{amt:.2f}")

    out.append(f"SE*{len(out) - 2}*0001")
    out.append(f"GE*1*1")
    out.append(f"IEA*1*000000001")

    return term.join(out) + term


def render_pdf(era_text: str, dest: Path) -> None:
    """Render ERA text into a text-extractable PDF."""
    c = canvas.Canvas(str(dest), pagesize=letter)
    width, height = letter
    margin = 0.5 * inch
    line_height = 9
    y = height - margin
    c.setFont("Courier", 7)
    # Wrap long segments at the page width
    chars_per_line = 110
    for raw_line in era_text.splitlines():
        for chunk in textwrap.wrap(raw_line, width=chars_per_line) or [""]:
            if y < margin:
                c.showPage()
                c.setFont("Courier", 7)
                y = height - margin
            c.drawString(margin, y, chunk)
            y -= line_height
    c.save()


# ----- 10 ERA scenarios ---------------------------------------------------

def scenarios() -> list[Era]:
    return [
        # 1 — Medicare Part B, single CO-45 contractual + CO-237 sequestration
        Era(
            payer_name="MEDICARE PART B - NORIDIAN",
            payer_id="MEDB001",
            provider_name="GREENFIELD INTERNAL MEDICINE",
            provider_npi="1487654321",
            provider_tin="123456789",
            check_date="20240118",
            payment_total=58.42,
            claims=[
                Claim(
                    control_number="MCB202401001", status="1",
                    billed=145.00, paid=58.42, pat_responsibility=14.61,
                    payer_claim_id="MC100012345",
                    patient_last="HENDERSON", patient_first="LINDA",
                    member_id="1AB2C34DE56",
                    dos_start="20240108", dos_end="20240108",
                    services=[
                        Service(cpt="99213", modifier="25", billed=145.00, paid=58.42, dos="20240108",
                                cas=[("CO", "45", 71.97), ("CO", "253", 0.0)]),
                    ],
                ),
            ],
        ),

        # 2 — Aetna, denied claim CO-50 medical necessity for an MRI
        Era(
            payer_name="AETNA HEALTH INC",
            payer_id="AETNA060",
            provider_name="LAKESIDE IMAGING ASSOCIATES",
            provider_npi="1769988776",
            provider_tin="540123456",
            check_date="20231220",
            payment_total=0.00,
            claims=[
                Claim(
                    control_number="AET202312-MRI42", status="4",
                    billed=1750.00, paid=0.00, pat_responsibility=0.00,
                    payer_claim_id="AT04578291",
                    patient_last="RAMIREZ", patient_first="CARLOS",
                    member_id="W612345678",
                    dos_start="20231115", dos_end="20231115",
                    services=[
                        Service(cpt="70553", billed=1750.00, paid=0.00, dos="20231115",
                                cas=[("CO", "50", 1750.00)]),
                    ],
                ),
            ],
        ),

        # 3 — Cigna, multi-service mixed (paid + denied CO-197 prior auth)
        Era(
            payer_name="CIGNA HEALTH AND LIFE INSURANCE COMPANY",
            payer_id="CIG200",
            provider_name="HARBOR ORTHOPEDIC GROUP",
            provider_npi="1356679921",
            provider_tin="221334455",
            check_date="20240205",
            payment_total=237.18,
            claims=[
                Claim(
                    control_number="CGN20240131A", status="1",
                    billed=695.00, paid=237.18, pat_responsibility=50.00,
                    payer_claim_id="CG778800012",
                    patient_last="OKONKWO", patient_first="ADAEZE",
                    member_id="U2233445566",
                    dos_start="20240131", dos_end="20240131",
                    services=[
                        Service(cpt="99204", modifier="25", billed=295.00, paid=187.18, dos="20240131",
                                cas=[("CO", "45", 57.82), ("PR", "3", 50.00)]),
                        Service(cpt="73564", billed=210.00, paid=50.00, dos="20240131",
                                cas=[("CO", "45", 160.00)]),
                        Service(cpt="20610", billed=190.00, paid=0.00, dos="20240131",
                                cas=[("CO", "197", 190.00)]),
                    ],
                ),
            ],
        ),

        # 4 — BCBS of TX, PR-1 deductible + PR-2 coinsurance (patient responsibility)
        Era(
            payer_name="BLUE CROSS BLUE SHIELD OF TEXAS",
            payer_id="BCBSTX",
            provider_name="HILL COUNTRY PEDIATRICS",
            provider_npi="1228897654",
            provider_tin="746555221",
            check_date="20240310",
            payment_total=82.46,
            claims=[
                Claim(
                    control_number="BCBSTX-202403-7821", status="1",
                    billed=215.00, paid=82.46, pat_responsibility=99.31,
                    payer_claim_id="TX00928374",
                    patient_last="NGUYEN", patient_first="MAI",
                    member_id="BCH998877665",
                    dos_start="20240228", dos_end="20240228",
                    services=[
                        Service(cpt="99214", billed=215.00, paid=82.46, dos="20240228",
                                cas=[("CO", "45", 33.23), ("PR", "1", 75.00),
                                     ("PR", "2", 24.31)]),
                    ],
                ),
            ],
        ),

        # 5 — UnitedHealthcare, CO-29 timely filing on two claims
        Era(
            payer_name="UNITEDHEALTHCARE INSURANCE COMPANY",
            payer_id="UHC87726",
            provider_name="CEDAR FAMILY PRACTICE",
            provider_npi="1551122334",
            provider_tin="876544322",
            check_date="20240419",
            payment_total=0.00,
            claims=[
                Claim(
                    control_number="UHC-2024041901", status="4",
                    billed=185.00, paid=0.00, pat_responsibility=0.00,
                    payer_claim_id="UHC00112233",
                    patient_last="GOODMAN", patient_first="ELLIOT",
                    member_id="UH7766554433",
                    dos_start="20230110", dos_end="20230110",
                    services=[
                        Service(cpt="99213", billed=185.00, paid=0.00, dos="20230110",
                                cas=[("CO", "29", 185.00)]),
                    ],
                ),
                Claim(
                    control_number="UHC-2024041902", status="4",
                    billed=420.00, paid=0.00, pat_responsibility=0.00,
                    payer_claim_id="UHC00112234",
                    patient_last="WAGNER", patient_first="REBECCA",
                    member_id="UH8877665544",
                    dos_start="20230215", dos_end="20230215",
                    services=[
                        Service(cpt="93000", billed=120.00, paid=0.00, dos="20230215",
                                cas=[("CO", "29", 120.00)]),
                        Service(cpt="99214", billed=300.00, paid=0.00, dos="20230215",
                                cas=[("CO", "29", 300.00)]),
                    ],
                ),
            ],
        ),

        # 6 — Humana, dependent patient (NM1*QC distinct from NM1*IL subscriber)
        Era(
            payer_name="HUMANA HEALTH PLAN INC",
            payer_id="HUM611",
            provider_name="WESTBROOK DERMATOLOGY",
            provider_npi="1098877665",
            provider_tin="221455667",
            check_date="20240527",
            payment_total=92.74,
            claims=[
                Claim(
                    control_number="HUM-D-2024-9912", status="1",
                    billed=240.00, paid=92.74, pat_responsibility=40.00,
                    payer_claim_id="HUM5500914",
                    patient_last="HAYES", patient_first="OLIVIA",
                    member_id="HU112233445",
                    dos_start="20240515", dos_end="20240515",
                    patient_is_subscriber=False,
                    subscriber_last="HAYES", subscriber_first="MATTHEW",
                    services=[
                        Service(cpt="11102", billed=240.00, paid=92.74, dos="20240515",
                                cas=[("CO", "45", 107.26), ("PR", "3", 40.00)]),
                    ],
                ),
            ],
        ),

        # 7 — Anthem BCBS, OA-23 prior payer adjudication (secondary claim)
        Era(
            payer_name="ANTHEM BLUE CROSS BLUE SHIELD",
            payer_id="ANTHEM01",
            provider_name="RIVERSIDE SURGICAL CENTER",
            provider_npi="1665544332",
            provider_tin="908877665",
            check_date="20240612",
            payment_total=412.00,
            claims=[
                Claim(
                    control_number="ANT-SEC-202406-44", status="2",
                    billed=2150.00, paid=412.00, pat_responsibility=0.00,
                    payer_claim_id="ANT77661122",
                    patient_last="SOTO", patient_first="EVELYN",
                    member_id="AB123456789",
                    dos_start="20240520", dos_end="20240520",
                    services=[
                        Service(cpt="49560", billed=2150.00, paid=412.00, dos="20240520",
                                cas=[("OA", "23", 1738.00)]),
                    ],
                ),
            ],
        ),

        # 8 — Kaiser Permanente, capitation CO-24
        Era(
            payer_name="KAISER FOUNDATION HEALTH PLAN",
            payer_id="KP24001",
            provider_name="OAKWOOD MEDICAL GROUP",
            provider_npi="1442211009",
            provider_tin="335566778",
            check_date="20240705",
            payment_total=0.00,
            claims=[
                Claim(
                    control_number="KP-CAP-202407-A", status="4",
                    billed=320.00, paid=0.00, pat_responsibility=0.00,
                    payer_claim_id="KP00557799",
                    patient_last="MURPHY", patient_first="DEVON",
                    member_id="KP554433221",
                    dos_start="20240625", dos_end="20240625",
                    services=[
                        Service(cpt="99202", billed=320.00, paid=0.00, dos="20240625",
                                cas=[("CO", "24", 320.00)]),
                    ],
                ),
            ],
        ),

        # 9 — Workers' Comp / state Medicaid mix with CO-19 (work-related)
        Era(
            payer_name="STATE FUND WORKERS COMPENSATION",
            payer_id="SFWC555",
            provider_name="MERIDIAN OCCUPATIONAL HEALTH",
            provider_npi="1331100887",
            provider_tin="556677889",
            check_date="20240802",
            payment_total=0.00,
            claims=[
                Claim(
                    control_number="WC-2024-0801-A1", status="4",
                    billed=485.00, paid=0.00, pat_responsibility=0.00,
                    payer_claim_id="WC44558800",
                    patient_last="CRAWFORD", patient_first="SAMUEL",
                    member_id="WC998877221",
                    dos_start="20240715", dos_end="20240715",
                    services=[
                        Service(cpt="97140", billed=120.00, paid=0.00, dos="20240715",
                                cas=[("CO", "19", 120.00)]),
                        Service(cpt="97110", billed=180.00, paid=0.00, dos="20240715",
                                cas=[("CO", "19", 180.00)]),
                        Service(cpt="99203", billed=185.00, paid=0.00, dos="20240715",
                                cas=[("CO", "19", 185.00)]),
                    ],
                ),
            ],
        ),

        # 10 — Multi-claim ERA with a mix of approved + denied + duplicate
        Era(
            payer_name="MOLINA HEALTHCARE",
            payer_id="MOL3344",
            provider_name="PLAINS COMMUNITY HEALTH",
            provider_npi="1227788991",
            provider_tin="664433220",
            check_date="20240915",
            payment_total=174.50,
            claims=[
                Claim(
                    control_number="MOL-DUP-9991", status="4",
                    billed=99.00, paid=0.00, pat_responsibility=0.00,
                    payer_claim_id="MOL55887700",
                    patient_last="ALLEN", patient_first="KEISHA",
                    member_id="MO223344556",
                    dos_start="20240830", dos_end="20240830",
                    services=[
                        Service(cpt="99213", billed=99.00, paid=0.00, dos="20240830",
                                cas=[("CO", "18", 99.00)]),
                    ],
                ),
                Claim(
                    control_number="MOL-PROC-9992", status="1",
                    billed=440.00, paid=174.50, pat_responsibility=44.00,
                    payer_claim_id="MOL55887701",
                    patient_last="MARTINEZ", patient_first="JAVIER",
                    member_id="MO334455667",
                    dos_start="20240901", dos_end="20240901",
                    services=[
                        Service(cpt="99204", billed=240.00, paid=130.00, dos="20240901",
                                cas=[("CO", "45", 76.00), ("PR", "3", 34.00)]),
                        Service(cpt="93000", billed=200.00, paid=44.50, dos="20240901",
                                cas=[("CO", "45", 145.50), ("PR", "3", 10.00)]),
                    ],
                ),
                Claim(
                    control_number="MOL-BUNDLE-9993", status="4",
                    billed=85.00, paid=0.00, pat_responsibility=0.00,
                    payer_claim_id="MOL55887702",
                    patient_last="GUTIERREZ", patient_first="ANA",
                    member_id="MO445566778",
                    dos_start="20240903", dos_end="20240903",
                    services=[
                        Service(cpt="36415", billed=15.00, paid=0.00, dos="20240903",
                                cas=[("CO", "97", 15.00)]),
                        Service(cpt="80053", billed=70.00, paid=0.00, dos="20240903",
                                cas=[("CO", "97", 70.00)]),
                    ],
                ),
            ],
        ),
    ]


# ----- CSV scenarios (different column-name conventions) -----------------

def csv_fixtures() -> list[tuple[str, str]]:
    """Return list of (filename, content) for each CSV scenario."""
    return [
        # 1 — Standard headers, single column for each field
        ("01-standard-headers.csv", textwrap.dedent("""\
            patient_id,first_name,last_name,dob,member_id,payer,service_date,cpt,icd,billed_amount,denial_code,denial_reason,denied_amount,received_at
            PT-1001,ANNETTE,FOSTER,1962-08-14,BC117200332,Blue Cross Blue Shield of Texas,2024-04-10,99213,Z00.00,145.00,CO-45,Charge exceeds fee schedule,46.32,2024-04-22
            PT-1002,KEVIN,WONG,1985-02-28,UH998877665,United Healthcare,2024-04-12,99214,J06.9,215.00,CO-50,Not medically necessary,215.00,2024-04-25
            PT-1003,DARNELL,KIRBY,1978-11-03,AET445566778,Aetna,2024-04-15,93000,R07.9,120.00,PR-1,Deductible,120.00,2024-04-26
        """)),

        # 2 — Verbose headers ("Patient First Name" etc.)
        ("02-verbose-headers.csv", textwrap.dedent("""\
            "Patient ID","Patient First Name","Patient Last Name","Date of Birth","Insurance ID","Insurance Company","Date of Service","Procedure Code","Diagnosis Code","Charge Amount","Adjustment Code","Reason","Adjustment Amount","Payment Date"
            PT-2001,Maria,Hernandez,1991-04-22,CIG223344556,Cigna,2024-05-02,99204,Z23,295.00,CO-50,Not medically necessary,295.00,2024-05-15
            PT-2002,Tyrese,Brooks,1969-07-09,CIG334455667,Cigna,2024-05-04,71046,J18.9,180.00,CO-45,Fee schedule,72.00,2024-05-16
            PT-2003,Soo,Yoon,1958-12-30,CIG445566778,Cigna,2024-05-07,99213,I10,145.00,PR-3,Co-pay,40.00,2024-05-17
        """)),

        # 3 — Tab-separated despite .csv extension
        ("03-tab-separated.csv",
            "PtID\tFirst\tLast\tDOB\tMember\tPayer\tDOS\tCPT\tICD\tBilled\tDenialCode\tReason\tDenied\tReceived\n"
            "PT-3001\tHEATHER\tCALDWELL\t1973-06-18\tHUM112233445\tHumana\t2024-06-01\t99203\tZ12.31\t225.00\tCO-29\tTimely filing\t225.00\t2024-06-20\n"
            "PT-3002\tRAJ\tPATEL\t1982-09-25\tHUM223344556\tHumana\t2024-06-03\t11102\tD22.5\t165.00\tCO-45\tFee schedule\t72.55\t2024-06-21\n"
            "PT-3003\tINGRID\tMENDEZ\t1995-03-14\tHUM334455667\tHumana\t2024-06-05\t99214\tF41.1\t215.00\tCO-197\tNo prior auth\t215.00\t2024-06-22\n"
        ),

        # 4 — Mixed-case + abbreviated columns ("DOS", "Pt Name")
        ("04-abbreviated-headers.csv", textwrap.dedent("""\
            PtID,Pt First,Pt Last,DOB,Mbr#,Ins,DOS,Proc,Dx,Chg,RxnCode,Rxn,DenAmt,RcvDate
            PT-4001,WALTER,FINK,1944-11-08,AETNA776655,Aetna,2024-07-02,99396,Z00.00,275.00,CO-49,Routine preventive not covered when billed with E/M,275.00,2024-07-15
            PT-4002,GINA,RAMOS,1988-01-12,AETNA665544,Aetna,2024-07-04,90837,F32.9,225.00,CO-45,Fee schedule,68.00,2024-07-16
        """)),

        # 5 — Different delimiter: semicolons (European convention)
        ("05-semicolon-delimited.csv", textwrap.dedent("""\
            patient_id;first_name;last_name;dob;member_id;payer;service_date;cpt;icd;billed_amount;denial_code;denial_reason;denied_amount
            PT-5001;LEONARDO;BIANCHI;1980-05-12;ANT001122334;Anthem;2024-08-01;99213;Z00.00;145.00;PR-1;Deductible;145.00
            PT-5002;ISABELLE;ROUSSEAU;1956-11-29;ANT112233445;Anthem;2024-08-03;36415;R79.89;15.00;CO-97;Bundled;15.00
        """)),

        # 6 — Missing payer column (parser should warn)
        ("06-missing-payer.csv", textwrap.dedent("""\
            patient_id,first_name,last_name,dob,member_id,service_date,cpt,billed_amount,denial_code,denial_reason,denied_amount
            PT-6001,LINDSEY,RHODES,1990-07-22,M998877221,2024-08-10,99214,215.00,CO-45,Fee schedule,87.20
            PT-6002,KWAME,OSEI,1972-02-15,M887766112,2024-08-12,93010,120.00,CO-96,Non-covered,120.00
        """)),

        # 7 — Single combined patient_name column (no first/last split)
        ("07-combined-name.csv", textwrap.dedent("""\
            account_number,patient_name,dob,insurance_id,payer_name,service_date,procedure_code,billed,denial_code,denial_reason,denied_amount
            ACC-700001,"FRANKLIN, GEORGINA",1965-04-09,KP556677889,Kaiser Permanente,2024-09-01,99213,145.00,CO-24,Capitation,145.00
            ACC-700002,"OBASI, EMEKA",1948-12-30,KP667788990,Kaiser Permanente,2024-09-02,99204,295.00,CO-24,Capitation,295.00
        """)),

        # 8 — Real-world messy headers with extra columns we'll ignore
        ("08-messy-headers.csv", textwrap.dedent("""\
            Account#,MRN,Patient Last,Patient First,Patient DOB,Subscriber#,Payer Name,Plan Type,Date of Service,CPT Code,Modifier,ICD-10,Billed,Allowed,Paid,Adjustment Reason Code,Adjustment Reason,Patient Resp,Provider,Place of Svc,Rendering NPI,Received
            ACC-800001,MRN-90001,DUFFY,MARCUS,1958-08-19,UHC2233445566,United Healthcare,PPO,2024-10-01,99214,25,E11.9,215.00,128.34,86.32,CO-45,Charge exceeds fee schedule,42.02,Dr. Park,11,1234567890,2024-10-15,86.32
            ACC-800002,MRN-90002,VASQUEZ,GABRIELA,1992-03-04,UHC3344556677,United Healthcare,PPO,2024-10-02,11102,,D23.5,165.00,0.00,0.00,CO-197,Authorization absent,0.00,Dr. Lewis,11,1234567890,2024-10-16,0.00
        """)),

        # 9 — Quoted values containing commas
        ("09-quoted-commas.csv", textwrap.dedent('''\
            patient_id,first_name,last_name,dob,member_id,payer,service_date,cpt,billed_amount,denial_code,denial_reason,denied_amount
            PT-9001,DASHIELL,GREGSON-PARK,1981-06-11,BC557788990,"Blue Cross Blue Shield of Massachusetts, Inc.",2024-11-01,99213,145.00,CO-45,"Allowed amount is based on contractual fee schedule, see EOB",58.42
            PT-9002,SVETLANA,VOLKOV,1970-09-28,BC668899001,"Blue Cross Blue Shield of Massachusetts, Inc.",2024-11-03,99204,295.00,CO-50,"Medical necessity not established, additional documentation required",295.00
        '''.strip() + "\n")),

        # 10 — Wide CSV with multiple denial rows per claim (one CAS per row)
        ("10-multiple-denials-per-claim.csv", textwrap.dedent("""\
            patient_id,first_name,last_name,member_id,payer,service_date,cpt,billed_amount,denial_code,denial_reason,denied_amount,received_at
            PT-A001,MILES,DONOVAN,MOL778899001,Molina Healthcare,2024-12-01,99214,215.00,CO-45,Fee schedule,107.50,2024-12-15
            PT-A001,MILES,DONOVAN,MOL778899001,Molina Healthcare,2024-12-01,99214,215.00,PR-1,Deductible,75.00,2024-12-15
            PT-A001,MILES,DONOVAN,MOL778899001,Molina Healthcare,2024-12-01,99214,215.00,PR-2,Coinsurance,16.30,2024-12-15
            PT-A002,RHIANNON,HALL,MOL889900112,Molina Healthcare,2024-12-03,80053,70.00,CO-97,Bundled into E/M,70.00,2024-12-16
        """)),
    ]


# ----- Main ---------------------------------------------------------------

def main() -> None:
    scens = scenarios()
    assert len(scens) == 10, f"expected 10 ERA scenarios, got {len(scens)}"

    short_names = [
        "01-medicare-co45-sequestration",
        "02-aetna-mri-medical-necessity",
        "03-cigna-multi-svc-prior-auth",
        "04-bcbstx-deductible-coinsurance",
        "05-uhc-timely-filing-multi-claim",
        "06-humana-dependent-patient",
        "07-anthem-secondary-prior-payer",
        "08-kaiser-capitation",
        "09-workers-comp-denial",
        "10-molina-mixed-bundle-duplicate",
    ]

    for name, scen in zip(short_names, scens):
        era_text = render_era(scen)

        (HERE / "era" / f"{name}.era").write_text(era_text)
        # .txt variant: same content but flagged as text export. For 2 of the
        # 10 we deliberately drop the `~` terminator to exercise newline-only
        # 835s.
        if name.startswith(("05-", "08-")):
            txt_scen = Era(**{**scen.__dict__, "use_tilde_terminator": False})
            (HERE / "txt" / f"{name}.txt").write_text(render_era(txt_scen))
        else:
            (HERE / "txt" / f"{name}.txt").write_text(era_text)

        render_pdf(era_text, HERE / "pdf" / f"{name}.pdf")

    for csv_name, csv_content in csv_fixtures():
        (HERE / "csv" / csv_name).write_text(csv_content)

    print("Generated fixtures:")
    for sub in ("era", "txt", "pdf", "csv"):
        files = sorted((HERE / sub).iterdir())
        print(f"  {sub}/  ({len(files)} files)")
        for f in files:
            size = f.stat().st_size
            print(f"    {f.name}  ({size} bytes)")


if __name__ == "__main__":
    main()
