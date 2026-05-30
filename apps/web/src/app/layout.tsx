import "./globals.css";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden">
            <div className="mx-auto max-w-6xl px-8 py-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
