"use client";

import { Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProviderDot } from "@/components/ui/provider-dot";
import { cn } from "@/lib/cn";
import type { ProviderStateDTO } from "@/lib/types";

function describe(provider: ProviderStateDTO): { text: string; tone: string } {
  switch (provider.status) {
    case "ready":
      return provider.modelCount > 0
        ? { text: "Connected", tone: "text-ok" }
        : { text: "Connected, but none of the supported models are enabled for this key", tone: "text-warn" };
    case "not_configured":
      return { text: "No API key set", tone: "text-subtle" };
    case "disabled":
      return { text: "Switched off by an administrator", tone: "text-subtle" };
    case "auth_failed":
      return { text: "The provider rejected the API key", tone: "text-danger" };
    case "unreachable":
      return { text: "Could not be reached", tone: "text-warn" };
  }
}

/**
 * Shown instead of a chat when no model can be used. It says exactly what is
 * missing rather than letting the user type into a chat that cannot answer.
 */
export function ProviderSetup({
  providers,
  onRetry,
}: {
  providers: ProviderStateDTO[];
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col py-16">
      <Unplug className="size-5 text-muted" strokeWidth={1.6} aria-hidden="true" />
      <h1 className="mt-5 text-xl font-medium tracking-[-0.02em]">No AI provider is connected</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        AVIO only offers models from providers that are set up on the server and
        accept its API key. Add a key to the server&apos;s environment, restart
        it, then check again.
      </p>

      <ul className="mt-7 overflow-hidden rounded-xl border border-line">
        {providers.map((provider) => {
          const status = describe(provider);
          return (
            <li
              key={provider.id}
              className="flex items-start justify-between gap-4 border-t border-line px-4 py-3.5 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <ProviderDot provider={provider.id} />
                  {provider.name}
                </p>
                <p className={cn("mt-1 text-[0.8125rem]", status.tone)}>{status.text}</p>
              </div>
              <code className="mt-0.5 shrink-0 rounded-md border border-line bg-hover px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted">
                {provider.apiKeyEnv}
              </code>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[0.8125rem] leading-relaxed text-subtle">
        Keys are read on the server only and are never sent to the browser.
      </p>
      <div className="mt-6">
        <Button variant="secondary" onClick={onRetry}>
          Check again
        </Button>
      </div>
    </div>
  );
}
