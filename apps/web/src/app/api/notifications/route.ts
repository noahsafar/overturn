// GET /api/notifications — the in-app inbox for the current practice.
//
// Returns the most recent notifications plus an unread count. Notifications
// are practice-scoped (created by the worker + web on appeal.ready, outcomes,
// invoices, etc.). "Unread" = readAt is null.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(30),
});

export const GET = apiHandler(
  { requiredRole: "STAFF" },
  async ({ user, req }) => {
    const url = new URL(req.url);
    const { limit } = QuerySchema.parse(Object.fromEntries(url.searchParams));

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { practiceId: user.practiceId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          channel: true,
          template: true,
          subject: true,
          body: true,
          status: true,
          createdAt: true,
          readAt: true,
        },
      }),
      prisma.notification.count({
        where: { practiceId: user.practiceId, readAt: null },
      }),
    ]);

    return { items, unreadCount };
  },
);
