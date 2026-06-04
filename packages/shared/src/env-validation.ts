/**
 * Environment variable validation for production deployments.
 *
 * This module validates all required environment variables at startup,
 * providing clear error messages when configuration is missing or invalid.
 */

interface EnvVarSpec {
  description: string;
  required: boolean;
  requiredInEnv?: Array<"development" | "staging" | "production">;
  defaultValue?: string;
  validator?: (value: string) => boolean;
  examples?: string[];
}

const ENV_SPECS: Record<string, EnvVarSpec> = {
  // Database
  DATABASE_URL: {
    description: "PostgreSQL connection string with pgvector",
    required: true,
    examples: ["postgresql://user:pass@host:5432/dbname?schema=public"],
    validator: (v) => v.startsWith("postgresql://"),
  },

  // PHI Encryption
  PHI_ENC_KEY: {
    description: "32-byte base64-encoded key for envelope encryption",
    required: true,
    requiredInEnv: ["staging", "production"],
    examples: ["base64-encoded 32-byte key"],
    validator: (v) => {
      try {
        return Buffer.from(v, "base64").length === 32;
      } catch {
        return false;
      }
    },
  },

  // Authentication
  CLERK_SECRET_KEY: {
    description: "Clerk HIPAA-tier secret key",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: {
    description: "Clerk publishable key for client-side auth",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  DEV_AUTH: {
    description: "Enable dev auth mode (bypasses Clerk)",
    required: false,
    defaultValue: "false",
  },

  // LLM
  ANTHROPIC_API_KEY: {
    description: "Anthropic API key (ZDR endpoint required for PHI)",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  ANTHROPIC_ZDR: {
    description: "Enable Anthropic ZDR (zero data retention)",
    required: false,
    defaultValue: "true",
  },
  ANTHROPIC_MODEL_DRAFT: {
    description: "Claude model for appeal drafting",
    required: false,
    defaultValue: "claude-opus-4-7",
  },
  ANTHROPIC_MODEL_CLASSIFY: {
    description: "Claude model for classification",
    required: false,
    defaultValue: "claude-haiku-4-5-20251001",
  },

  // Browser Automation
  BROWSERBASE_API_KEY: {
    description: "Browserbase API key for automated portal access",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  STAGEHAND_ENV: {
    description: "Stagehand environment (BROWSERBASE, LOCAL, or FAKE)",
    required: false,
    defaultValue: "FAKE",
    validator: (v) => ["BROWSERBASE", "LOCAL", "FAKE"].includes(v),
  },

  // Temporal
  TEMPORAL_HOST: {
    description: "Temporal server host",
    required: true,
  },
  TEMPORAL_NAMESPACE: {
    description: "Temporal namespace",
    required: false,
    defaultValue: "default",
  },
  TEMPORAL_TASK_QUEUE: {
    description: "Temporal task queue name",
    required: false,
    defaultValue: "appeals",
  },

  // Object Storage
  S3_BUCKET: {
    description: "S3 bucket for ERA/claim document storage",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  AWS_REGION: {
    description: "AWS region for S3 and other AWS services",
    required: true,
    requiredInEnv: ["staging", "production"],
    defaultValue: "us-east-1",
  },

  // Observability
  SENTRY_DSN: {
    description: "Sentry DSN for error tracking",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  SENTRY_TRACES_SAMPLE_RATE: {
    description: "Sentry performance tracing sample rate (0-1)",
    required: false,
    defaultValue: "0.1",
    validator: (v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n >= 0 && n <= 1;
    },
  },
  LANGFUSE_PUBLIC_KEY: {
    description: "Langfuse public key for LLM observability",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  LANGFUSE_SECRET_KEY: {
    description: "Langfuse secret key",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  LANGFUSE_HOST: {
    description: "Langfuse host URL",
    required: false,
    requiredInEnv: ["staging", "production"],
  },

  // Billing
  STRIPE_SECRET_KEY: {
    description: "Stripe secret key (HIPAA-compliant)",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  STRIPE_PUBLISHABLE_KEY: {
    description: "Stripe publishable key",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  STRIPE_WEBHOOK_SECRET: {
    description: "Stripe webhook secret for signature verification",
    required: true,
    requiredInEnv: ["staging", "production"],
  },

  // External Services
  DOCUMO_API_KEY: {
    description: "Documo API key for eFax",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  DOCUMO_API_BASE: {
    description: "Documo API base URL",
    required: false,
    defaultValue: "https://api.documo.com/v1",
  },
  LOB_API_KEY: {
    description: "Lob API key for mail-house services",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  LOB_API_BASE: {
    description: "Lob API base URL",
    required: false,
    defaultValue: "https://api.lob.com/v1",
  },
  RESEND_API_KEY: {
    description: "Resend API key for transactional email",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  RESEND_FROM_EMAIL: {
    description: "Default from email address",
    required: false,
    defaultValue: "appeals@overturn.local",
  },
  RESEND_REPLY_TO: {
    description: "Reply-to email address",
    required: false,
  },

  // Clearinghouse
  CLEARINGHOUSE_POLL_INTERVAL_S: {
    description: "Clearinghouse SFTP poll interval in seconds",
    required: false,
    defaultValue: "300",
    validator: (v) => {
      const n = parseInt(v, 10);
      return !isNaN(n) && n > 0;
    },
  },
  CLEARINGHOUSE_DEV_DIR: {
    description: "Dev mode directory for incoming ERAs",
    required: false,
    defaultValue: "./artifacts/incoming-eras",
  },

  // Internal
  NODE_ENV: {
    description: "Node environment (development, staging, production)",
    required: false,
    defaultValue: "development",
    validator: (v) => ["development", "staging", "production"].includes(v),
  },
  APP_BASE_URL: {
    description: "Base URL for the application",
    required: true,
    requiredInEnv: ["staging", "production"],
    examples: ["https://app.overturn.com"],
  },
  WORKER_INTERNAL_URL: {
    description: "Internal URL for worker API calls",
    required: false,
    defaultValue: "http://localhost:8001",
  },
  INTERNAL_SHARED_SECRET: {
    description: "Shared secret for internal API calls",
    required: true,
    requiredInEnv: ["staging", "production"],
  },
  APP_VERSION: {
    description: "Application version for monitoring",
    required: false,
    defaultValue: "dev",
  },

  // Support
  NEXT_PUBLIC_SUPPORT_PHONE: {
    description: "Support phone number for user-facing error messages",
    required: false,
  },
  SUPPORT_HOURS: {
    description: "Support hours for user-facing messages",
    required: false,
    examples: ["Mon-Fri 8am-8pm ET"],
  },
  OVERTURN_ADMIN_EMAILS: {
    description: "Comma-separated list of admin emails",
    required: false,
  },
};

export interface ValidationError {
  varName: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  environment: string;
}

/**
 * Validate all environment variables based on current NODE_ENV
 */
export function validateEnvironment(): ValidationResult {
  const env = (process.env.NODE_ENV || "development") as "development" | "staging" | "production" | "test";
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const [varName, spec] of Object.entries(ENV_SPECS)) {
    const value = process.env[varName];
    const isRequired = spec.required || (spec.requiredInEnv?.includes(env as any) ?? false);

    // Check if missing
    if (!value) {
      if (isRequired && !spec.defaultValue) {
        errors.push({
          varName,
          message: `Missing required environment variable: ${varName}`,
          severity: "error",
        });
        continue;
      } else if (!isRequired) {
        // Optional, not set - skip validation
        continue;
      }
    }

    // Use default if available
    const actualValue = value || spec.defaultValue || "";

    // Run custom validator
    if (spec.validator && !spec.validator(actualValue)) {
      if (isRequired) {
        errors.push({
          varName,
          message: `Invalid value for ${varName}: ${actualValue}`,
          severity: "error",
        });
      } else {
        warnings.push({
          varName,
          message: `Potentially invalid value for ${varName}: ${actualValue}`,
          severity: "warning",
        });
      }
    }

    // Warn if dev values in staging/production
    if (env === "staging" || env === "production") {
      if (isDevValue(actualValue, varName)) {
        warnings.push({
          varName,
          message: `Using development/placeholder value for ${varName} in ${env}`,
          severity: "warning",
        });
      }
    } else if (env !== "development" && isDevValue(actualValue, varName)) {
      // Also warn if in other non-development environments
      warnings.push({
        varName,
        message: `Using development/placeholder value for ${varName} in ${env}`,
        severity: "warning",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    environment: env,
  };
}

/**
 * Check if a value looks like a dev/placeholder value
 */
function isDevValue(value: string, varName: string): boolean {
  const devPatterns = [
    "localhost",
    "127.0.0.1",
    "dev.local",
    "development",
    "test_",
    "stub",
    "fake",
  ];

  return devPatterns.some((pattern) =>
    value.toLowerCase().includes(pattern)
  );
}

/**
 * Format validation results for display
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push("✓ Environment validation passed");
  } else {
    lines.push("✗ Environment validation failed");
  }

  if (result.errors.length > 0) {
    lines.push("\nErrors:");
    for (const error of result.errors) {
      const spec = ENV_SPECS[error.varName];
      lines.push(`  ${error.varName}:`);
      lines.push(`    ${error.message}`);
      if (spec?.description) {
        lines.push(`    Description: ${spec.description}`);
      }
      if (spec?.examples) {
        lines.push(`    Examples: ${spec.examples.join(", ")}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push("\nWarnings:");
    for (const warning of result.warnings) {
      lines.push(`  ${warning.varName}: ${warning.message}`);
    }
  }

  return lines.join("\n");
}

/**
 * Validate on import and throw if invalid (for production)
 */
export function validateOrThrow(): ValidationResult {
  const result = validateEnvironment();
  const env = process.env.NODE_ENV || "development";

  if (!result.valid) {
    if (env === "production") {
      throw new Error(
        `Environment validation failed:\n${formatValidationResult(result)}`
      );
    } else {
      console.warn(formatValidationResult(result));
    }
  } else if (result.warnings.length > 0) {
    console.warn(formatValidationResult(result));
  } else {
    console.log("✓ Environment validated");
  }

  return result;
}
