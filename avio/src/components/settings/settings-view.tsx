"use client";

import { LogOut, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ProviderDot } from "@/components/ui/provider-dot";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { modelLabel } from "@/config/catalog";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits";
import { formatCount, formatDateTime } from "@/lib/format";
import type {
  CreditTransactionDTO,
  ThemePreference,
  UsageOverviewDTO,
} from "@/lib/types";

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line py-9 first:pt-0 last:border-b-0">
      <h2 className="text-[0.9375rem] font-medium tracking-tight">{title}</h2>
      {description ? <p className="mt-1 text-[0.8125rem] text-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="bg-bg p-4">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-2 font-mono text-xl tracking-tight tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-[0.6875rem] text-subtle">{detail}</p> : null}
    </div>
  );
}

function transactionLabel(transaction: CreditTransactionDTO): string {
  switch (transaction.type) {
    case "signup_grant":
      return "Welcome credits";
    case "usage":
      return transaction.description ? modelLabel(transaction.description) : "Model usage";
    case "purchase":
      return "Credit purchase";
    case "refund":
      return "Refund";
    case "adjustment":
      return transaction.description ?? "Adjustment";
  }
}

export function SettingsView({ usage }: { usage: UsageOverviewDTO }) {
  const { user, theme, setTheme, logout, setBalance } = useWorkspace();
  const [leaving, setLeaving] = useState(false);
  const { credits, totals } = usage;

  // This page was just rendered from the database; bring the sidebar in line.
  useEffect(() => {
    setBalance(credits.balance);
  }, [credits.balance, setBalance]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Section title="Account">
        <dl className="overflow-hidden rounded-xl border border-line text-sm">
          <div className="flex items-center justify-between gap-6 px-4 py-3">
            <dt className="text-muted">Name</dt>
            <dd className="truncate">{user.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-6 border-t border-line px-4 py-3">
            <dt className="text-muted">Email</dt>
            <dd className="truncate">{user.email}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Appearance" description="Saved to your account and applied wherever you sign in.">
        <div
          role="radiogroup"
          aria-label="Theme"
          className="inline-flex rounded-xl border border-line bg-panel p-1"
        >
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex h-8 items-center gap-2 rounded-lg px-3.5 text-[0.8125rem] font-medium transition-colors duration-150",
                theme === value
                  ? "bg-raised text-fg shadow-[0_0_0_1px_var(--line-strong)]"
                  : "text-muted hover:text-fg",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Usage"
        description="Credits are deducted after each successful reply, based on the tokens it used."
      >
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <Stat
            label="Balance"
            value={formatCredits(credits.balance)}
            detail={`of ${formatCredits(credits.granted, "whole")} granted`}
          />
          <Stat label="Credits used" value={formatCredits(totals.credits)} />
          <Stat label="Requests" value={formatCount(totals.requests)} />
          <Stat
            label="Tokens"
            value={formatCount(totals.inputTokens + totals.outputTokens)}
            detail={`${formatCount(totals.inputTokens)} in · ${formatCount(totals.outputTokens)} out`}
          />
        </div>

        <h3 className="mt-8 mb-3 text-xs font-medium tracking-wide text-subtle uppercase">By model</h3>
        {usage.byModel.length === 0 ? (
          <p className="rounded-xl border border-line px-4 py-5 text-[0.8125rem] text-muted">
            Nothing yet. Usage appears here after your first reply.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[30rem] text-left text-[0.8125rem]">
              <thead className="text-xs text-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Model</th>
                  <th className="px-4 py-2.5 text-right font-medium">Requests</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tokens</th>
                  <th className="px-4 py-2.5 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {usage.byModel.map((row) => (
                  <tr key={`${row.provider}:${row.model}`} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <ProviderDot provider={row.provider} />
                        {row.modelLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatCount(row.requests)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatCount(row.inputTokens + row.outputTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatCredits(row.credits)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="mt-8 mb-3 text-xs font-medium tracking-wide text-subtle uppercase">
          Credit history
        </h3>
        <ul className="overflow-hidden rounded-xl border border-line text-[0.8125rem]">
          {usage.transactions.length === 0 ? (
            <li className="px-4 py-5 text-muted">No transactions yet.</li>
          ) : (
            usage.transactions.map((transaction) => (
              <li
                key={transaction.id}
                className="flex items-center justify-between gap-4 border-t border-line px-4 py-2.5 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="truncate">{transactionLabel(transaction)}</p>
                  <p className="mt-0.5 text-[0.6875rem] text-subtle">
                    {formatDateTime(transaction.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right font-mono tabular-nums">
                  <p className={transaction.amount > 0 ? "text-ok" : "text-fg"}>
                    {transaction.amount > 0 ? "+" : "−"}
                    {formatCredits(Math.abs(transaction.amount))}
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] text-subtle">
                    {formatCredits(transaction.balanceAfter)} left
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
        {usage.transactions.length >= 25 ? (
          <p className="mt-2.5 text-[0.6875rem] text-subtle">Showing the 25 most recent transactions.</p>
        ) : null}
      </Section>

      <Section title="Session" description="Signing out ends this session on the server as well as in this browser.">
        <Button
          variant="secondary"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void logout();
          }}
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          {leaving ? "Signing out…" : "Log out"}
        </Button>
      </Section>
    </div>
  );
}
