/**
 * User-friendly error message utilities
 *
 * Converts technical errors into clear, actionable messages for non-technical users.
 * Provides helpful guidance and next steps for common error scenarios.
 */

export type ErrorContext =
  | "authentication"
  | "authorization"
  | "validation"
  | "network"
  | "database"
  | "file_upload"
  | "appeal_submission"
  | "claim_processing"
  | "payer_credentials"
  | "invitation"
  | "practice"
  | "denial"
  | "appeal"
  | "unknown";

export interface UserFriendlyError {
  title: string; // User-facing title
  message: string; // Clear, non-technical explanation
  action?: string; // Suggested action the user can take
  contactSupport?: boolean; // Whether to suggest contacting support
  details?: string; // Technical details for support (not shown to users by default)
}

/**
 * Convert any error into a user-friendly message
 */
export function toUserFriendlyError(error: unknown, context: ErrorContext = "unknown"): UserFriendlyError {
  // If already a UserFriendlyError, return as-is
  if (isUserFriendlyError(error)) {
    return error;
  }

  // If it's a standard Error, extract the message
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Handle common error patterns
  if (errorMessage.includes("ENOTFOUND")) {
    return {
      title: "Service Unavailable",
      message: "We couldn't connect to one of our services. Please check your internet connection and try again.",
      action: "Refresh the page or check your internet connection",
      contactSupport: true,
    };
  }

  if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("timeout")) {
    return {
      title: "Request Timed Out",
      message: "This request is taking longer than expected. The service might be busy or your connection might be slow.",
      action: "Try again in a moment. If the problem persists, please contact support.",
      contactSupport: false,
    };
  }

  if (errorMessage.includes("ECONNREFUSED")) {
    return {
      title: "Connection Failed",
      message: "We couldn't establish a connection to our servers. Please check your internet connection.",
      action: "Verify your internet connection and try again",
      contactSupport: true,
    };
  }

  if (errorMessage.includes("401") || errorMessage.includes("403") || errorMessage.includes("unauthenticated")) {
    return {
      title: "Session Expired",
      message: "Your session has expired. Please sign in again to continue.",
      action: "Refresh the page to sign in",
      details: errorMessage,
    };
  }

  if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
    return {
      title: "Too Many Requests",
      message: "You've made too many requests recently. Please wait a moment before trying again.",
      action: "Wait a few seconds and try again",
      details: "Rate limit exceeded",
    };
  }

  if (errorMessage.includes("413") || errorMessage.includes("payload too large")) {
    return {
      title: "File Too Large",
      message: "The file you're trying to upload is too large. Please compress it or split it into smaller files.",
      action: "Try uploading a smaller file (max 10MB)",
      details: errorMessage,
    };
  }

  if (errorMessage.includes("validation") || errorMessage.includes("invalid")) {
    return {
      title: "Invalid Information",
      message: "Some of the information you provided isn't quite right. Please check and try again.",
      action: "Review the highlighted fields and correct any errors",
      details: errorMessage,
    };
  }

  // Context-specific errors
  switch (context) {
    case "file_upload":
      return {
        title: "Upload Failed",
        message: "We couldn't process your file upload. Please check that the file is a valid CSV and try again.",
        action: "Ensure your file is a CSV format and under 10MB",
        contactSupport: true,
        details: errorMessage,
      };

    case "appeal_submission":
      return {
        title: "Appeal Submission Failed",
        message: "We encountered an issue submitting your appeal. The appeal has been saved and can be retried.",
        action: "Try submitting again from the appeals page. If the problem persists, contact support.",
        contactSupport: true,
        details: errorMessage,
      };

    case "payer_credentials":
      return {
        title: "Payer Portal Access Issue",
        message: "We're having trouble accessing the payer portal. Your credentials may need to be updated.",
        action: "Check your payer portal credentials in Settings or contact support for assistance.",
        contactSupport: true,
        details: errorMessage,
      };

    case "authentication":
      return {
        title: "Sign In Required",
        message: "Please sign in to access this feature.",
        action: "Click 'Sign In' to continue",
        details: errorMessage,
      };

    case "authorization":
      return {
        title: "Access Denied",
        message: "You don't have permission to perform this action. Please contact your practice administrator.",
        action: "Contact your practice admin for access",
        details: errorMessage,
      };

    case "database":
      return {
        title: "Service Temporarily Unavailable",
        message: "We're experiencing technical difficulties. Please try again in a moment.",
        action: "Wait a moment and try again",
        contactSupport: true,
        details: errorMessage,
      };

    case "network":
      return {
        title: "Network Error",
        message: "We couldn't complete your request due to a network issue. Please check your connection and try again.",
        action: "Check your internet connection and try again",
        details: errorMessage,
      };

    default:
      // Generic user-friendly error
      return {
        title: "Something Went Wrong",
        message: "We encountered an unexpected error. Our team has been notified and is working to fix it.",
        action: "Try refreshing the page. If the problem continues, please contact support.",
        contactSupport: true,
        details: errorMessage,
      };
  }
}

