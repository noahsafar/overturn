// POST /api/patients/:id/delete — right-to-delete request.
//
// HIPAA right of access (45 CFR 164.524) + the right-to-be-forgotten
// expectation from state laws means we need a controlled path to scrub a
// patient's PHI without breaking referential integrity of the audit chain.
//
// What we do:
//   1. Decrypt-and-discard: replace every encrypted column on Patient with
//      a zero-byte sentinel ciphertext. The row stays, FK references stay
//      valid, but the PHI is unrecoverable.
//   2. Mark Patient.deletedAt = now. The UI hides deleted patients from
//      lists; admin can still see the tombstone for audit completeness.
//   3. Write a permanent AuditEvent describing the deletion.
//   4. We do NOT delete Denial / Claim / Appeal / AuditEvent rows — those
//      reference the patient but no longer carry decryptable PHI. Their
//      Appeal letters do carry PHI in the draft text. Phase 2 will scrub
//      those too; for now we flag and the operator can decide.
import { z } from "zod";
import { prisma, encryptPhi } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";

const ParamsSchema = z.object({ id: z.string().min(1) });
const BodySchema = z.object({ reason: z.string().min(1).max(500) });

export const POST = apiHandler(
  {
    paramsSchema: ParamsSchema,
    bodySchema: BodySchema,
    requiredRole: "OWNER",
    audit: ({ params }) => ({
      action: "patient.right_to_delete",
      resourceType: "patient",
      resourceId: params.id,
      metadata: { compliance_event: true },
    }),
  },
  async ({ user, params, body }) => {
    const p = await prisma.patient.findFirst({
      where: { id: params.id, practiceId: user.practiceId },
    });
    if (!p) throw notFound();
    if (p.deletedAt) {
      return { ok: true, alreadyDeleted: true };
    }

    // Sentinel ciphertext — encrypts the literal string "[REDACTED]" so the
    // bytes look like every other PHI blob (same crypto envelope) but the
    // plaintext is intentionally non-informative. Decryption still succeeds
    // and downstream code that calls `decrypt(patient.firstNameEnc)` gets
    // "[REDACTED]" rather than throwing.
    const sentinel = encryptPhi("[REDACTED]");

    await prisma.patient.update({
      where: { id: p.id },
      data: {
        firstNameEnc: sentinel,
        lastNameEnc: sentinel,
        dobEnc: sentinel,
        memberIdEnc: sentinel,
        deletedAt: new Date(),
      },
    });

    // Permanent record of the request itself, recorded BEFORE we move on
    // — this is the receipt the practice's compliance officer needs.
    await prisma.auditEvent.create({
      data: {
        practiceId: user.practiceId,
        userId: user.id,
        action: "patient.right_to_delete.completed",
        resourceType: "patient",
        resourceId: p.id,
        metadata: { reason: body.reason, externalId: p.externalId },
      },
    });

    return { ok: true };
  },
);
