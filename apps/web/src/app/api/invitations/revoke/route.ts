// POST /api/invitations/revoke — revoke a pending invitation by id.
//
// Lives under /revoke (not /[id]) to avoid colliding with the public
// /[token]/accept route, which uses a different dynamic slug.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";

const Body = z.object({ id: z.string().min(1) });

export const POST = apiHandler(
  {
    bodySchema: Body,
    requiredRole: "ADMIN",
    audit: { action: "invitation.revoke", resourceType: "invitation" },
  },
  async ({ user, body }) => {
    const inv = await prisma.invitation.findFirst({
      where: { id: body.id, practiceId: user.practiceId },
    });
    if (!inv) throw notFound();
    await prisma.invitation.delete({ where: { id: inv.id } });
    return { ok: true };
  },
);
