import { redirect } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { OnboardingWizard } from "./OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  const practice = await prisma.practice.findUnique({
    where: { id: user.practiceId },
  });
  if (!practice) redirect("/");
  if (practice.onboardingCompletedAt) redirect("/dashboard");

  return (
    <div className="max-w-2xl mx-auto">
      <OnboardingWizard
        initialName={practice.name}
        initialBillingEmail={practice.billingEmail ?? ""}
        initialFeeBps={practice.recoveryFeeBps}
      />
    </div>
  );
}