/**
 * Create a user-friendly error from a Zod validation error
 */
export function fromZodError(error: unknown, fieldLabel?: string): UserFriendlyError {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: Array<{ message: string; path: string[] }> }).issues;
    const firstIssue = issues[0];

    if (firstIssue) {
      const fieldName = firstIssue.path[firstIssue.path.length - 1];
      const label = fieldLabel || fieldName;

      return {
        title: "Invalid Information",
        message: `"${label}" ${formatZodMessage(firstIssue.message)}`,
        action: "Please correct the highlighted field and try again",
        details: `Validation failed for ${label}: ${firstIssue.message}`,
      };
    }
  }

  return {
    title: "Invalid Information",
    message: "Some of the information you provided isn't quite right. Please check and try again.",
    action: "Review the form and correct any errors",
    details: String(error),
  };
}

/**
 * Format Zod error messages into user-friendly text
 */
function formatZodMessage(zodMessage: string): string {
  const replacements: Record<string, string> = {
    "Required": "is required",
    "Invalid": "is not valid",
    "Too small": "is too short",
    "Too big": "is too long",
    "Expected": "must be",
  };

  for (const [search, replace] of Object.entries(replacements)) {
    if (zodMessage.includes(search)) {
      return zodMessage.replace(search, replace);
    }
  }

  return zodMessage;
}

/**
 * Create a user-friendly error for file uploads
 */
export function fileUploadError(error: unknown, fileName?: string): UserFriendlyError {
  const baseError = toUserFriendlyError(error, "file_upload");

  return {
    ...baseError,
    message: fileName
      ? `We couldn't upload "${fileName}". ${baseError.message.toLowerCase()}`
      : baseError.message,
    title: "Upload Failed",
  };
}

/**
 * Create a user-friendly error for appeal submission
 */
export function appealSubmissionError(error: unknown, claimNumber?: string): UserFriendlyError {
  const baseError = toUserFriendlyError(error, "appeal_submission");

  return {
    ...baseError,
    message: claimNumber
      ? `We couldn't submit the appeal for claim ${claimNumber}. ${baseError.message.toLowerCase()}`
      : baseError.message,
  };
}

/**
 * Type guard for UserFriendlyError
 */
function isUserFriendlyError(error: unknown): error is UserFriendlyError {
  return (
    typeof error === "object" &&
    error !== null &&
    "title" in error &&
    "message" in error
  );
}

/**
 * Format error for display in UI components
 */
export function formatErrorForDisplay(error: UserFriendlyError): {
  title: string;
  message: string;
  action?: string;
  showContactSupport: boolean;
} {
  return {
    title: error.title,
    message: error.message,
    action: error.action,
    showContactSupport: error.contactSupport || false,
  };
}

/**
 * Get contact support information
 */
export function getSupportContactInfo(): {
  email: string;
  phone?: string;
  hours?: string;
} {
  return {
    email: "support@overturn.com",
    phone: process.env.SUPPORT_PHONE || undefined,
    hours: process.env.SUPPORT_HOURS || undefined,
  };
}
