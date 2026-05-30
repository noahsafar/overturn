// Server-only helper that decrypts the encrypted PHI fields off a Patient
// record. Keep this import path narrow — the moment this runs in a client
// component, PHI risks leaking to the browser bundle.

import "server-only";
import { decryptPhi } from "@overturn/db";

export interface DecryptedPatient {
  firstName: string;
  lastName: string;
  dob: string;
  memberId: string;
}

interface EncryptedPatient {
  firstNameEnc: Uint8Array | Buffer;
  lastNameEnc: Uint8Array | Buffer;
  dobEnc: Uint8Array | Buffer;
  memberIdEnc: Uint8Array | Buffer;
}

export function decryptPatient(p: EncryptedPatient): DecryptedPatient {
  return {
    firstName: decryptPhi(p.firstNameEnc),
    lastName: decryptPhi(p.lastNameEnc),
    dob: decryptPhi(p.dobEnc),
    memberId: decryptPhi(p.memberIdEnc),
  };
}
