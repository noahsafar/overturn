"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BellIcon,
  BoltIcon,
  CheckBadgeIcon,
  ClockIcon,
  BanknotesIcon,
  DocumentTextIcon,
  XCircleIcon,
  InboxIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";

interface NotificationItem {
  id: string;
  channel: string;
  template: string;
  subject: string | null;
  body: string | null;
  status: string;
  createdAt: string;
  readAt: string | null;
}

const TEMPLATE_META: Record<
  string,
  { label: string; icon: typeof BellIcon; tone: string }
> = {
  "appeal.ready_for_review": {
    label: "Appeal ready for review",
    icon: DocumentTextIcon,
    tone: "text-primary-600 bg-primary-50",
  },
  "appeal.recovered": {
    label: "Recovery confirmed",
    icon: BanknotesIcon,
    tone: "text-success-600 bg-success-50",
  },
  "appeal.lost": {
    label: "Appeal denied",
    icon: XCircleIcon,
    tone: "text-error-600 bg-error-50",
  },
  "appeal.auto_submitted": {
    label: "Autopilot submitted",
    icon: BoltIcon,
    tone: "text-accent-600 bg-accent-50",
  },
  "denial.deadline_warning": {
    label: "Deadline approaching",
    icon: ClockIcon,
    tone: "text-warning-600 bg-warning-50",
  },
  "invoice.issued": {
    label: "Invoice issued",
    icon: BanknotesIcon,
    tone: "text-gray-600 bg-gray-100",
  },
  "invoice.paid": {
    label: "Invoice paid",
    icon: CheckBadgeIcon,
    tone: "text-success-600 bg-success-50",
  },
};

function metaFor(template: string) {
  return (
    TEMPLATE_META[template] ?? {
      label: template,
      icon: BellIcon,
      tone: "text-gray-600 bg-gray-100",
    }
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=30", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          items: NotificationItem[];
          unreadCount: number;
        };
        setItems(data.items);
        setUnread(data.unreadCount);
      }
    } catch {
      // best-effort; the bell stays silent on transient failures
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + light polling so new outcomes/recoveries surface without
  // a full page reload.
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Refresh when the dropdown is opened so counts are current.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Close on outside click / escape.
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

  const markRead = async (payload: { id?: string; all?: boolean }) => {
    // Optimistic update.
    setItems((prev) =>
      prev.map((n) =>
        payload.all || n.id === payload.id
          ? { ...n, readAt: n.readAt ?? new Date().toISOString() }
          : n,
      ),
    );
    setUnread((u) => (payload.all ? 0 : Math.max(0, u - 1)));
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      void load(); // reconcile on failure
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-elevated">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead({ all: true })}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <InboxIcon className="h-7 w-7 text-gray-300" />
                <p className="text-sm text-gray-500">
                  {loading ? "Loading…" : "You're all caught up"}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((n) => {
                  const m = metaFor(n.template);
                  const Icon = m.icon;
                  const isUnread = !n.readAt;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => isUnread && markRead({ id: n.id })}
                        className={clsx(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50",
                          isUnread && "bg-primary-50/30",
                        )}
                      >
                        <span
                          className={clsx(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            m.tone,
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-gray-900">
                              {m.label}
                            </span>
                            {isUnread && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                            )}
                          </span>
                          {n.subject && (
                            <span className="mt-0.5 block truncate text-xs text-gray-600">
                              {n.subject}
                            </span>
                          )}
                          <span className="mt-0.5 block text-[11px] text-gray-400">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
