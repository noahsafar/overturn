# Aetna — Provider Appeals Runbook

Per-payer playbook for Aetna portal appeals.

## Portal

- URL: (typically https://www.aetnaprovider.com)
- Login type: username + password + verification
- Session length: 30 minutes idle
- Stagehand submitter: `apps/worker/browser/payers/aetna.ts`

## Appeal channels (in priority order)

1. **Portal** — fastest turnaround, confirmation number issued
2. **Fax** — varies by region (check portal for specific number)
3. **Mail** — varies by region (check portal for address)

## Common denial codes

| Code   | Stated reason                     | Standard counter-argument                                 |
|--------|-----------------------------------|---------------------------------------------------------|
| CO-50  | Not deemed a medical necessity      | Cite Aetna clinical policy + documented necessity           |
| CO-22  | This is not a payable expense       | Cite contract provisions + medical necessity                |
| CO-108 | Claim not covered by this plan      | Demonstrate policy exception + supporting documentation    |
| CO-107 | The service is not covered          | Cite specific policy provisions + appeal documentation     |
| CO-197 | Precertification/authorization absent| Cite authorization tracking + emergency exceptions       |

## Filing deadlines

- Initial claim: 365 days from date of service
- Appeal: 180 days from remittance date
- Second-level appeal: 60 days from first appeal denial

## Aetna-specific considerations

### Portal Navigation
- Aetna's portal uses "Claims" → "Claim Status" → "Appeals/Disputes"
- Appeal types: Standard appeal, Grievance, Arbitration
- Different appeal types have different forms

### Appeal Requirements
- Aetna requires specific appeal category selection
- Must categorize appeal by type (clinical, administrative, contractual)
- Supporting documentation strongly recommended

### Common Issues
1. **Appeal type selection**: Must choose correct appeal category
2. **Form validation**: Strong validation on form fields
3. **Document attachments**: PDF format preferred
4. **Multiple claim IDs**: Can bundle related claims in single appeal

## Testing

```bash
# Test Aetna submitter locally
cd apps/worker/browser
STAGEHAND_ENV=LOCAL HEADED=true \
  npx exec stagehand-submit \
  --appeal-id <test_appeal_id> \
  --payer aetna
```

## Troubleshooting

### Appeal type confusion
- Ensure correct appeal category selected
- Different forms for standard appeals vs grievances
- Check if arbitration route required

### Documentation requirements
- Aetna requires comprehensive medical records
- Clinical notes must be recent and relevant
- Office notes required for procedure appeals

## Notes

- Aetna has stricter documentation requirements than many payers
- Response time typically 30-60 days
- Expedited appeals available for urgent care situations
- Multiple Aetna product lines may have different requirements

## Related Documentation

- [Main Payer README](./README.md)
- [Operations Runbooks](../../../docs/ops/runbooks.md)
