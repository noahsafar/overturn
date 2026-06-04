/**
 * Application initialization - runs once on startup
 *
 * This validates the environment and sets up any global configuration.
 */

import { validateOrThrow, formatValidationResult, type ValidationResult } from "@overturn/shared/env-validation";
import { initSentry } from "./sentry";

let initResult: ValidationResult | null = null;

/**
 * Initialize the application. Call this once during startup.
 *
 * In development, this will log warnings but won't throw.
 * In staging/production, this will throw if required env vars are missing.
 */
export function initializeApp(): ValidationResult {
  if (initResult) {
    return initResult;
  }

  try {
    // Initialize Sentry first (so it can capture init errors)
    // Temporarily disabled to debug build issue
    // initSentry();

    // Validate environment variables
    const result = validateOrThrow();
    initResult = result;

    // Log initialization
    console.log({
      event: "app_initialized",
      environment: process.env.NODE_ENV || "development",
      version: process.env.APP_VERSION || "dev",
      validation: result.valid ? "passed" : "failed",
      warnings: result.warnings.length,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    console.error("Failed to initialize application:", error);
    throw error;
  }
}

/**
 * Get initialization result (useful for health checks)
 */
export function getInitStatus(): ValidationResult {
  if (!initResult) {
    initializeApp();
  }
  return initResult!;
}
