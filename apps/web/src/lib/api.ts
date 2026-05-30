// Central API handler wrapper.
//
// Provides:
//   - Authentication enforcement (requireUser)
//   - Role-based access control (OWNER / ADMIN / STAFF)
//   - Practice-scoped guards (resources outside the user's practice 404, never 403,
//     to avoid leaking existence)
//   - Audit-event recording on every PHI-touching access
//   - Consistent error response shapes
//   - Zod input validation
//
// Every route handler should use `apiHandler` rather than calling requireUser
// directly. This is the single chokepoint where authorization is enforced.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, z } from "zod";
import { prisma } from "@overturn/db";
import { isSuperuser, requireUser, type SessionUser } from "./auth";
import { rateLimit } from "./rate-limit";

export type Role = "OWNER" | "ADMIN" | "STAFF";

const ROLE_RANK: Record<Role, number> = { STAFF: 0, ADMIN: 1, OWNER: 2 };

function roleAtLeast(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export interface AuditMeta {
  action: string; // e.g. "appeal.view", "denial.list"
  resourceType: string; // "appeal" | "denial" | "patient" | ...
  // resolved per-request from path params or the body
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ApiContext<TParams = unknown, TBody = unknown> {
  user: SessionUser;
  params: TParams;
  body: TBody;
  req: NextRequest;
  // Helper to record additional audit events from inside the handler — used
  // when a single request touches multiple resources.
  audit: (e: Partial<AuditMeta>) => Promise<void>;
}

export interface HandlerOptions<TParamsSchema extends ZodTypeAny, TBodySchema extends ZodTypeAny> {
  requiredRole?: Role;
  /**
   * Require Overturn-internal superuser access (cross-tenant). Independent of
   * the practice-scoped `requiredRole` axis. Used by /api/admin/* routes.
   */
  superuserOnly?: boolean;
  paramsSchema?: TParamsSchema;
  bodySchema?: TBodySchema;
  audit?: AuditMeta | ((ctx: { user: SessionUser; params: z.infer<TParamsSchema> }) => AuditMeta);
  /**
   * Per-user-per-route rate limit. Defaults to a generous 120 requests/min so
   * normal UI polling doesn't trip it; tighten per-route as needed (e.g.
   * heavy LLM endpoints should set a lower limit).
   */
  rateLimit?: { limit: number; windowMs: number };
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
    // Never let audit failures break the request. Surface to logs.
    console.error("[audit] failed to record event:", e);
  }
}

/**
 * Wraps a Next.js route handler with auth, role check, validation, and audit
 * logging. Returned function matches Next 15's app-router signature.
 *
 * Usage:
 *
 *   export const GET = apiHandler(
 *     {
 *       paramsSchema: z.object({ id: z.string() }),
 *       audit: ({ params }) => ({ action: "appeal.view", resourceType: "appeal", resourceId: params.id }),
 *     },
 *     async (ctx) => { ... }
 *   );
 */
export function apiHandler<
  TParamsSchema extends ZodTypeAny = ZodTypeAny,
  TBodySchema extends ZodTypeAny = ZodTypeAny,
  TResult = unknown,
>(
  options: HandlerOptions<TParamsSchema, TBodySchema>,
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
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    // 2. Role
    if (options.requiredRole && !roleAtLeast(user.role, options.requiredRole)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (options.superuserOnly && !isSuperuser(user)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 2.5 Rate limit (default 120 req/min per user per route).
    const limitCfg = options.rateLimit ?? { limit: 120, windowMs: 60_000 };
    const routePath = new URL(req.url).pathname;
    const rl = rateLimit(`${user.id}:${routePath}`, limitCfg);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: rl.resetMs },
        { status: 429, headers: { "retry-after": Math.ceil(rl.resetMs / 1000).toString() } },
      );
    }

    // 3. Validate params
    let params: z.infer<TParamsSchema> = {} as never;
    if (options.paramsSchema) {
      const raw = args.params ? await args.params : {};
      const parsed = options.paramsSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "bad_params", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      params = parsed.data;
    }

    // 4. Validate body (only if a schema is provided and the request has a body)
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
        return NextResponse.json(
          { error: "bad_body", details: parsed.error.flatten() },
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

    // 6. Execute
    try {
      const result = await fn({ user, params, body, req, audit });
      if (result instanceof Response) return result;
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "validation_error", details: err.flatten() },
          { status: 400 },
        );
      }
      console.error("[api] unhandled error:", err);
      return NextResponse.json(
        { error: "internal_error", message: (err as Error).message },
        { status: 500 },
      );
    }
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "not_found");
export const badRequest = (msg = "bad_request") => new HttpError(400, msg);
export const conflict = (msg = "conflict") => new HttpError(409, msg);
export const forbidden = (msg = "forbidden") => new HttpError(403, msg);

/**
 * Look up a denial scoped to the user's practice. Returns null if not found
 * OR not in the user's practice — we never distinguish to avoid leaking
 * existence across tenants.
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
  // Casting through unknown because Prisma's nested-include typing is hard
  // to thread through a generic helper; the runtime safety is the practiceId
  // filter, not the include shape.
  return prisma.denial.findFirst({
    where: { id: denialId, claim: { practiceId: user.practiceId } },
    include: include as never,
  } as never) as ReturnType<typeof prisma.denial.findFirst>;
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
  } as never) as ReturnType<typeof prisma.appeal.findFirst>;
}
