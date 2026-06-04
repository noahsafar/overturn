"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  HomeIcon,
  BuildingOfficeIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";

const nav = [
  { name: "Fleet", href: "/admin", icon: HomeIcon },
  { name: "Practices", href: "/admin/practices", icon: BuildingOfficeIcon },
  { name: "Ops triage", href: "/admin/ops", icon: ExclamationTriangleIcon },
  { name: "Health", href: "/admin/health", icon: HeartIcon },
];

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col h-screen overflow-y-auto border-r border-gray-800 bg-gray-950 text-gray-200 sticky top-0">
      <div className="flex h-16 items-center px-5 border-b border-gray-800 shrink-0">
        <Link href="/admin" className="text-base font-semibold tracking-tight text-white">
          Overturn / ops
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {nav.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-900 hover:text-white",
              )}
            >
              <item.icon
                className={clsx("h-5 w-5", active ? "text-white" : "text-gray-500")}
              />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-800 p-3 space-y-2 shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-900"
        >
          <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
          Exit ops console
        </Link>
        <div className="px-2 text-xs text-gray-500 truncate">{email}</div>
      </div>
    </aside>
  );
}
