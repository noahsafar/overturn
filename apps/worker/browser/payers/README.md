# Payer Portal Automation

This directory contains per-payer portal submitters for automated appeal submission.

## Supported Payers

| Payer | File | Status | Notes |
|-------|------|--------|-------|
| BCBS | `bcbs.ts` | ✅ Production | Blue Cross Blue Shield (multiple regional plans) |
| UHC | `uhc.ts` | ✅ Production | UnitedHealthcare |
| Aetna | `aetna.ts` | ✅ Production | Aetna |
| Cigna | `cigna.ts` | ✅ Production | Cigna |
| Humana | `humana.ts` | ✅ Production | Humana |
| Medicare | `medicare.ts` | ✅ Production | Medicare/CMS |

## Adding a New Payer

### 1. Create the payer file

Create a new file `payers/<payer-slug>.ts` following the template below:

```typescript
// <Payer Name> portal submitter.
//
// Supports <Payer Name> provider portal for claim appeals.
// Uses deterministic Playwright selectors with Stagehand fallback.

import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SubmitInput, SubmitResult } from "../types.js";

interface RunCtx {
  auditDir: string;
  env: "BROWSERBASE" | "LOCAL" | "FAKE";
}

const LOGIN_TIMEOUT_MS = 30_000;

// <Payer Name> portal selectors
const SEL = {
  usernameField: 'input[name="username"]',
  passwordField: 'input[name="password"]',
  // ... more selectors
};

export async function submitTo<PayerSlug>(input: SubmitInput, ctx: RunCtx): Promise<SubmitResult> {
  // Implementation following the pattern in bcbs.ts
}
```

### 2. Define selectors

Inspect the payer's portal and define selectors for:
- Login fields (username, password, login button)
- Navigation links (claims, appeals)
- Search/input fields (claim number)
- Action buttons (file appeal, submit)
- Form fields (appeal reason, narrative textarea)
- Confirmation elements

### 3. Test locally

```bash
# Set STAGEHAND_ENV=LOCAL for headed testing
STAGEHAND_ENV=LOCAL node stagehand-submit <appeal_id>
```

### 4. Test in staging

```bash
# Deploy to staging
./scripts/deploy-staging.sh

# Test via ops console
# Trigger appeal submission with staging credentials
```

### 5. Document in runbook

Add payer-specific notes to `docs/payer-runbooks/<payer-slug>.md`

## Selector Best Practices

### 1. Prefer specific selectors

```typescript
// Good: specific, stable
'select[name="appealReason"]'
'input[type="email"]'

// Avoid: too generic
'input:first-child'
'div > div > input'
```

### 2. Handle multiple selector options

```typescript
// Multiple possible selectors
'input[name="username"], input#userId, input[type="email"]'
```

### 3. Use aria labels and test IDs when available

```typescript
'button[aria-label="Submit Appeal"]'
'data-testid="submit-button"]'
```

### 4. Always provide Stagehand fallback

```typescript
try {
  await page.locator(SEL.specificSelector).first().click();
} catch {
  await page.act("click the submit button");
}
```

## Testing Portal Submitters

### Manual Testing

```bash
# Navigate to browser directory
cd apps/worker/browser

# Run Stagehand directly with headed mode
HEADED=true STAGEHAND_ENV=LOCAL \
  npx exec stagehand-submit \
  --appeal-id <test_appeal_id> \
  --payer <payer_slug>
```

### Automated Testing

```bash
# Run payer-specific tests
pnpm test payer-<payer-slug>

# Run all payer tests
pnpm test payers
```

### Debugging Failed Submissions

1. **Check audit screenshots**: `apps/worker/artifacts/audit-screenshots/<appeal_id>/`
2. **Review Stagehand logs**: Check browser console and network tab
3. **Test selectors manually**: Use browser DevTools to verify selectors
4. **Check for UI changes**: Payer portals frequently update their UI

## Common Issues

### 1. Selectors changed after portal update

**Symptoms**: Submission fails at a specific step with "element not found"

**Resolution**:
1. Log into portal manually
2. Inspect the updated UI
3. Update selectors in the payer file
4. Test locally, then deploy

### 2. MFA requirements

**Symptoms**: Submission fails at login step

**Resolution**:
1. Ensure MFA secret is stored in PayerCredential
2. Update MFA handling in submitter
3. Consider using application-specific passwords if available

### 3. Session timeouts

**Symptoms**: Submission fails with "session expired"

**Resolution**:
1. Adjust timeouts in the submitter
2. Add session refresh logic
3. Handle re-authentication gracefully

### 4. Dynamic content

**Symptoms**: Intermittent failures due to slow-loading elements

**Resolution**:
1. Increase wait times for specific steps
2. Use explicit waits for networkidle
3. Add retry logic for transient failures

## Portal Monitoring

### Success Rate Tracking

Monitor submission success rates per payer:

```sql
SELECT
  p.name AS payer,
  COUNT(s.id) AS total_submissions,
  SUM(CASE WHEN s.status = 'SUCCESS' THEN 1 ELSE 0 END) AS successful,
  SUM(CASE WHEN s.status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
  ROUND(100.0 * SUM(CASE WHEN s.status = 'SUCCESS' THEN 1 ELSE 0 END) / COUNT(s.id), 2) AS success_rate
FROM Submission s
JOIN Appeal a ON s.appealId = a.id
JOIN Denial d ON a.denialId = d.id
JOIN Claim c ON d.claimId = c.id
JOIN Payer p ON c.payerId = p.id
WHERE s.createdAt > NOW() - INTERVAL '7 days'
GROUP BY p.name
ORDER BY success_rate DESC;
```

### Alert on High Failure Rates

Set up alerts when a payer's failure rate exceeds 15% for more than 1 hour.

## Maintenance Schedule

### Weekly
- Test each payer submitter in staging
- Review audit screenshots for any anomalies
- Check for portal UI updates

### Monthly
- Update selectors for any changed portals
- Review submission success rates
- Optimize slow workflows

### Quarterly
- Credential rotation for all payer portals
- Comprehensive testing of all submitters
- Update documentation with any portal changes

## Security Considerations

### Credentials Storage
- All credentials encrypted at rest using AES-256-GCM
- Credentials stored in `PayerCredential` table
- Decryption only happens in memory during submission

### Audit Trail
- All submissions create audit screenshots
- Every submission logged to `AuditEvent` table
- Screenshots stored in object-locked S3 bucket

### Access Control
- Only ADMIN/OWNER roles can manage credentials
- All credential changes require re-authentication
- Audit log of all credential access

## Related Documentation

- [Operations Runbooks](../../../docs/ops/runbooks.md#browser-automation-issues)
- [Payer Runbooks](../../../docs/payer-runbooks/)
- [Production Wiring](../../../docs/production-wiring.md)
