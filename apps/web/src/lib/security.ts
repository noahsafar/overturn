/**
 * Security middleware and utilities for production deployment.
 *
 * This module provides:
 * - Security headers (CSP, HSTS, etc.)
 * - CORS configuration
 * - Request validation
 * - CSRF protection
 * - Rate limiting helpers
 */

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "./rate-limit";

/**
 * Security headers to be applied to all responses.
 */
export const SECURITY_HEADERS = {
  "X-DNS-Prefetch-Control": "off",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-XSS-Protection": "1; mode=block",
};

/**
 * Content Security Policy for production.
 */
export const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://api.clerk.com https://*.clerk.accounts.dev",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Apply security headers to a NextResponse.
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  // Apply standard security headers
  Object.entries(SECURITY_HEADERS).forEach(([header, value]) => {
    response.headers.set(header, value);
  });

  // Apply CSP
  const env = process.env.NODE_ENV || "development";
  if (env === "production") {
    response.headers.set("Content-Security-Policy", CSP_HEADER);
  }

  return response;
}

/**
 * CORS configuration for API routes.
 */
export interface CORSOptions {
  origin?: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const DEFAULT_CORS_OPTIONS: CORSOptions = {
  origin: process.env.APP_BASE_URL || "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-ID",
    "X-Practice-ID",
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Apply CORS headers to a response.
 */
export function applyCORS(
  response: NextResponse,
  options: CORSOptions = DEFAULT_CORS_OPTIONS,
): NextResponse {
  const opts = { ...DEFAULT_CORS_OPTIONS, ...options };

  // Set allowed origin
  if (typeof opts.origin === "boolean") {
    if (opts.origin) {
      response.headers.set("Access-Control-Allow-Origin", "*");
    }
  } else if (typeof opts.origin === "string") {
    response.headers.set("Access-Control-Allow-Origin", opts.origin);
    response.headers.set("Vary", "Origin");
  } else if (Array.isArray(opts.origin)) {
    const requestOrigin = response.headers.get("Origin");
    if (requestOrigin && opts.origin.includes(requestOrigin)) {
      response.headers.set("Access-Control-Allow-Origin", requestOrigin);
      response.headers.set("Vary", "Origin");
    }
  }

  // Set other CORS headers
  response.headers.set("Access-Control-Allow-Methods", opts.methods?.join(", ") ?? "");
  response.headers.set("Access-Control-Allow-Headers", opts.allowedHeaders?.join(", ") ?? "");
  response.headers.set("Access-Control-Allow-Credentials", opts.credentials ? "true" : "false");
  response.headers.set("Access-Control-Max-Age", opts.maxAge?.toString() ?? "");

  return response;
}

/**
 * Handle OPTIONS request for CORS preflight.
 */
export function handleCORS_PREFLIGHT(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return applyCORS(response);
}

/**
 * Validate request content type for non-GET requests.
 */
export function validateContentType(request: NextRequest, allowedTypes: string[] = ["application/json"]): boolean {
  const method = request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const contentType = request.headers.get("content-type")?.split(";")[0];
  if (!contentType || !allowedTypes.includes(contentType)) {
    return false;
  }

  return true;
}

/**
 * Validate content length for POST/PUT requests.
 */
export function validateContentLength(request: NextRequest, maxSize: number = 10 * 1024 * 1024): boolean {
  const method = request.method;
  if (method !== "POST" && method !== "PUT" && method !== "PATCH") {
    return true;
  }

  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > maxSize) {
    return false;
  }

  return true;
}

/**
 * Rate limiting for API routes.
 */
export interface APIRateLimitOptions {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
}

/**
 * Check if a request should be rate limited.
 * Returns true if allowed, false if rate limited.
 */
export function checkAPIRateLimit(
  request: NextRequest,
  options: APIRateLimitOptions,
): { allowed: boolean; remaining: number; resetMs: number } {
  const userId = request.headers.get("x-user-id") || request.headers.get("x-practice-id") || "anonymous";
  const path = new URL(request.url).pathname;
  const key = `${options.keyPrefix || "api"}:${userId}:${path}`;

  return rateLimit(key, {
    limit: options.limit,
    windowMs: options.windowMs,
  });
}

/**
 * Rate limiting options for different endpoint types.
 */
export const RATE_LIMITS = {
  // Health checks - very permissive
  health: { limit: 1000, windowMs: 60_000 },

  // API routes - standard rate limit
  api: { limit: 120, windowMs: 60_000 },

  // Authentication - stricter
  auth: { limit: 10, windowMs: 60_000 },

  // Webhooks - higher limit for external services
  webhooks: { limit: 500, windowMs: 60_000 },

  // File uploads - very strict
  upload: { limit: 10, windowMs: 60_000 },

  // LLM operations - rate limit for cost control
  llm: { limit: 50, windowMs: 60_000 },
};

/**
 * Middleware to apply security to API routes.
 */
export function withSecurity(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse,
  options: {
    requireAuth?: boolean;
    rateLimit?: APIRateLimitOptions;
    allowedContentTypes?: string[];
    maxContentLength?: number;
  } = {},
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Check rate limit
    if (options.rateLimit) {
      const rateLimitResult = checkAPIRateLimit(req, options.rateLimit);
      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            error: "rate_limited",
            title: "Too Many Requests",
            message: "You've made several requests recently. Please wait a moment before trying again.",
            action: "Wait a few seconds and try again",
            retryAfterMs: rateLimitResult.resetMs,
          },
          {
            status: 429,
            headers: {
              "Retry-After": Math.ceil(rateLimitResult.resetMs / 1000).toString(),
              "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
              "X-RateLimit-Reset": new Date(Date.now() + rateLimitResult.resetMs).toISOString(),
            },
          },
        );
      }
      // Add rate limit headers to successful responses
      const response = await handler(req);
      response.headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString());
      return response;
    }

    // Validate content type
    if (options.allowedContentTypes && !validateContentType(req, options.allowedContentTypes)) {
      return NextResponse.json(
        {
          error: "unsupported_media_type",
          title: "Invalid Content Type",
          message: `Content type must be one of: ${options.allowedContentTypes.join(", ")}`,
          action: "Use a supported content type",
        },
        { status: 415 },
      );
    }

    // Validate content length
    if (options.maxContentLength && !validateContentLength(req, options.maxContentLength)) {
      return NextResponse.json(
        {
          error: "payload_too_large",
          title: "Request Too Large",
          message: `Request body must be less than ${Math.round(options.maxContentLength / 1024 / 1024)}MB`,
          action: "Reduce the size of your request",
        },
        { status: 413 },
      );
    }

    // Call the handler
    const response = await handler(req);

    // Apply security headers
    return applySecurityHeaders(response);
  };
}

/**
 * Generate a secure random token for CSRF protection.
 */
export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate a CSRF token.
 * In production, this should verify the token matches the one stored in the user's session.
 */
export function validateCSRFToken(token: string): boolean {
  // In production, validate against the session-stored token
  // For now, basic format validation
  return /^[a-f0-9]{64}$/.test(token);
}

/**
 * Sanitize user input to prevent XSS.
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format (basic).
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, "").length >= 10;
}
