# User-Friendly Error Messaging Guide

This document describes the improved error messaging system for non-technical users.

## Philosophy

Error messages should be:
- **Clear and jargon-free**: No technical terms users won't understand
- **Actionable**: Tell users what they can do next
- **Contextual**: Specific to the situation, not generic
- **Empowering**: Help users solve problems independently when possible

## Error Message Components

### 1. ErrorDisplay Component

Reusable component for displaying user-friendly errors:

```tsx
import { ErrorDisplay } from "@/components/ErrorDisplay";

<ErrorDisplay
  title="Upload Failed"
  message="We couldn't process your CSV file. Please check the format and try again."
  action="Ensure your file is CSV format and under 10MB"
  showContactSupport={true}
  onRetry={() => window.location.reload()}
/>
```

### 2. FieldError Component

For inline form validation errors:

```tsx
import { FieldError } from "@/components/ErrorDisplay";

<FieldError message="Please enter a valid email address" />
```

### 3. Loading Component

For loading states with helpful messages:

```tsx
import { Loading } from "@/components/ErrorDisplay";

<Loading message="Uploading your claims..." />
```

### 4. EmptyState Component

For when there's no data to display:

```tsx
import { EmptyState } from "@/components/ErrorDisplay";

<EmptyState
  title="No denials yet"
  message="Upload your first ERA file to get started with appeals."
  action={{ label: "Upload Claims", onClick: handleUpload }}
/>
```

## Error Contexts

### Authentication Errors

**Old:**
```
401 Unauthorized
```

**New:**
```json
{
  "title": "Session Expired",
  "message": "Your session has expired. Please sign in again to continue.",
  "action": "Refresh the page to sign in"
}
```

### File Upload Errors

**Old:**
```
413 Payload Too Large
```

**New:**
```json
{
  "title": "File Too Large",
  "message": "The file you're trying to upload is too large.",
  "action": "Try uploading a smaller file (max 10MB)"
}
```

### Appeal Submission Errors

**Old:**
```
500 Internal Server Error
```

**New:**
```json
{
  "title": "Appeal Submission Failed",
  "message": "We encountered an issue submitting your appeal. The appeal has been saved and can be retried.",
  "action": "Try submitting again from the appeals page.",
  "showContactSupport": true
}
```

### Validation Errors

**Old:**
```
400 Bad Request - validation failed
```

**New:**
```json
{
  "title": "Invalid Information",
  "message": "Practice name is required",
  "action": "Please fill in the required field"
}
```

## Implementation Guide

### 1. Use ErrorDisplay for page-level errors

```tsx
// apps/web/src/app/error.tsx
import { ErrorDisplay } from "@/components/ErrorDisplay";

export default function Error({ error }: { error: Error }) {
  const userError = toUserFriendlyError(error);

  return (
    <ErrorDisplay
      title={userError.title}
      message={userError.message}
      action={userError.action}
      showContactSupport={userError.contactSupport}
      onRetry={() => window.location.reload()}
    />
  );
}
```

### 2. Use FieldError for form validation

```tsx
// apps/web/src/app/onboarding/OnboardingWizard.tsx
import { FieldError } from "@/components/ErrorDisplay";

{errors.name && <FieldError message="Practice name is required" />}
```

### 3. Use apiHandlerV2 for API routes

```tsx
// apps/web/src/app/api/example/route.ts
import { apiHandlerV2 } from "@/lib/api-v2";

export const POST = apiHandlerV2(
  {
    bodySchema: ClaimSchema,
    errorContext: "file_upload",
  },
  async ({ body }) => {
    // Your handler logic
  }
);
```

## Common Error Scenarios

### 1. Network Errors

**Scenario:** User loses internet connection

```json
{
  "title": "Connection Lost",
  "message": "We couldn't complete your request due to a network issue. Please check your connection and try again.",
  "action": "Check your internet connection and try again"
}
```

### 2. Rate Limiting

**Scenario:** User makes too many requests

```json
{
  "title": "Too Many Requests",
  "message": "You've made several requests recently. Please wait a moment before trying again.",
  "action": "Wait a few seconds and try again",
  "retryAfterMs": 5000
}
```

### 3. Database Errors

**Scenario:** Database connection fails

```json
{
  "title": "Service Temporarily Unavailable",
  "message": "We're experiencing technical difficulties. Please try again in a moment.",
  "action": "Wait a moment and try again",
  "showContactSupport": true
}
```

### 4. Payer Portal Errors

**Scenario:** Payer portal submission fails

```json
{
  "title": "Payer Portal Access Issue",
  "message": "We're having trouble accessing the payer portal. Your credentials may need to be updated.",
  "action": "Check your payer portal credentials in Settings or contact support for assistance.",
  "showContactSupport": true
}
```

## Testing Error Messages

### Unit Tests

```typescript
// apps/web/src/lib/errors.test.ts
import { toUserFriendlyError, fromZodError } from "./errors";

describe("Error messaging", () => {
  test("converts 401 to session expired", () => {
    const error = toUserFriendlyError(new Error("401 Unauthorized"), "authentication");
    expect(error.title).toBe("Session Expired");
    expect(error.action).toContain("Refresh");
  });

  test("formats Zod errors user-friendly", () => {
    const zodError = new ZodError([
      {
        code: "too_small",
        path: ["name"],
        message: "String must contain at least 3 character(s)",
      },
    ]);

    const userError = fromZodError(zodError, "Practice Name");
    expect(userError.message).toContain("Practice name");
    expect(userError.action).toContain("correct");
  });
});
```

### User Testing

When testing error messages with users:
1. **Show them the error message** (without technical context)
2. **Ask what they think happened**
3. **Ask what they would do next**
4. **Measure if their action matches our suggestion**

## Best Practices

### DO:
- Use plain language free of jargon
- Be specific about what went wrong
- Provide clear next steps
- Offer help contacting support when appropriate
- Keep messages concise (under 150 characters for the main message)
- Test messages with real users

### DON'T:
- Blame the user ("You entered invalid data")
- Use technical terms ("404", "database error", "API failure")
- Provide generic messages ("Something went wrong")
- Show raw error messages to users
- Overwhelm with too much information

## Support Contact Information

Configure in environment variables:

```bash
NEXT_PUBLIC_SUPPORT_PHONE="1-800-OVERTURN"
NEXT_PUBLIC_SUPPORT_HOURS="Mon-Fri 8am-8pm ET"
```

## Related Documentation

- [Operations Runbooks](ops/runbooks.md)
- [API Reference](../lib/api-v2.ts)
- [Component Library](../components/ErrorDisplay.tsx)
