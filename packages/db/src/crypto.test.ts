import { describe, it, expect } from "vitest";
import { encryptPhi, decryptPhi } from "./crypto.js";

describe("PHI envelope encryption", () => {
  it("round-trips ASCII", () => {
    const blob = encryptPhi("Jane Doe");
    expect(decryptPhi(blob)).toBe("Jane Doe");
  });

  it("round-trips unicode", () => {
    const blob = encryptPhi("Renée O'Connor — 2025-04-12");
    expect(decryptPhi(blob)).toBe("Renée O'Connor — 2025-04-12");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encryptPhi("repeat");
    const b = encryptPhi("repeat");
    expect(Buffer.compare(a, b)).not.toBe(0);
    expect(decryptPhi(a)).toBe("repeat");
    expect(decryptPhi(b)).toBe("repeat");
  });

  it("rejects tampered ciphertext", () => {
    const blob = encryptPhi("sensitive");
    blob[blob.length - 1] ^= 0xff;
    expect(() => decryptPhi(blob)).toThrow();
  });
});
