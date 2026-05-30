// POST /api/payer-credentials — create or update credentials.
// GET  /api/payer-credentials — list (metadata only; never returns secrets).
import { z } from "zod";
import { prisma, encryptPhi } from "@overturn/db";
import { apiHandler } from "@/lib/api";

const PostBody = z.object({
  payerId: z.string().min(1),
  credentialType: z.enum(["PORTAL", "SFTP", "API"]).default("PORTAL"),
  username: z.string().min(1),
  password: z.string().min(1),
  mfaSecret: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const POST = apiHandler(
  {
    bodySchema: PostBody,
    requiredRole: "ADMIN",
    audit: { action: "payer_credential.upsert", resourceType: "payer_credential" },
  },
  async ({ user, body }) => {
    const existing = await prisma.payerCredential.findUnique({
      where: {
        practiceId_payerId_credentialType: {
          practiceId: user.practiceId,
          payerId: body.payerId,
          credentialType: body.credentialType,
        },
      },
    });

    const data = {
      usernameEnc: encryptPhi(body.username),
      passwordEnc: encryptPhi(body.password),
      mfaSecretEnc: body.mfaSecret ? encryptPhi(body.mfaSecret) : null,
      configJson: (body.config as object | undefined) ?? undefined,
      rotatedAt: existing ? new Date() : null,
    };

    const row = await prisma.payerCredential.upsert({
      where: {
        practiceId_payerId_credentialType: {
          practiceId: user.practiceId,
          payerId: body.payerId,
          credentialType: body.credentialType,
        },
      },
      update: data,
      create: {
        practiceId: user.practiceId,
        payerId: body.payerId,
        credentialType: body.credentialType,
        ...data,
      },
    });

    return {
      id: row.id,
      payerId: row.payerId,
      credentialType: row.credentialType,
      rotatedAt: row.rotatedAt,
      createdAt: row.createdAt,
    };
  },
);

export const GET = apiHandler(
  {
    requiredRole: "ADMIN",
  },
  async ({ user }) => {
    const rows = await prisma.payerCredential.findMany({
      where: { practiceId: user.practiceId },
      include: { payer: { select: { id: true, name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      payerId: r.payerId,
      payerName: r.payer.name,
      credentialType: r.credentialType,
      createdAt: r.createdAt,
      rotatedAt: r.rotatedAt,
    }));
  },
);
