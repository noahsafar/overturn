# Medicare (CMS) — Provider Appeals Runbook
Per-payer playbook for Medicare/CMS portal appeals.

## Portal

- URL: (varies - typically https://www.cms.gov or regional MAC portal)
- Login type: username + password + verification
- Session length: varies by portal
- Stagehand submitter: `apps/worker/browser/payers/medicare.ts`

## Appeal channels (in priority order)

1. **Portal** — varies by MAC (Medicare Administrative Contractor)
2. **Fax** — varies by MAC
3. **Mail** — varies by MAC

## Common denial codes

| Code   | Stated reason                     | Standard counter-argument                                              |
|--------|-----------------------------------|------------------------------------------------------------------------------|
| CO-50  | Not deemed a medical necessity      | Cite Medicare coverage guidelines + clinical documentation           |
| CO-22  | This is not a payable expense       | Medicare benefit provisions + medical necessity                     |
| CO-108 | Claim not covered by this plan      | Medicare coverage criteria + supporting documentation                |
| CO-107 | The service is not covered          | Local Coverage Determination (LCD) + supporting documentation          |
| CO-197 | Precertification/authorization absent| Authorization tracking + emergency exceptions                   |

## Filing deadlines

- Initial claim: 12 months from date of service (some exceptions apply)
- Appeal: 120 days from Initial Determination
- Reconsideration: 180 days from appeal decision
- ALJ hearing: 60 days from reconsideration denial

## Medicare-specific considerations

### Portal Navigation
- Medicare uses MAC (Medicare Administrative Contractor) portals
- Navigation varies significantly by MAC
- Different MACs have different appeal processes

### Appeal Requirements
- Medicare has formal 5-level appeal process:
  1. Redetermination
  2. Reconsideration
  3. ALJ Hearing
  4. Medicare Appeals Council Review
  5. Judicial Review in federal court
- Each level has specific requirements and deadlines
- Documentation requirements are very strict

### Common Issues
1. **MAC variability**: Different MACs have different portals
2. **Strict deadlines**: Medicare deadlines are strictly enforced
3. **Form requirements**: Very specific forms for each appeal level
4. **Documentation**: Medicare requires comprehensive documentation

## Testing

```bash
# Test Medicare submitter locally
cd apps/worker/browser
STAGEHAND_ENV=LOCAL HEADED=true \
  npx exec stagehand-submit \
  --appeal-id <test_appeal_id> \
  --payer medicare
```

## Troubleshooting

### MAC portal differences
- Identify which MAC the claim belongs to
- Use the correct portal for that MAC
- Some MACs require separate registration

### Appeal level selection
- Ensure correct appeal level selected
- Different forms for different levels
- Strict deadline compliance required

### Documentation requirements
- Medicare requires very specific documentation
- Local Coverage Determinations (LCDs) must be referenced
- National Coverage Determinations (NCDs) may apply

## Notes

- Medicare appeals process is more formal than commercial payers
- Response times vary by level and MAC
- Strict deadline compliance is critical
- Consider legal representation for higher appeal levels

## Related Documentation

- [Main Payer README](./README.md)
- [Operations Runbooks](../../../docs/ops/runbooks.md)
- [Medicare Appeals Process](https://www.cms.gov/Medicare/Billing/Appeals-and-Grievances)