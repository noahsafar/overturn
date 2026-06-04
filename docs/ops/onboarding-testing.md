# Onboarding Flow Testing & Validation

## Overview

The onboarding flow allows new practices to complete their setup before using Overturn. This document describes the onboarding process and how to test it.

## Onboarding Steps

The onboarding wizard consists of 4 steps:

1. **Practice Info** - Practice name
2. **Billing** - Billing email and recovery fee percentage
3. **Invite Team** - Option to invite team members (can be skipped)
4. **Review** - Confirm details and complete onboarding

## Technical Implementation

### Components
- `apps/web/src/app/onboarding/page.tsx` - Onboarding page server component
- `apps/web/src/app/onboarding/OnboardingWizard.tsx` - Client-side wizard component
- `apps/web/src/app/api/practice/route.ts` - PATCH endpoint for updating practice

### Flow
1. User navigates to `/onboarding`
2. Server component checks if onboarding is complete, redirects if done
3. Client-side wizard renders with current practice data
4. Each step saves progress via `/api/practice` PATCH
5. Final step sets `onboardingCompletedAt` timestamp
6. User is redirected to `/dashboard`

### Access Control
- Requires authenticated user
- Requires ADMIN or OWNER role to update practice
- Un-onboarded users are forced into onboarding via middleware
- Onboarding completion is tracked via `Practice.onboardingCompletedAt`

## Testing Checklist

### Manual Testing

**Preconditions:**
- Database is running (`docker compose up`)
- Web app is running (`pnpm dev`)
- User exists with ADMIN/OWNER role
- `Practice.onboardingCompletedAt` is NULL

**Test Steps:**

1. **Access Onboarding**
   - Log in as admin user
   - Navigate to `/onboarding`
   - Verify wizard loads with current practice data

2. **Step 1: Practice Info**
   - Verify practice name is pre-populated
   - Modify practice name
   - Click "Continue"
   - Verify data is saved (check database)

3. **Step 2: Billing**
   - Verify billing email field exists
   - Verify recovery fee field exists (should show 25% as 2500 bps)
   - Enter test billing email
   - Modify recovery fee
   - Click "Continue"
   - Verify data is saved

4. **Step 3: Invite Team**
   - Verify option to skip exists
   - Verify link to Members settings exists
   - Click "Continue" (skip this step)

5. **Step 4: Review**
   - Verify all entered data is displayed correctly
   - Verify practice name matches Step 1
   - Verify billing email matches Step 2
   - Verify recovery fee matches Step 2
   - Click "Finish setup"
   - Verify redirect to `/dashboard`

6. **Post-Onboarding**
   - Verify `Practice.onboardingCompletedAt` is set
   - Verify user can access dashboard
   - Verify user can access other app features
   - Verify onboarding gate no longer redirects

### Database Verification

```sql
-- Check onboarding status
SELECT
    name,
    billingEmail,
    recoveryFeeBps,
    onboardingCompletedAt
FROM Practice
WHERE id = '<practice_id>';

-- Verify onboarding completion
SELECT onboardingCompletedAt IS NOT NULL AS is_onboarded
FROM Practice
WHERE id = '<practice_id>';
```

### API Testing

**Test PATCH /api/practice**

```bash
# Update practice name
curl -X PATCH http://localhost:3000/api/practice \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Practice Name"}'

# Update billing email
curl -X PATCH http://localhost:3000/api/practice \
  -H "Content-Type: application/json" \
  -d '{"billingEmail": "billing@example.com"}'

# Update recovery fee
curl -X PATCH http://localhost:3000/api/practice \
  -H "Content-Type: application/json" \
  -d '{"recoveryFeeBps": 3000}'

# Complete onboarding
curl -X PATCH http://localhost:3000/api/practice \
  -H "Content-Type: application/json" \
  -d '{"completeOnboarding": true}'
```

## Edge Cases & Error Handling

### Test Cases

1. **Empty practice name**
   - Try to submit empty name
   - Verify validation error

2. **Invalid billing email**
   - Try to submit invalid email
   - Verify validation error

3. **Invalid recovery fee**
   - Try negative values
   - Try values > 100%
   - Verify validation errors

4. **Unauthorized access**
   - Try to access as STAFF role
   - Verify 403 error

5. **Concurrent updates**
   - Multiple users updating same practice
   - Verify last write wins

6. **Network errors**
   - Simulate network failure during save
   - Verify error handling and retry

## Known Issues & Limitations

1. **No progress persistence**
   - If user refreshes mid-onboarding, progress is saved but user stays on current step
   - Consider adding step resumption in future versions

2. **Limited validation**
   - Email format validation only
   - No practice name uniqueness check
   - No billing email domain validation

3. **No undo for completion**
   - Once onboarding is complete, cannot reset
   - Admin must manually update database to re-enable

## Future Improvements

1. **Add more onboarding steps**
   - Payer credentials setup
   - First denial upload walkthrough
   - Team member invitation flow

2. **Better validation**
   - Real-time email validation
   - Practice name availability check
   - Billing email verification

3. **Progress persistence**
   - Allow users to resume where they left off
   - Show completion progress indicator

4. **Skip onboarding for test users**
   - Admin flag to auto-complete onboarding
   - API endpoint for programmatic onboarding

## Related Documentation

- [API Reference](../../api/practice/route.ts)
- [Authentication](../../../lib/auth.ts)
- [Operations Runbooks](../runbooks.md)
