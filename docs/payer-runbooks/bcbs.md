# BCBS — Provider Appeals Runbook

Per-payer playbook. Edit each section as you learn the specifics for a
given BCBS regional plan. Each regional plan (Anthem, Highmark, Independence,
Blue Shield of CA, etc.) gets its own file once it diverges enough to need
one.

## Portal

- URL: (TBD — pilot customer provides credentials)
- Login type: username + password + MFA
- Session length: 30 minutes idle
- Stagehand submitter: `apps/worker/browser/payers/bcbs.ts`

## Appeal channels (in priority order)

1. **Portal** — fastest turnaround, confirmation number issued in-session
2. **Fax** — `+1-800-555-0199` (synthetic; replace with real)
3. **Mail** — PO Box 9999, Anywhere ST 00000 (synthetic)

## Common denial codes

| Code   | Stated reason                       | Standard counter-argument                                                  |
|--------|-------------------------------------|----------------------------------------------------------------------------|
| CO-50  | Not deemed a medical necessity      | Cite MP-2024-50 §3.1 + documented DSM-5 dx + treatment plan goals          |
| CO-197 | Precert/authorization absent        | Cite MP-2024-197 emergency / clearinghouse-error / standing-auth exception |
| CO-29  | Time limit for filing has expired   | Cite TF-2024-01 + provide clearinghouse acknowledgement of original submit |

## Filing deadlines

- Initial claim: 365 days from date of service
- Appeal: 180 days from remittance date
- Second-level appeal: 60 days from first appeal denial

## Notes

- Section-4.2 documentation standards are the single most reusable hook
  for CO-50 appeals. Every progress note that documents (i) the
  intervention, (ii) the member response, and (iii) the clinical
  reasoning is presumptively sufficient.
