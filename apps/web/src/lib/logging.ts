/**
 * Structured logging with correlation IDs and context capture.
 *
 * This module provides:
 * - Structured JSON logging for production
 * - Correlation IDs for request tracing
 * - Context capture (user, practice, request)
 * - Performance tracking
 * - Sensitive data scrubbing
 */

import { headers } from "next/headers";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  correlationId?: string;
  userId?: string;
  practiceId?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  performance?: {
    duration?: number;
    operation?: string;
  };
}

// PHI scrubbing patterns
const PHI_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b(19|20)\d{2}-\d{2}-\d{2}\b/g, // ISO dates
  /\bMEM[A-Z0-9]{6,}\b/gi, // Member IDs
  /\bCLM[A-Z0-9]{6,}\b/gi, // Claim IDs
];

function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    let strValue = value as string;
    for (const pattern of PHI_PATTERNS) {
      strValue = strValue.replace(pattern, "[REDACTED]");
    }
    return strValue;
  }
  if (Array.isArray(value)) {
    return value.map(scrub);
  }
  if (typeof value === "object" && value !== null) {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      scrubbed[key] = scrub(val);
    }
    return scrubbed;
  }
  return value;
}

/**
 * Generate a correlation ID for request tracing.
 */
export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get or create correlation ID from request headers.
 */
export async function getCorrelationId(): Promise<string> {
  try {
    const h = await headers();
    const existing = h.get("x-correlation-id") || h.get("x-request-id");
    if (existing) return existing;
    return generateCorrelationId();
  } catch {
    return generateCorrelationId();
  }
}

/**
 * Synchronous version for when headers are not available.
 */
export function getCorrelationIdSync(): string {
  return generateCorrelationId();
}

/**
 * Core logging function.
 */
function log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
  const env = process.env.NODE_ENV || "development";

  // Skip debug logs in production unless explicitly enabled
  if (env === "production" && level === "debug" && !process.env.DEBUG_LOGS) {
    return;
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context: context ? scrub(context) as LogContext : undefined,
  };

  if (error) {
    entry.error = {
      name: error.name,
      message: scrub(error.message) as string,
      stack: error.stack,
    };
  }

  // Output as JSON in production, pretty print in development
  if (env === "production") {
    console.log(JSON.stringify(entry));
  } else {
    const emoji = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "❌" }[level];
    console.log(`${emoji} [${entry.level.toUpperCase()}] ${message}`);
    if (entry.context) {
      console.log("  Context:", entry.context);
    }
    if (entry.error) {
      console.log("  Error:", entry.error.message);
    }
  }
}

/**
 * Logger class with context persistence.
 */
export class Logger {
  private baseContext: LogContext;

  constructor(baseContext: LogContext = {}) {
    this.baseContext = baseContext;
  }

  /**
   * Create a new logger with additional context.
   */
  withContext(additionalContext: LogContext): Logger {
    return new Logger({ ...this.baseContext, ...additionalContext });
  }

  debug(message: string, context?: LogContext): void {
    log("debug", message, { ...this.baseContext, ...context });
  }

  info(message: string, context?: LogContext): void {
    log("info", message, { ...this.baseContext, ...context });
  }

  warn(message: string, context?: LogContext): void {
    log("warn", message, { ...this.baseContext, ...context });
  }

  error(message: string, error?: Error, context?: LogContext): void {
    log("error", message, { ...this.baseContext, ...context }, error);
  }

  /**
   * Track operation performance.
   */
  trackPerformance(operation: string, duration: number): void {
    log("info", `Operation: ${operation}`, {
      ...this.baseContext,
      performance: { duration, operation },
    });
  }
}

/**
 * Get a logger with request context.
 */
export function getLogger(context?: LogContext): Logger {
  const correlationId = getCorrelationIdSync();
  return new Logger({
    correlationId,
    environment: process.env.NODE_ENV || "development",
    ...context,
  });
}

/**
 * Performance tracking helper.
 */
export class PerformanceTracker {
  private startTime: number;
  private operation: string;
  private logger: Logger;

  constructor(operation: string, logger: Logger) {
    this.operation = operation;
    this.logger = logger;
    this.startTime = Date.now();
  }

  /**
   * End tracking and log the duration.
   */
  end(additionalContext?: LogContext): number {
    const duration = Date.now() - this.startTime;
    this.logger.trackPerformance(this.operation, duration);
    return duration;
  }

  /**
   * Track a sub-operation.
   */
  track(subOperation: string, callback: () => void): void {
    const start = Date.now();
    try {
      callback();
    } finally {
      const duration = Date.now() - start;
      this.logger.debug(`${this.operation}/${subOperation}`, {
        performance: { duration, operation: subOperation },
      });
    }
  }
}

/**
 * Create a performance tracker.
 */
export function trackPerformance(operation: string, logger?: Logger): PerformanceTracker {
  const effectiveLogger = logger || getLogger();
  return new PerformanceTracker(operation, effectiveLogger);
}

/**
 * Log with user context.
 */
export function logWithUser(
  userId: string,
  practiceId: string,
  level: LogLevel,
  message: string,
  context?: LogContext,
) {
  log(level, message, {
    userId: scrub(userId) as string,
    practiceId: scrub(practiceId) as string,
    ...context,
  });
}

/**
 * API request logging helper.
 */
export function logAPIRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  context?: LogContext,
) {
  const level: LogLevel = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
  log(level, `${method} ${path} - ${statusCode}`, {
    ...context,
    api: { method, path, statusCode, duration },
  });
}

/**
 * Database query logging helper.
 */
export function logDatabaseQuery(
  operation: string,
  table: string,
  duration: number,
  context?: LogContext,
) {
  log("debug", `DB Query: ${operation} on ${table}`, {
    ...context,
    database: { operation, table, duration },
  });
}

/**
 * LLM call logging helper.
 */
export function logLLMCall(
  model: string,
  operation: string,
  promptTokens: number,
  completionTokens: number,
  duration: number,
  context?: LogContext,
) {
  log("info", `LLM Call: ${model} - ${operation}`, {
    ...context,
    llm: {
      model,
      operation,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      duration,
    },
  });
}
