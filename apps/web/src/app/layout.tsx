import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@overturn/db";
import { Sidebar } from "@/components/Sidebar";
import { currentUser, isSuperuser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Overturn",
  description: "AI agents that overturn medical claim denials.",
  icons: {
    icon: [
      { url: "/overturn-favicon.svg", type: "image/svg+xml" },
      { url: "/overturn-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/overturn-favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/overturn-favicon-192.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

// Paths a not-yet-onboarded user is allowed to reach. Anything else bounces
// them to /onboarding. We allow the public landing page (/) too so cold
// visitors aren't trapped.
const ALLOW_UNONBOARDED = [
  "/",
  "/onboarding",
  "/invite",
  "/api/internal/",
  "/api/webhooks/",
  "/stub-stripe",
];

function isAllowedForUnonboarded(pathname: string): boolean {
  return ALLOW_UNONBOARDED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  const showAdminLink = isSuperuser(user);

  // Onboarding gate — if a user is logged in but their practice hasn't
  // finished onboarding, push them to /onboarding (unless they're already
  // on an allowlisted path).
  if (user) {
    const h = await headers();
    const pathname = h.get("x-pathname") ?? "";
    if (pathname && !isAllowedForUnonboarded(pathname)) {
      const p = await prisma.practice.findUnique({
        where: { id: user.practiceId },
        select: { onboardingCompletedAt: true },
      });
      if (p && !p.onboardingCompletedAt) {
        redirect("/onboarding");
      }
    }
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <div className="flex min-h-screen">
          <Sidebar showAdminLink={showAdminLink} />
          <main className="flex-1 overflow-x-hidden">
            <div className="mx-auto max-w-6xl px-8 py-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
