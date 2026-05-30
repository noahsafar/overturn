# Pilot agreement — starter draft

> ⚠️ **NOT LEGAL ADVICE. NOT LAWYER-REVIEWED.** Do NOT sign this with a real
> practice until a healthcare-specialized attorney has reviewed both the
> agreement and the accompanying Business Associate Agreement (BAA).
>
> This draft is the conversation-starter you take to the attorney. Saying
> *"here's a 2-page rough — please make it real"* gets you to a final
> document in 1-2 weeks at maybe $1.5-3K. Asking an attorney to draft from
> scratch with no shape gets you a $5-10K bill and 4-6 weeks of back-and-forth.

---

## Overturn Pilot Services Agreement

**This Agreement** is entered into as of **[Effective Date]** between:

- **Service Provider**: Overturn, Inc., a Delaware C-Corporation [or "Noah Safar, sole proprietor" if pre-incorporation], with notice address [your address] ("Overturn")
- **Practice**: [Practice Legal Name], a [state] [entity type], with notice address [their address] ("Practice")

### 1. Services

Overturn will provide an AI-assisted denial-management service ("Services") for the duration of the Pilot Term:

(a) Ingest electronic remittance advices (835 ERA files) from Practice's clearinghouse via SFTP, FTP, or file upload.

(b) For each denied claim, generate a draft appeal letter referencing the payer's published medical policies.

(c) Submit appeals through the appropriate channel (payer portal, eFax, or postal mail) only after written approval by an authorized Practice representative.

(d) Track each submitted appeal's outcome and report recoveries.

### 2. Pilot Term

The Pilot Term begins on **[Start Date]** and runs for **sixty (60) days**. Either party may terminate the Pilot at any time on **seven (7) calendar days written notice** for any reason or no reason.

If neither party terminates by the end of the Pilot Term, this Agreement extends month-to-month at the same terms until either party terminates on 30 days notice.

### 3. Fees

- **Recovery Fee**: Practice shall pay Overturn **twenty-five percent (25%) of dollars actually recovered** from denied claims worked under this Agreement.
- **No other fees**: No setup fee, no monthly minimum, no per-seat fee, no payment due where no recovery occurs.
- **Billing**: Overturn shall issue invoices monthly, itemized per recovered appeal. Practice shall pay each invoice within thirty (30) days of receipt.

### 4. Practice Obligations

Practice shall:

(a) Provide Overturn with read access to its clearinghouse's outbound 835 stream, sufficient to deliver denial ERA files to Overturn within 48 hours of receipt by Practice.

(b) Designate one or more individuals (each, a "Reviewer") with authority to approve appeal drafts.

(c) For the duration of the Pilot, review each appeal draft within five (5) business days of notification.

(d) Provide such payer-portal access credentials and patient-record information as is necessary for Overturn to draft, submit, and follow up on appeals.

### 5. Authorization

Practice represents that all individuals whose patient records are accessed under this Agreement are patients of Practice or its affiliated providers, and that Practice has authority to share such records with Overturn under the Business Associate Agreement (BAA) executed concurrently with this Agreement.

### 6. Business Associate Agreement (BAA)

The parties shall execute the BAA attached as Exhibit A contemporaneously with this Agreement. The BAA governs Overturn's handling of Protected Health Information ("PHI") and is incorporated by reference.

In the event of any conflict between this Agreement and the BAA with respect to PHI, the BAA controls.

### 7. Confidentiality

Each party shall hold the other's Confidential Information in strict confidence and shall not disclose it to any third party without prior written consent. "Confidential Information" includes but is not limited to: PHI, financial information, payer relationships, recovery rates, and the existence and terms of this Agreement.

### 8. Intellectual Property

(a) Overturn retains all right, title, and interest in the Services and any software, models, prompts, or tooling used to provide them.

(b) Practice retains all right, title, and interest in patient records, claim data, and any data derived from such records.

(c) Overturn shall not use PHI to train or fine-tune any machine-learning model, and shall ensure that PHI is processed only under the BAA and with vendors who have executed a BAA with Overturn.

### 9. Limitation of Liability

To the maximum extent permitted by law, Overturn's aggregate liability under this Agreement shall not exceed the greater of (i) recovery fees actually received by Overturn under this Agreement, or (ii) one thousand dollars ($1,000).

Neither party shall be liable to the other for any indirect, incidental, consequential, special, or punitive damages, regardless of legal theory.

> ⚠️ **Attorney note**: limitation of liability is a hotly contested clause.
> Practice's attorney will push back hard on a $1K cap. The realistic
> negotiation lands at "fees paid in the preceding 12 months." Plan for it.

### 10. Termination

(a) Either party may terminate this Agreement on seven (7) calendar days notice during the Pilot Term, as set out in Section 2.

(b) Either party may terminate immediately on material breach if not cured within 30 days of written notice.

(c) Upon termination, Overturn shall (i) stop submitting new appeals; (ii) deliver to Practice a final report of work in flight; (iii) destroy or return all PHI per the BAA's deletion provisions.

### 11. Governing Law

This Agreement shall be governed by the laws of the State of **[Delaware / Connecticut — discuss with attorney]**, without regard to its conflict-of-laws principles. Disputes shall be resolved by binding arbitration in **[city, state]** under the rules of the American Arbitration Association.

### 12. Entire Agreement

This Agreement, together with the BAA at Exhibit A, constitutes the entire agreement between the parties with respect to its subject matter. It supersedes all prior agreements and may be amended only by a writing signed by both parties.

---

**Practice**:                                          **Overturn**:

By: ________________________                          By: ________________________
Name: ______________________                          Name: ______________________
Title: ______________________                         Title: ______________________
Date: ______________________                          Date: ______________________

---

## Exhibit A — Business Associate Agreement

> ⚠️ Do not draft the BAA yourself. Use HHS's model BAA template
> (publicly available at <https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html>)
> as the starting point and have your healthcare attorney customize. The BAA
> is where 80% of HIPAA risk is concentrated — don't shortcut it.

---

## What to do with this draft

1. **Read it once carefully.** Does anything make you uncomfortable? Flag it.
2. **Find a healthcare-specialized attorney.** Some options:
   - **Yale Ventures legal clinic**, if available to student founders. Free or steeply discounted.
   - **Cooley Foundry program** for early-stage healthcare startups (free 1-hour consults).
   - **Atrium / Outside Counsel** services advertised on HN / YC Bookface.
   - For CT-specific: **CT Innovations** sometimes refers in-state attorneys for portfolio + adjacent companies.
3. **Hand them this draft** and say: *"I'm a Yale student founding a healthcare RCM startup. Here's the draft I want to send to a pilot prospect. Can you review + write a proper BAA to go with it? Quoted flat fee preferred."*
4. **Budget**: $1.5-3K for review + BAA drafting. If anyone quotes more, get a second opinion.
5. **Timeline**: 2 weeks from "yes, let's pilot" to a signed agreement is reasonable. Less, and you're rushing the legal review.

## Things this draft deliberately doesn't include yet

- Specific insurance requirements (E&O, cyber). Add once you have a quote.
- Detailed performance SLAs (response times, win-rate targets). Premature — let the pilot itself produce the data.
- Detailed data-deletion schedule. The BAA handles it.
- IP carve-outs around aggregated/anonymized data. Worth discussing with attorney.
- Audit rights for the practice. Standard but adds pages — leave for v2.
