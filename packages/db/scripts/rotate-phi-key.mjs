#!/usr/bin/env node
// PHI_ENC_KEY rotation.
//
// Decrypts every PHI column with OLD_KEY, re-encrypts with NEW_KEY, writes back.
// Idempotent within a run, but you must run it exactly once per rotation —
// running it twice with the same OLD/NEW would interpret already-rotated rows
// as old-key ciphertext and fail.
//
// Tables touched: Patient (firstNameEnc, lastNameEnc, dobEnc, memberIdEnc),
// PayerCredential (usernameEnc, passwordEnc, mfaSecretEnc),
// Practice (clearinghouseSftpPathEnc).
//
// Usage:
//   OLD_KEY=<base64> NEW_KEY=<base64> DATABASE_URL=... node scripts/rotate-phi-key.mjs --dry-run
//   OLD_KEY=<base64> NEW_KEY=<base64> DATABASE_URL=... node scripts/rotate-phi-key.mjs
//
// Generate a new key:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

import { PrismaClient } from "@prisma/client";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

const dryRun = process.argv.includes("--dry-run");

function loadKey(name) {
  const raw = process.env[name];
  if (!raw) {
    console.error(`${name} env var required`);
    process.exit(2);
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    console.error(`${name} must decode to 32 bytes (got ${buf.length})`);
    process.exit(2);
  }
  return buf;
}

function decrypt(blob, key) {
  const b = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (b.length < IV_LEN + TAG_LEN) throw new Error("blob too short");
  const iv = b.subarray(0, IV_LEN);
  const tag = b.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = b.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

function encrypt(plaintext, key) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

function reencrypt(blob, oldKey, newKey) {
  return encrypt(decrypt(blob, oldKey), newKey);
}

async function main() {
  const oldKey = loadKey("OLD_KEY");
  const newKey = loadKey("NEW_KEY");
  if (Buffer.compare(oldKey, newKey) === 0) {
    console.error("OLD_KEY and NEW_KEY are identical — nothing to do");
    process.exit(2);
  }

  const prisma = new PrismaClient();
  let touched = 0;
  let errors = 0;

  console.log(`mode: ${dryRun ? "DRY-RUN" : "WRITE"}`);

  // ── Patient ─────────────────────────────────────────────────────────
  const patients = await prisma.patient.findMany({
    select: { id: true, firstNameEnc: true, lastNameEnc: true, dobEnc: true, memberIdEnc: true },
  });
  console.log(`Patient: ${patients.length} rows`);
  for (const p of patients) {
    try {
      const data = {
        firstNameEnc: reencrypt(p.firstNameEnc, oldKey, newKey),
        lastNameEnc: reencrypt(p.lastNameEnc, oldKey, newKey),
        dobEnc: reencrypt(p.dobEnc, oldKey, newKey),
        memberIdEnc: reencrypt(p.memberIdEnc, oldKey, newKey),
      };
      if (!dryRun) await prisma.patient.update({ where: { id: p.id }, data });
      touched++;
    } catch (e) {
      console.error(`  ✗ Patient ${p.id}: ${e.message}`);
      errors++;
    }
  }

  // ── PayerCredential ────────────────────────────────────────────────
  const creds = await prisma.payerCredential.findMany({
    select: { id: true, usernameEnc: true, passwordEnc: true, mfaSecretEnc: true },
  });
  console.log(`PayerCredential: ${creds.length} rows`);
  for (const c of creds) {
    try {
      const data = {
        usernameEnc: reencrypt(c.usernameEnc, oldKey, newKey),
        passwordEnc: reencrypt(c.passwordEnc, oldKey, newKey),
        mfaSecretEnc: c.mfaSecretEnc ? reencrypt(c.mfaSecretEnc, oldKey, newKey) : null,
        rotatedAt: new Date(),
      };
      if (!dryRun) await prisma.payerCredential.update({ where: { id: c.id }, data });
      touched++;
    } catch (e) {
      console.error(`  ✗ PayerCredential ${c.id}: ${e.message}`);
      errors++;
    }
  }

  // ── Practice.clearinghouseSftpPathEnc ──────────────────────────────
  const practices = await prisma.practice.findMany({
    where: { clearinghouseSftpPathEnc: { not: null } },
    select: { id: true, clearinghouseSftpPathEnc: true },
  });
  console.log(`Practice.clearinghouseSftpPathEnc: ${practices.length} rows`);
  for (const p of practices) {
    try {
      const data = {
        clearinghouseSftpPathEnc: reencrypt(p.clearinghouseSftpPathEnc, oldKey, newKey),
      };
      if (!dryRun) await prisma.practice.update({ where: { id: p.id }, data });
      touched++;
    } catch (e) {
      console.error(`  ✗ Practice ${p.id}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\nrows ${dryRun ? "would-be-touched" : "rotated"}: ${touched}; errors: ${errors}`);
  await prisma.$disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
