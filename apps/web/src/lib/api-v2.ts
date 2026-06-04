// Enhanced API handler wrapper with user-friendly error messages.
//
// This version improves upon api.ts by:
//   - Converting technical errors to user-friendly messages
//   - Providing clear next steps for common errors
//   - Better validation error messages
//   - Contextual error responses

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, z } from "zod";
import { prisma } from "@overturn/db";
import { isSuperuser, requireUser, type SessionUser } from "./auth";
import { reportError } from "./observability";
import { rateLimit } from "./rate-limit";
import {
  toUserFriendlyError,
  fromZodError,
  fileUploadError,
  appealSubmissionError,
  type ErrorContext,
  formatErrorForDisplay,
  getSupportContactInfo,
} from "./errors";

export type Role = "OWNER" | "ADMIN" | "STAFF";

const ROLE_RANK: Record<Role, number> = { STAFF: 0, ADMIN: 1, OWNER: 2 };

function roleAtLeast(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export interface AuditMeta {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ApiContext<TParams = unknown, TBody = unknown> {
  user: SessionUser;
  params: TParams;
  body: TBody;
  req: NextRequest;
  audit: (e: Partial<AuditMeta>) => Promise<void>;
}

export interface HandlerOptions<TParamsSchema extends ZodTypeAny = ZodTypeAny, TBodySchema extends ZodTypeAny = ZodTypeAny> {
  requiredRole?: Role;
  superuserOnly?: boolean;
  paramsSchema?: TParamsSchema;
  bodySchema?: TBodySchema;
  audit?: AuditMeta | ((ctx: { user: SessionUser; params: z.infer<TParamsSchema> }) => AuditMeta);
  rateLimit?: { limit: number; windowMs: number };
  errorContext?: ErrorContext; // Context for better error messages
}

interface RouteArgs {
  params: Promise<unknown>;
}

async function recordAudit(
  user: SessionUser,
  req: NextRequest,
  meta: AuditMeta,
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        practiceId: user.practiceId,
        userId: user.id,
        action: meta.action,
        resourceType: meta.resourceType,
        resourceId: meta.resourceId ?? null,
        ipAddress:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          req.headers.get("x-real-ip") ??
          null,
        userAgent: req.headers.get("user-agent"),
        metadata: (meta.metadata as unknown as object) ?? undefined,
      },
    });
  } catch (e) {
    console.error("[audit] failed to record event:", e);
  }
}

/**
 * Enhanced API handler with user-friendly error messages
 */
export function apiHandlerV2<
  TParamsSchema extends ZodTypeAny = ZodTypeAny,
  TBodySchema extends ZodTypeAny = ZodTypeAny,
  TResult = unknown,
