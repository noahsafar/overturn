// GET  /api/practice/clearinghouse — read masked clearinghouse state.
// POST /api/practice/clearinghouse — save SFTP credentials and toggle.
//
// The remote path + auth secrets are stored encrypted as a JSON blob in
// Practice.clearinghouseSftpPathEnc. Format:
//   { "path": "/inbox", "password": "...", "private_key": "..." }
// (password OR private_key — not both). The worker's clearinghouse polling
// loop decrypts this blob and uses it to authenticate to SFTP.

import { z } from "zod";
import { prisma, encryptPhi } from "@overturn/db";
import { apiHandler, badRequest } from "@/lib/api";

const PostBody = z.object({
  enabled: z.boolean(),
  host: z.string().min(1).max(200),
  user: z.string().min(1).max(100),
  remotePath: z.string().min(1).max(200),
  // One of these two is required when (re)setting auth.
  password: z.string().optional(),
  privateKey: z.string().optional(),
  // When true, the caller is just toggling the enabled flag and adjusting
  // the host/path — auth secret is left alone. The form sends this when
  // the user leaves the password/key field blank on a save.
  preserveSecret: z.boolean().default(false),
});

export const GET = apiHandler(
  { requiredRole: "ADMIN" },
  async ({ user }) => {
    const p = await prisma.practice.findUnique({
      where: { id: user.practiceId },
      select: {
        clearinghouseEnabled: true,
        clearinghouseSftpHost: true,
        clearinghouseSftpUser: true,
        clearinghouseSftpPathEnc: true,
        clearinghouseLastPolledAt: true,
        clearinghouseLastSuccessAt: true,
        clearinghouseLastError: true,
      },
    });
    if (!p) return null;
    return {
      enabled: p.clearinghouseEnabled,
      host: p.clearinghouseSftpHost,
      user: p.clearinghouseSftpUser,
      // Path stored inside encrypted blob — caller can re-enter, we never
      // round-trip the secret. We DO surface whether one is configured.
      hasSecret: !!p.clearinghouseSftpPathEnc,
      lastPolledAt: p.clearinghouseLastPolledAt,
      lastSuccessAt: p.clearinghouseLastSuccessAt,
      lastError: p.clearinghouseLastError,
    };
  },
);

export const POST = apiHandler(
  {
    bodySchema: PostBody,
    requiredRole: "ADMIN",
    audit: { action: "clearinghouse.update", resourceType: "practice" },
  },
  async ({ user, body }) => {
    const existing = await prisma.practice.findUnique({
      where: { id: user.practiceId },
      select: { clearinghouseSftpPathEnc: true },
    });

    let pathEnc: Buffer | null = existing?.clearinghouseSftpPathEnc ?? null;

    if (body.preserveSecret) {
      if (!existing?.clearinghouseSftpPathEnc) {
        throw badRequest("no existing secret to preserve");
      }
      // Re-encrypt the existing blob with any path update so the path stays
      // current. Decrypt → mutate → re-encrypt.
      const { decryptPhi } = await import("@overturn/db");
      const raw = decryptPhi(existing.clearinghouseSftpPathEnc);
      let parsed: Record<string, string>;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { path: raw };
      }
      parsed.path = body.remotePath;
      pathEnc = encryptPhi(JSON.stringify(parsed));
    } else {
      if (!body.password && !body.privateKey) {
        throw badRequest("password or privateKey required");
      }
      const blob: Record<string, string> = { path: body.remotePath };
      if (body.password) blob.password = body.password;
      if (body.privateKey) blob.private_key = body.privateKey;
      pathEnc = encryptPhi(JSON.stringify(blob));
    }

    await prisma.practice.update({
      where: { id: user.practiceId },
      data: {
        clearinghouseEnabled: body.enabled,
        clearinghouseSftpHost: body.host,
        clearinghouseSftpUser: body.user,
        clearinghouseSftpPathEnc: pathEnc,
        // Clear any old error when the user explicitly re-saves config;
        // the next poll cycle will set a fresh error if there's still a
        // problem.
        clearinghouseLastError: null,
      },
    });

    return { ok: true };
  },
);
