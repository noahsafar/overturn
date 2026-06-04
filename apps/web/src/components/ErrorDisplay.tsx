/**
 * User-friendly error display component
 *
 * Provides clear, actionable error messages for non-technical users
 * Includes helpful guidance and next steps
 */

import { AlertCircle, RefreshCw, LifeBuoy, Info } from "lucide-react";

interface ErrorDisplayProps {
  title: string;
  message: string;
  action?: string;
  showContactLifeBuoy?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
  type?: "error" | "warning" | "info";
}

export function ErrorDisplay({
  title,
  message,
  action,
  showContactLifeBuoy = false,
  onRetry,
  onDismiss,
  type = "error",
}: ErrorDisplayProps) {
  const bgColor = type === "error" ? "bg-red-50" : type === "warning" ? "bg-yellow-50" : "bg-blue-50";
  const borderColor = type === "error" ? "border-red-200" : type === "warning" ? "border-yellow-200" : "border-blue-200";
  const textColor = type === "error" ? "text-red-800" : type === "warning" ? "text-yellow-800" : "text-blue-800";
  const iconColor = type === "error" ? "text-red-500" : type === "warning" ? "text-yellow-600" : "text-blue-500";

  const Icon = type === "error" ? AlertCircle : type === "warning" ? AlertCircle : Info;

  const supportEmail = "support@overturn.com";
  const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE;

  return (
    <div className={`${bgColor} ${borderColor} border rounded-lg p-6 mb-4`}>
      <div className="flex items-start gap-4">
        <Icon className={`h-6 w-6 flex-shrink-0 ${iconColor} mt-0.5`} />
        <div className="flex-1">
          <h3 className={`text-lg font-semibold ${textColor} mb-2`}>{title}</h3>
          <p className={`text-sm ${textColor} mb-4`}>{message}</p>

          {action && (
            <div className="mb-4">
              <p className={`text-sm font-medium ${textColor} mb-2`}>What you can do:</p>
              <p className={`text-sm ${textColor} bg-white/50 rounded px-3 py-2`}>
                {action}
              </p>
            </div>
          )}

          {showContactLifeBuoy && (
            <div className="bg-white/50 rounded-lg p-4 mb-4">
              <p className={`text-sm font-medium ${textColor} mb-2`}>
                <LifeBuoy className="h-4 w-4 inline mr-2" />
                Need additional help?
              </p>
              <p className={`text-sm ${textColor} mb-1`}>
                Contact our support team:
              </p>
              <ul className={`text-sm ${textColor} space-y-1 ml-6`}>
                <li>Email: <a href={`mailto:${supportEmail}`} className="underline hover:no-underline">{supportEmail}</a></li>
                {supportPhone && <li>Phone: <a href={`tel:${supportPhone}`} className="underline hover:no-underline">{supportPhone}</a></li>}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="inline-flex items-center px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline error message for form fields
 */
interface FieldErrorProps {
  message: string;
  className?: string;
}

export function FieldError({ message, className = "" }: FieldErrorProps) {
  return (
    <p className={`text-sm text-red-600 mt-1 ${className}`}>
      {message}
    </p>
  );
}

/**
 * Loading state with context
 */
interface LoadingProps {
  message?: string;
  spinner?: boolean;
}

export function Loading({ message = "Loading...", spinner = true }: LoadingProps) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4">
        {spinner && (
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-200 border-t-blue-600" />
        )}
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}

/**
 * Empty state with helpful message
 */
interface EmptyStateProps {
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
}

export function EmptyState({ title, message, action, icon }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      {icon && <div className="mx-auto h-12 w-12 text-gray-400 mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Success message with action
 */
interface SuccessProps {
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  autoDismiss?: boolean;
  onDismiss?: () => void;
}

export function Success({ title, message, action, autoDismiss = false, onDismiss }: SuccessProps) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-4">
      <div className="flex items-start gap-4">
        <div className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-green-800 mb-2">{title}</h3>
          <p className="text-sm text-green-700 mb-4">{message}</p>

          <div className="flex flex-wrap gap-3">
            {action && (
              <button
                onClick={action.onClick}
                className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {action.label}
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="inline-flex items-center px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 transition-colors"
              >
                {autoDismiss ? "Auto-dismissing..." : "Dismiss"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