>(
  options: HandlerOptions<TParamsSchema, TBodySchema> & { errorContext?: ErrorContext },
  fn: (
    ctx: ApiContext<z.infer<TParamsSchema>, z.infer<TBodySchema>>,
  ) => Promise<TResult>,
) {
  return async (req: NextRequest, args: RouteArgs): Promise<Response> => {
    // 1. Authn
    let user: SessionUser;
    try {
      user = await requireUser();
    } catch {
      const error = toUserFriendlyError(new Error("unauthenticated"), "authentication");
      const formatted = formatErrorForDisplay(error);
      return NextResponse.json(
        {
          error: "unauthenticated",
          title: formatted.title,
          message: formatted.message,
          action: formatted.action,
        },
        { status: 401 },
      );
    }

    // 2. Role
    if (options.requiredRole && !roleAtLeast(user.role, options.requiredRole)) {
      const error = toUserFriendlyError(new Error("insufficient_permissions"), "authorization");
      const formatted = formatErrorForDisplay(error);
      return NextResponse.json(
        {
          error: "forbidden",
          title: formatted.title,
          message: formatted.message,
          action: formatted.action,
        },
        { status: 403 },
      );
    }
    if (options.superuserOnly && !isSuperuser(user)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 2.5 Rate limit
    const limitCfg = options.rateLimit ?? { limit: 120, windowMs: 60_000 };
    const routePath = new URL(req.url).pathname;
    const rl = rateLimit(`${user.id}:${routePath}`, limitCfg);
    if (!rl.allowed) {
      const error = toUserFriendlyError(new Error("rate_limited"), "unknown");
      const formatted = formatErrorForDisplay(error);
      return NextResponse.json(
        {
          error: "rate_limited",
          title: formatted.title,
          message: formatted.message,
          action: formatted.action,
          retryAfterMs: rl.resetMs,
        },
        { status: 429, headers: { "retry-after": Math.ceil(rl.resetMs / 1000).toString() } },
      );
    }

    // 3. Validate params
    let params: z.infer<TParamsSchema> = {} as never;
    if (options.paramsSchema) {
      const raw = args.params ? await args.params : {};
      const parsed = options.paramsSchema.safeParse(raw);
      if (!parsed.success) {
        const error = fromZodError(parsed.error);
        const formatted = formatErrorForDisplay(error);
        return NextResponse.json(
          {
            error: "bad_params",
            title: formatted.title,
            message: formatted.message,
            action: formatted.action,
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }
      params = parsed.data;
    }

    // 4. Validate body
    let body: z.infer<TBodySchema> = undefined as never;
    if (options.bodySchema) {
      let raw: unknown;
      const ct = req.headers.get("content-type") ?? "";
      try {
        if (ct.includes("application/json")) raw = await req.json();
        else if (ct.includes("text/")) raw = await req.text();
        else if (ct.includes("multipart/form-data")) raw = await req.formData();
        else raw = await req.text();
      } catch {
        raw = undefined;
      }
      const parsed = options.bodySchema.safeParse(raw);
      if (!parsed.success) {
        const error = fromZodError(parsed.error);
        const formatted = formatErrorForDisplay(error);
        return NextResponse.json(
          {
            error: "bad_body",
            title: formatted.title,
            message: formatted.message,
            action: formatted.action,
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }
      body = parsed.data;
    }

    // 5. Resolve audit meta
    const auditMeta =
      typeof options.audit === "function"
        ? options.audit({ user, params })
        : options.audit ?? null;
    if (auditMeta) {
      await recordAudit(user, req, auditMeta);
    }

    const audit = (extra: Partial<AuditMeta>) =>
      recordAudit(user, req, {
        action: extra.action ?? auditMeta?.action ?? "unknown",
        resourceType: extra.resourceType ?? auditMeta?.resourceType ?? "unknown",
        resourceId: extra.resourceId ?? null,
        metadata: extra.metadata,
      });

    // 6. Execute with enhanced error handling
    try {
      const result = await fn({ user, params, body, req, audit });
      if (result instanceof Response) return result;
      return NextResponse.json(result);
    } catch (err) {
      const context = options.errorContext || "unknown";
      const userError = toUserFriendlyError(err, context);

      // Log technical details
      console.error(`[api] error in ${context}:`, err);

      // Send to Sentry with context
      void reportError(err, {
        path: new URL(req.url).pathname,
        practiceId: user.practiceId,
        userId: user.id,
        context,
      });

      const formatted = formatErrorForDisplay(userError);

      // Return user-friendly error
      return NextResponse.json(
        {
          error: context === "unknown" ? "internal_error" : `${context}_error`,
          title: formatted.title,
          message: formatted.message,
          action: formatted.action,
          showContactSupport: formatted.showContactSupport,
          support: formatted.showContactSupport ? getSupportContactInfo() : undefined,
        },
        { status: err instanceof HttpError ? (err as HttpError).status : 500 },
      );
    }
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public userMessage?: string, // Optional user-friendly override
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "not_found");
export const badRequest = (msg = "bad_request") => new HttpError(400, msg);
export const conflict = (msg = "conflict") => new HttpError(409, msg);
export const forbidden = (msg = "forbidden") => new HttpError(403, msg);

/**
 * Look up a denial scoped to the user's practice
 */
export async function findScopedDenial(
  user: SessionUser,
  denialId: string,
  include?: Parameters<typeof prisma.denial.findFirst>[0] extends infer T
    ? T extends { include?: infer I }
      ? I
      : never
    : never,
) {
  return prisma.denial.findFirst({
    where: { id: denialId, claim: { practiceId: user.practiceId } },
    include: include as never,
  }) as never;
}

export async function findScopedAppeal(user: SessionUser, appealId: string) {
  return prisma.appeal.findFirst({
    where: { id: appealId, denial: { claim: { practiceId: user.practiceId } } },
  });
}

export async function findScopedAppealWithIncludes<
  I extends Parameters<typeof prisma.appeal.findFirst>[0] extends infer T
    ? T extends { include?: infer Inc }
      ? Inc
      : never
    : never,
>(user: SessionUser, appealId: string, include: I) {
  return prisma.appeal.findFirst({
    where: { id: appealId, denial: { claim: { practiceId: user.practiceId } } },
    include,
  }) as never;
}
