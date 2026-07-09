"use client";

import { useEffect, useRef, useState } from "react";
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
  PresentationChartLineIcon,
  CloudArrowDownIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { NotificationsBell } from "./NotificationsBell";

const navSections: {
  label: string | null;
  items: { name: string; href: string; icon: typeof HomeIcon }[];
}[] = [
  {
    label: null,
    items: [
      { name: "Home", href: "/", icon: HomeIcon },
      { name: "Dashboard", href: "/dashboard", icon: ChartBarIcon },
    ],
  },
  {
    label: "Work",
    items: [
      { name: "Denials", href: "/denials", icon: DocumentTextIcon },
      { name: "Upload", href: "/upload", icon: ArrowUpTrayIcon },
      { name: "Analytics", href: "/analytics", icon: PresentationChartLineIcon },
    ],
  },
  {
    label: "Billing",
    items: [
      { name: "Invoices", href: "/invoices", icon: BanknotesIcon },
      { name: "Reports", href: "/reports", icon: ChartPieIcon },
    ],
  },
  {
    label: "Practice",
    items: [
      { name: "Settings", href: "/settings/practice", icon: Cog6ToothIcon },
      { name: "Payers", href: "/settings/payers", icon: BuildingOffice2Icon },
      { name: "Clearinghouse", href: "/settings/clearinghouse", icon: CloudArrowDownIcon },
      { name: "Members", href: "/settings/members", icon: UsersIcon },
      { name: "Audit log", href: "/settings/audit", icon: ShieldCheckIcon },
    ],
  },
];

export interface ShellPractice {
  name: string;
  specialty?: string | null;
}
export interface ShellUser {
  email: string;
  name?: string | null;
  role: "OWNER" | "ADMIN" | "STAFF";
}

interface AppShellProps {
  practice: ShellPractice;
  user: ShellUser;
  isSuperuser: boolean;
  authMode: "clerk" | "dev";
  children: React.ReactNode;
}

const roleLabel: Record<ShellUser["role"], string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  STAFF: "Staff",
};

function initials(user: ShellUser): string {
  const base = user.name?.trim() || user.email;
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "U").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export function AppShell({
  practice,
  user,
  isSuperuser,
  authMode,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // The ops console (/admin) owns the full screen with its own dark chrome.
  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <SidebarNav
        className="hidden md:flex"
        practice={practice}
        isSuperuser={isSuperuser}
        pathname={pathname}
      />

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-gray-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <SidebarNav
            className="absolute inset-y-0 left-0 flex w-64 shadow-elevated"
            practice={practice}
            isSuperuser={isSuperuser}
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
            showClose
            onClose={() => setMobileOpen(false)}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          user={user}
          practice={practice}
          authMode={authMode}
          isSuperuser={isSuperuser}
          onMenu={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarNav({
  className,
  practice,
  isSuperuser,
  pathname,
  onNavigate,
  showClose,
  onClose,
}: {
  className?: string;
  practice: ShellPractice;
  isSuperuser: boolean;
  pathname: string;
  onNavigate?: () => void;
  showClose?: boolean;
  onClose?: () => void;
}) {
  return (
    <aside
      className={clsx(
        "w-64 shrink-0 flex-col h-screen overflow-y-auto border-r border-gray-200 bg-white",
        className,
      )}
    >
      <div className="flex h-16 items-center justify-between px-5 border-b border-gray-200 shrink-0">
        <img src="/overturn-logo.svg?v=8" alt="Overturn" className="h-8 w-auto" />
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-3">
        {navSections.map((section, si) => (
          <div key={section.label ?? si} className={si > 0 ? "mt-5" : undefined}>
            {section.label && (
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onNavigate}
                    className={clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-gray-900 text-white shadow-soft"
                        : "text-gray-700 hover:bg-gray-100",
                    )}
                  >
                    <item.icon
                      className={clsx("h-5 w-5", active ? "text-accent-300" : "text-gray-400")}
                    />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {isSuperuser && (
          <div className="mt-5">
            <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Overturn
            </div>
            <Link
              href="/admin"
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <Cog6ToothIcon className="h-5 w-5 text-gray-400" />
              <span>Ops console</span>
            </Link>
          </div>
        )}
      </nav>

      <div className="border-t border-gray-200 p-3 shrink-0">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 text-xs font-semibold text-white">
            {(practice.name?.[0] ?? "O").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              {practice.name}
            </p>
            <p className="truncate text-xs text-gray-500 capitalize">
              {practice.specialty || "Practice"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  user,
  practice,
  authMode,
  isSuperuser,
  onMenu,
}: {
  user: ShellUser;
  practice: ShellPractice;
  authMode: "clerk" | "dev";
  isSuperuser: boolean;
  onMenu: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white/80 px-4 backdrop-blur md:px-6">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:hidden"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>

      <img
        src="/overturn-logo.svg?v=8"
        alt="Overturn"
        className="h-7 w-auto md:hidden"
      />

      <div className="flex-1" />

      <NotificationsBell />
      <AccountMenu
        user={user}
        practice={practice}
        authMode={authMode}
        isSuperuser={isSuperuser}
      />
    </header>
  );
}

function AccountMenu({
  user,
  practice,
  authMode,
  isSuperuser,
}: {
  user: ShellUser;
  practice: ShellPractice;
  authMode: "clerk" | "dev";
  isSuperuser: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = () => {
    // In production Clerk injects a global client; in dev auth there's no
    // session to clear, so we just return to the public landing page.
    const clerk = (window as unknown as { Clerk?: { signOut?: () => void } })
      .Clerk;
    if (authMode === "clerk" && clerk?.signOut) {
      clerk.signOut();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-gray-100"
        aria-label="Account menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
          {initials(user)}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-elevated">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-gray-900">
              {user.name?.trim() || user.email}
            </p>
            <p className="truncate text-xs text-gray-500">{user.email}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="badge bg-gray-100 text-gray-700 ring-gray-300/40">
                {roleLabel[user.role]}
              </span>
              <span className="truncate text-xs text-gray-500">
                {practice.name}
              </span>
            </div>
          </div>
          <div className="p-1.5">
            <Link
              href="/settings/practice"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Cog6ToothIcon className="h-4 w-4 text-gray-400" />
              Practice settings
            </Link>
            {isSuperuser && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <ShieldCheckIcon className="h-4 w-4 text-gray-400" />
                Ops console
              </Link>
            )}
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ArrowRightStartOnRectangleIcon className="h-4 w-4 text-gray-400" />
              {authMode === "clerk" ? "Sign out" : "Back to home"}
            </button>
          </div>
          {authMode === "dev" && (
            <div className="border-t border-gray-100 px-4 py-2">
              <p className="text-[11px] text-gray-400">
                Demo session · dev auth
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
