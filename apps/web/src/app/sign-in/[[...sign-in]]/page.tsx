// Sign-in. In production (Clerk configured) this renders Clerk's hosted
// component; in dev-auth mode there is no session to create, so we explain
// that and point back to the app.
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const clerkMode =
    process.env.DEV_AUTH !== "true" && !!process.env.CLERK_SECRET_KEY;

  if (!clerkMode) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card max-w-md p-8 text-center">
          <img
            src="/overturn-logo.svg?v=8"
            alt="Overturn"
            className="mx-auto h-9 w-auto"
          />
          <h1 className="mt-6 text-xl font-semibold text-gray-900">
            Dev session active
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            This environment runs with the seeded development user — there's no
            sign-in step. In production, this page becomes the Clerk sign-in
            flow (HIPAA BAA required before enabling).
          </p>
          <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
            Continue to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-10">
      <SignIn />
    </div>
  );
}
