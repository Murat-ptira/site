"use client";

import Link from "next/link";

import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits";

import { useWorkspace } from "./workspace-provider";

/** Balance at a glance: what is left, against everything granted so far. */
export function CreditMeter() {
  const { credits } = useWorkspace();
  const remaining =
    credits.granted > 0 ? Math.min(1, Math.max(0, credits.balance / credits.granted)) : 0;
  const empty = credits.balance <= 0;
  const low = !empty && remaining <= 0.1;

  return (
    <Link
      href="/settings"
      className="block rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-hover"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-subtle">Credits</span>
        <span
          className={cn(
            "font-mono text-[0.8125rem] tabular-nums",
            empty ? "text-danger" : low ? "text-warn" : "text-fg",
          )}
        >
          {formatCredits(credits.balance, "whole")}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Credits remaining"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(remaining * 100)}
        className="mt-2 h-1 overflow-hidden rounded-full bg-line"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            empty ? "bg-danger" : low ? "bg-warn" : "bg-fg/70",
          )}
          style={{ width: `${remaining * 100}%` }}
        />
      </div>
      <p className="mt-1.5 text-[0.6875rem] text-subtle">
        {empty
          ? "Out of credits"
          : `${formatCredits(credits.granted - credits.balance, "whole")} of ${formatCredits(credits.granted, "whole")} used`}
      </p>
    </Link>
  );
}
