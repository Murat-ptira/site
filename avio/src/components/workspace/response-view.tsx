"use client";

import { TriangleAlert } from "lucide-react";
import { memo } from "react";

import { ProviderDot } from "@/components/ui/provider-dot";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits";
import { NOT_CHARGED_NOTE } from "@/lib/errors";
import { formatCount } from "@/lib/format";
import type { ResponseDTO } from "@/lib/types";

import { CopyButton } from "./copy-button";
import { Markdown } from "./markdown";

/** A response plus whether this tab is receiving it right now. */
export type LiveResponse = ResponseDTO & { live: boolean };

function Dots() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-[3px]">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="animate-pulse-dot size-1 rounded-full bg-muted"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function Waiting({ live }: { live: boolean }) {
  return (
    <div aria-live="polite">
      <span className="sr-only">
        {live ? "Generating a response" : "Still generating; this will update when it is ready"}
      </span>
      <div aria-hidden="true" className="flex flex-col gap-2.5 py-1">
        <div className="skeleton h-2.5 w-[88%]" />
        <div className="skeleton h-2.5 w-[72%]" />
        <div className="skeleton h-2.5 w-[46%]" />
      </div>
      {live ? null : (
        <p className="mt-3 text-xs text-subtle">
          Still generating. This will update when the reply is ready.
        </p>
      )}
    </div>
  );
}

interface ResponseViewProps {
  response: LiveResponse;
  /** Draw a card around the response, as in compare mode. */
  framed: boolean;
}

/** One model's answer: who wrote it, the reply, what it cost, or why it failed. */
export const ResponseView = memo(function ResponseView({
  response,
  framed,
}: ResponseViewProps) {
  const generating = response.status === "pending";
  const tokens = (response.inputTokens ?? 0) + (response.outputTokens ?? 0);

  return (
    <section
      aria-label={`Response from ${response.modelLabel}`}
      aria-busy={generating}
      className={cn(
        "group/response min-w-0",
        framed && "flex flex-col rounded-2xl border border-line bg-panel/50",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-2 text-xs",
          framed ? "border-b border-line px-4 py-3" : "mb-2.5",
        )}
      >
        <ProviderDot provider={response.provider} />
        <span className="truncate font-medium text-fg">{response.modelLabel}</span>
        {generating && response.live ? <Dots /> : null}
      </header>

      <div className={cn("min-w-0", framed && "flex-1 px-4 py-4")}>
        {response.content ? <Markdown content={response.content} /> : null}
        {generating && !response.content ? <Waiting live={response.live} /> : null}
        {generating && response.content && !response.live ? (
          <p className="mt-3 text-xs text-subtle">
            Still generating. This will update when the reply is ready.
          </p>
        ) : null}

        {response.status === "error" ? (
          <div
            role="alert"
            className={cn(
              "flex gap-2.5 rounded-xl border border-danger/25 bg-danger/[0.07] px-3.5 py-3 text-[0.8125rem] leading-relaxed",
              response.content && "mt-4",
            )}
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <p>
              <span className="text-fg">
                {response.error?.message ?? "Something went wrong while generating this response."}
              </span>{" "}
              <span className="text-muted">{NOT_CHARGED_NOTE}</span>
            </p>
          </div>
        ) : null}
      </div>

      {response.status === "complete" ? (
        <footer
          className={cn(
            "flex items-center gap-2 text-[0.6875rem] text-subtle",
            framed ? "border-t border-line px-2.5 py-1.5" : "mt-2 -ml-1.5",
          )}
        >
          <CopyButton label="Copy response" getText={() => response.content} />
          {response.credits !== undefined ? (
            <span className="font-mono tabular-nums">
              {formatCredits(response.credits)} credits
              {tokens > 0 ? ` · ${formatCount(tokens)} tokens` : ""}
            </span>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
});
