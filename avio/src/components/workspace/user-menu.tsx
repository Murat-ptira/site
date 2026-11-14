"use client";

import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { useDismiss } from "@/components/ui/use-dismiss";
import { initials } from "@/lib/format";

import { useWorkspace } from "./workspace-provider";

const menuItem =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[0.8125rem] text-fg transition-colors duration-100 hover:bg-hover focus-visible:bg-hover";

/** Profile button at the foot of the sidebar, with settings and sign-out. */
export function UserMenu() {
  const { user, logout } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [ref]);

  return (
    <div ref={ref} className="relative mt-1">
      {open ? (
        <div
          role="menu"
          className="animate-pop absolute inset-x-0 bottom-full z-10 mb-1.5 rounded-xl border border-line-strong bg-raised p-1 shadow-pop"
        >
          <Link href="/settings" role="menuitem" onClick={close} className={menuItem}>
            <Settings className="size-3.5 text-subtle" aria-hidden="true" />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void logout();
            }}
            className={menuItem}
          >
            <LogOut className="size-3.5 text-subtle" aria-hidden="true" />
            {leaving ? "Signing out…" : "Log out"}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-hover"
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-[0.6875rem] font-semibold text-fg ring-1 ring-line-strong"
        >
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] font-medium text-fg">{user.name}</span>
          <span className="block truncate text-[0.6875rem] text-subtle">{user.email}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
      </button>
    </div>
  );
}
