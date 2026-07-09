// POST /api/notifications/read — mark notifications as read.
//
// Body: { id } to mark one, or { all: true } to clear the whole inbox.
// Always scoped to the caller's practice so one tenant can't touch another's.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, badRequest } from "@/lib/api";

const BodySchema = z.object({
  id: z.string().optional(),
  all: z.boolean().optional(),
});

export const POST = apiHandler(
  {
    requiredRole: "STAFF",
    bodySchema: BodySchema,
    audit: { action: "notification.read", resourceType: "notification" },
  },
  async ({ user, body }) => {
    if (body.all) {
      const res = await prisma.notification.updateMany({
        where: { practiceId: user.practiceId, readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: res.count };
    }
    if (body.id) {
      const res = await prisma.notification.updateMany({
        where: { id: body.id, practiceId: user.practiceId },
        data: { readAt: new Date() },
      });
      return { updated: res.count };
    }
    throw badRequest("provide either id or all");
  },
);
