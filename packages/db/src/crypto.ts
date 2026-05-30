import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// App-layer envelope encryption for PHI columns (Patient.firstNameEnc etc.).
//
// Format on disk: [12-byte IV][16-byte auth tag][ciphertext], one contiguous Bytes blob.
//
// In production, PHI_ENC_KEY is sourced from AWS Secrets Manager and rotated
// via re-encrypt jobs. Here it is read from env — set it to a base64-encoded
// 32-byte key. See .env.example for generation instructions.

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.PHI_ENC_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PHI_ENC_KEY is required in production");
    }
    // Dev/test fallback — deterministic key so seeded data is decryptable
    // across restarts. NEVER use this with real PHI.
    return Buffer.alloc(32, 7);
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("PHI_ENC_KEY must decode to 32 bytes");
  }
  return buf;
}

export function encryptPhi(plaintext: string): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptPhi(blob: Buffer | Uint8Array): string {
  const b = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (b.length < IV_LEN + TAG_LEN) {
    throw new Error("PHI blob too short");
  }
  const key = getKey();
  const iv = b.subarray(0, IV_LEN);
  const tag = b.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = b.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
