// Invitation lifecycle helpers.

import "server-only";
import crypto from "node:crypto";
import { prisma } from "@overturn/db";
import { notify } from "./notifications";

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 14;

export interface CreateInvitationInput {
  practiceId: string;
  createdById: string;
  email: string;
  role: "OWNER" | "ADMIN" | "STAFF";
}

export async function createInvitation(input: CreateInvitationInput) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const expires = new Date();
  expires.setDate(expires.getDate() + DEFAULT_TTL_DAYS);
  const inv = await prisma.invitation.create({
    data: {
      practiceId: input.practiceId,
      createdById: input.createdById,
      email: input.email.toLowerCase().trim(),
      role: input.role,
      token,
      expiresAt: expires,
    },
  });

  // Send invitation email — best effort. Notification row records success/failure.
  const url = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/invite/${token}`;
  try {
    await notify({
      practiceId: input.practiceId,
      template: "appeal.ready_for_review",
      recipient: inv.email,
      subject: "You're invited to Overturn",
      body:
        `You've been invited to join an Overturn practice account as ${input.role.toLowerCase()}.\n\n` +
        `Accept here: ${url}\n\nThis link expires ${expires.toLocaleDateString()}.`,
    });
  } catch (e) {
    console.error("[invitations] invite email failed:", e);
  }

  return inv;
}

export async function acceptInvitation(token: string, clerkId: string, email: string, name?: string) {
  const inv = await prisma.invitation.findUnique({ where: { token } });
  if (!inv) throw new Error("invite_not_found");
  if (inv.acceptedAt) throw new Error("invite_already_accepted");
  if (inv.expiresAt < new Date()) throw new Error("invite_expired");

  // Upsert the user.
  const user = await prisma.user.upsert({
    where: { clerkId },
    update: { practiceId: inv.practiceId, role: inv.role, name },
    create: {
      clerkId,
      email,
      name,
      practiceId: inv.practiceId,
      role: inv.role,
      invitedById: inv.createdById,
      invitedAt: inv.createdAt,
    },
  });

  await prisma.invitation.update({
    where: { id: inv.id },
    data: { acceptedAt: new Date() },
  });

  return user;
}
