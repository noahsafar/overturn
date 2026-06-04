# Humana — Provider Appeals Runbook
Per-payer playbook for Humana portal appeals.

## Portal

- URL: (typically https://www.humana-provider.com)
- Login type: username + password + security questions
- Session length: 30 minutes idle
- Stagehand submitter: `apps/worker/browser/payers/humana.ts`

## Appeal channels (in priority order)

1. **Portal** — fastest turnaround, confirmation number issued
2. **Fax** — varies by region
3. **Mail** — varies by region

## Common denial codes

| Code   | Stated reason                     | Standard counter-argument                                    |
|--------|-----------------------------------|----------------------------------------------------------------|
| CO-50  | Not deemed a medical necessity      | Cite Humana medical policy + documented clinical necessity    |
| CO-22  | This is not a payable expense       | Contract provisions + medical necessity                     |
| CO-108 | Claim not covered by this plan      | Policy exceptions + supporting documentation                |
| CO-107 | The service is not covered          | Policy provisions + clinical documentation                 |
| CO-197 | Precertification/authorization absent| Authorization tracking + emergency exceptions             |

## Filing deadlines

- Initial claim: 365 days from date of service
- Appeal: 180 days from remittance date
- Second-level appeal: varies by plan

## Humana-specific considerations

### Portal Navigation
- Path: Claims → Claim Management → Appeals/Disagreements
- Humana uses "Appeal" and "Disagreement" terminology
- Good online claim tracking capabilities

### Appeal Requirements
- Humana requires detailed appeal rationales
- Must categorize disagreement type
- Supporting documentation required

### Common Issues
1. **Security questions**: May require security question answers
2. **Appeal vs disagreement**: Different terminology for different situations
3. **Document uploads**: Must attach all supporting documentation
4. **Multiple appeals**: Can file multiple levels of appeal

## Notes

- Humana has relatively efficient online processing
- Response time typically 30-60 days
- Offers phone support for appeal status
- Good documentation system for tracking appeals

## Related Documentation

- [Main Payer README](./README.md)
- [Operations Runbooks](../../../docs/ops/runbooks.md)