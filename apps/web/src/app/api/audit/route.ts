// GET /api/audit — list of recent audit events for the practice.
// Admin / Owner only.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";

const QuerySchema = z.object({
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
});

export const GET = apiHandler(
  {
    requiredRole: "ADMIN",
    audit: { action: "audit.list", resourceType: "audit_event" },
  },
  async ({ user, req }) => {
    const url = new URL(req.url);
    const params = QuerySchema.parse(Object.fromEntries(url.searchParams));
    const events = await prisma.auditEvent.findMany({
      where: {
        practiceId: user.practiceId,
        ...(params.resourceType ? { resourceType: params.resourceType } : {}),
        ...(params.resourceId ? { resourceId: params.resourceId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: params.limit,
      include: { user: { select: { email: true, name: true } } },
    });
    return events.map((e) => ({
      id: e.id,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      metadata: e.metadata,
      createdAt: e.createdAt,
      userEmail: e.user?.email ?? null,
      userName: e.user?.name ?? null,
    }));
  },
);
