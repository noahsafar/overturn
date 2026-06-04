# UnitedHealthcare (UHC) — Provider Appeals Runbook

Per-payer playbook for UHC portal appeals.

## Portal

- URL: (varies by practice - typically https://www.uhconline.com)
- Login type: username + password + optional MFA
- Session length: 30 minutes idle
- Stagehand submitter: `apps/worker/browser/payers/uhc.ts`

## Appeal channels (in priority order)

1. **Portal** — fastest turnaround, confirmation number issued
2. **Fax** — `+1-800-555-0199` (varies by region)
3. **Mail** — varies by region (check payer portal for address)

## Common denial codes

| Code   | Stated reason                     | Standard counter-argument                                     |
|--------|-----------------------------------|---------------------------------------------------------------|
| CO-50  | Not deemed a medical necessity      | Cite UHC medical policy + documented clinical necessity        |
| CO-22  | This is not a payable expense       | Cite contract provisions + medical necessity                 |
| CO-96  | Non-covered diagnosis               | Demonstrate medical necessity + supporting documentation       |
| CO-107 | The service is not covered          | Cite policy exceptions + appeal with additional documentation |
| CO-197 | Precertification/authorization absent| Cite emergency or authorization exceptions                  |

## Filing deadlines

- Initial claim: 365 days from date of service
- Appeal: 180 days from remittance date
- Second-level appeal: 60 days from first appeal denial

## UHC-specific considerations

### Portal Navigation
- UHC's provider portal has different layouts depending on the practice type
- Navigation path: Claims → Claim Management → Appeals
- Some regions use different portal URLs

### Appeal Requirements
- UHC requires specific appeal form formatting
- Supporting medical records must be attached
- Appeal must reference specific UHC medical policy sections

### Common Issues
1. **MFA requirements**: Some accounts require additional verification
2. **Form timeout**: Appeal forms expire after 15 minutes of inactivity
3. **Document size limits**: Supporting docs limited to 10MB each
4. **Regional variations**: Different UHC regions may have different portals

## Testing

```bash
# Test UHC submitter locally
cd apps/worker/browser
STAGEHAND_ENV=LOCAL HEADED=true \
  npx exec stagehand-submit \
  --appeal-id <test_appeal_id> \
  --payer uhc
```

## Troubleshooting

### Login fails
- Verify credentials are current
- Check if account requires MFA setup
- Verify portal URL is correct for your region

### Appeal submission fails
- Verify claim number exists in system
- Check if claim is already appealed
- Verify appeal deadline hasn't passed
- Check required fields are completed

### Document upload fails
- Verify file format (PDF required)
- Check file size under 10MB limit
- Ensure document contains required information

## Notes

- UHC is more strict about medical necessity documentation than other payers
- Response time typically 30-45 days for standard appeals
- Expedited appeals available for urgent medical needs
- Multiple UHC regional plans may require different portal URLs

## Related Documentation

- [Main Payer README](./README.md)
- [Operations Runbooks](../../../docs/ops/runbooks.md)
- [UHC Medical Policies](https://www.uhcprovider.com/content/uhc/en/our+plans+and+programs+policies/medical+policies.html)
