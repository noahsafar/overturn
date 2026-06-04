# Cigna — Provider Appeals Runbook
Per-payer playbook for Cigna portal appeals.

## Portal

- URL: (typically https://www.cignaforproviders.com)
- Login type: username + password + verification
- Session length: 30 minutes idle
- Stagehand submitter: `apps/worker/browser/payers/cigna.ts`

## Appeal channels (in priority order)

1. **Portal** — fastest turnaround, confirmation number issued
2. **Fax** — varies by region
3. **Mail** — varies by region

## Common denial codes

| Code   | Stated reason                     | Standard counter-argument                                |
|--------|-----------------------------------|--------------------------------------------------------|
| CO-50  | Not deemed a medical necessity      | Cite Cigna medical policy + clinical necessity             |
| CO-22  | This is not a payable expense       | Contract provisions + medical necessity                  |
| CO-108 | Claim not covered by this plan      | Policy exceptions + supporting documentation            |
| CO-107 | The service is not covered          | Policy provisions + clinical documentation               |
| CO-197 | Precertification/authorization absent| Authorization tracking + emergency exceptions           |

## Filing deadlines

- Initial claim: 365 days from date of service
- Appeal: 180 days from remittance date
- Second-level appeal: varies by plan

## Cigna-specific considerations

### Portal Navigation
- Path: Provider Portal → Claims → Appeals/Reviews
- Cigna uses "Request Review" terminology
- Can track appeal status online

### Appeal Requirements
- Cigna emphasizes documentation completeness
- Requires specific appeal reason categorization
- Medical records should be recent and relevant

### Common Issues
1. **Form terminology**: Uses "Request Review" instead of "File Appeal"
2. **Documentation uploads**: Must attach all supporting docs
3. **Claim status tracking**: Real-time status available online
4. **Multiple appeals**: Can track multiple appeals per claim

## Notes

- Cigna has relatively good online tracking
- Response time typically 30-45 days
- Offers phone follow-up option in addition to portal
- Documentation quality heavily influences outcome

## Related Documentation

- [Main Payer README](./README.md)
- [Operations Runbooks](../../../docs/ops/runbooks.md)