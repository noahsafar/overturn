"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  HomeIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ArrowUpTrayIcon,
  BuildingOffice2Icon,
  BanknotesIcon,
  ShieldCheckIcon,
  UsersIcon,
  ChartPieIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";

const nav = [
  { name: "Home", href: "/", icon: HomeIcon },
  { name: "Dashboard", href: "/dashboard", icon: ChartBarIcon },
  { name: "Denials", href: "/denials", icon: DocumentTextIcon },
  { name: "Upload", href: "/upload", icon: ArrowUpTrayIcon },
  { name: "Invoices", href: "/invoices", icon: BanknotesIcon },
  { name: "Reports", href: "/reports", icon: ChartPieIcon },
  { name: "Payers", href: "/settings/payers", icon: BuildingOffice2Icon },
  { name: "Members", href: "/settings/members", icon: UsersIcon },
  { name: "Audit log", href: "/settings/audit", icon: ShieldCheckIcon },
];

export function Sidebar({ showAdminLink = false }: { showAdminLink?: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center px-5 border-b border-gray-200">
        <img src="/overturn-logo.svg?v=8" alt="Overturn" className="h-8 w-auto" />
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-gray-900 text-white shadow-soft"
                  : "text-gray-700 hover:bg-gray-100",
              )}
            >
              <item.icon
                className={clsx("h-5 w-5", active ? "text-white" : "text-gray-400")}
              />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {showAdminLink && (
        <div className="border-t border-gray-200 p-3">
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <CommandLineIcon className="h-5 w-5 text-gray-400" />
            <span>Ops console</span>
            <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
              admin
            </span>
          </Link>
        </div>
      )}

      <div className="border-t border-gray-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">Dev User</p>
            <p className="text-xs text-gray-500">Synthetic data</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
