import "./globals.css";
import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
import { prisma } from "@overturn/db";
import { AppShell } from "@/components/AppShell";
import { currentUser, isSuperuser } from "@/lib/auth";

// Self-hosted via next/font — no render-blocking Google @import, no layout
// shift, and Inter actually applies (it sits first in the font-sans stack).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Editorial serif for marketing surfaces (landing hero). Loaded once here so
// the CSS var exists everywhere, but only .font-display uses it.
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

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

  // Onboarding gate — if a user is logged in but their practice hasn't
  // finished onboarding, push them to /onboarding (unless they're already
  // on an allowlisted path). We fetch the practice once and reuse it for the
  // shell so we don't double-query.
  let practice: { name: string; specialty: string | null; onboardingCompletedAt: Date | null } | null =
    null;
  if (user) {
    practice = await prisma.practice.findUnique({
      where: { id: user.practiceId },
      select: { name: true, specialty: true, onboardingCompletedAt: true },
    });
    const h = await headers();
    const pathname = h.get("x-pathname") ?? "";
    if (pathname && !isAllowedForUnonboarded(pathname)) {
      if (practice && !practice.onboardingCompletedAt) {
        redirect("/onboarding");
      }
    }
  }

  const authMode: "clerk" | "dev" =
    process.env.DEV_AUTH === "true" || !process.env.CLERK_SECRET_KEY
      ? "dev"
      : "clerk";

  const content =
    user && practice ? (
      <AppShell
        practice={{ name: practice.name, specialty: practice.specialty }}
        user={{ email: user.email, role: user.role }}
        isSuperuser={isSuperuser(user)}
        authMode={authMode}
      >
        {children}
      </AppShell>
    ) : (
      // No authenticated user (e.g. a cold visitor or the sign-in page in
      // production). Render without app chrome.
      <main className="min-h-screen overflow-y-auto">
        <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">
          {children}
        </div>
      </main>
    );

  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">
        {/* ClerkProvider only mounts in real-auth mode — it throws without keys. */}
        {authMode === "clerk" ? <ClerkProvider>{content}</ClerkProvider> : content}
      </body>
    </html>
  );
}
