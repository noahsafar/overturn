import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { PracticeSettingsForm } from "./PracticeSettingsForm";

export const dynamic = "force-dynamic";

export default async function PracticeSettingsPage() {
  const user = await requireUser();
  const p = await prisma.practice.findUnique({
    where: { id: user.practiceId },
    select: {
      name: true,
      npi: true,
      specialty: true,
      billingEmail: true,
      recoveryFeeBps: true,
      autoPilotEnabled: true,
      autoPilotMinConfidence: true,
      autoPilotMaxAmountCents: true,
    },
  });
  if (!p) return null;

  const canEdit = user.role === "OWNER" || user.role === "ADMIN";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Practice settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Profile, billing, and automation policy for {p.name}.
        </p>
      </div>

      <PracticeSettingsForm
        initial={{
          name: p.name,
          npi: p.npi,
          specialty: p.specialty,
          billingEmail: p.billingEmail,
          recoveryFeeBps: p.recoveryFeeBps,
          autoPilotEnabled: p.autoPilotEnabled,
          autoPilotMinConfidence: p.autoPilotMinConfidence,
          autoPilotMaxAmountCents: p.autoPilotMaxAmountCents,
        }}
        canEdit={canEdit}
      />
    </div>
  );
}
