// POST /api/invitations — create a new invitation to a teammate.
// GET  /api/invitations — list pending invitations for the practice.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";
import { createInvitation } from "@/lib/invitations";

const PostBody = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "STAFF"]).default("STAFF"),
});

export const POST = apiHandler(
  {
    bodySchema: PostBody,
    requiredRole: "ADMIN",
    audit: { action: "invitation.create", resourceType: "invitation" },
  },
  async ({ user, body }) => {
    const inv = await createInvitation({
      practiceId: user.practiceId,
      createdById: user.id,
      email: body.email,
      role: body.role,
    });
    return { id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt };
  },
);

export const GET = apiHandler(
  {
    requiredRole: "ADMIN",
  },
  async ({ user }) => {
    const invs = await prisma.invitation.findMany({
      where: { practiceId: user.practiceId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return invs.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    }));
  },
);
