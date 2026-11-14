"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";

import { ProviderDot } from "@/components/ui/provider-dot";
import { useDismiss } from "@/components/ui/use-dismiss";
import { PROVIDER_IDS } from "@/config/catalog";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/credits";
import type { ModelDTO, ProviderStateDTO, ProviderStatus } from "@/lib/types";

const STATUS_NOTE: Record<Exclude<ProviderStatus, "ready">, string> = {
  not_configured: "not configured",
  disabled: "switched off",
  auth_failed: "API key rejected",
  unreachable: "can't be reached",
};

interface ModelSelectProps {
  /** Accessible name, e.g. "Model" or "Second model". */
  label: string;
  value: ModelDTO | null;
  models: ModelDTO[];
  providers: ProviderStateDTO[];
  /** A model that cannot be picked here because the other side uses it. */
  excludeId?: string;
  loading?: boolean;
  onChange: (model: ModelDTO) => void;
}

/** Picks one of the models that are available right now, grouped by provider. */
export function ModelSelect({
  label,
  value,
  models,
  providers,
  excludeId,
  loading,
  onChange,
}: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [rootRef]);

  const selectable = models.filter((model) => model.id !== excludeId);
  const unavailable = providers.filter((provider) => provider.status !== "ready");

  function openList() {
    const current = selectable.findIndex((model) => model.id === value?.id);
    setActiveIndex(current === -1 ? 0 : current);
    setOpen(true);
  }

  function choose(model: ModelDTO) {
    onChange(model);
    close();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = (activeIndex + step + selectable.length) % selectable.length;
      setActiveIndex(next);
      listRef.current
        ?.querySelector(`[data-index="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const model = selectable[activeIndex];
      if (model) choose(model);
    } else if (event.key === "Tab") {
      close();
    }
  }

  if (loading) {
    return <div className="skeleton h-9 w-40" aria-label="Loading models" />;
  }
  if (models.length === 0) return null;

  return (
    <div ref={rootRef} className="relative min-w-0" onKeyDown={onKeyDown}>
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? close() : openList())}
        className="flex h-9 max-w-full items-center gap-2 rounded-lg border border-transparent px-2.5 text-sm font-medium text-fg transition-colors duration-150 hover:bg-hover aria-expanded:border-line aria-expanded:bg-hover"
      >
        {value ? <ProviderDot provider={value.provider} /> : null}
        <span className="truncate">{value?.label ?? "Choose a model"}</span>
        <ChevronDown className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="animate-pop absolute top-full left-0 z-30 mt-1.5 max-h-[min(28rem,70dvh)] w-[min(21rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-line-strong bg-raised p-1 shadow-pop"
        >
          {PROVIDER_IDS.map((providerId) => {
            const group = selectable.filter((model) => model.provider === providerId);
            if (group.length === 0) return null;
            return (
              <div key={providerId} role="group" aria-label={group[0].providerName} className="mb-1 last:mb-0">
                <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 text-[0.6875rem] font-medium tracking-wide text-subtle uppercase">
                  <ProviderDot provider={providerId} className="size-1.5" />
                  {group[0].providerName}
                </div>
                {group.map((model) => {
                  const index = selectable.indexOf(model);
                  const selected = model.id === value?.id;
                  return (
                    <div
                      key={model.id}
                      role="option"
                      aria-selected={selected}
                      data-index={index}
                      onClick={() => choose(model)}
                      onPointerMove={() => setActiveIndex(index)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-2.5 py-2",
                        index === activeIndex && "bg-hover",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.8125rem] font-medium text-fg">{model.label}</div>
                        <div className="truncate text-xs text-subtle">{model.description}</div>
                      </div>
                      <span className="shrink-0 font-mono text-[0.6875rem] text-subtle tabular-nums">
                        {formatCredits(model.outputUnitsPer1k)}
                      </span>
                      <Check
                        className={cn("size-3.5 shrink-0", selected ? "text-fg" : "invisible")}
                        aria-hidden="true"
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="mt-1 border-t border-line px-2.5 pt-2 pb-1.5 text-[0.6875rem] leading-relaxed text-subtle">
            Figures are credits per 1,000 output tokens. Input is billed at a lower rate.
            {unavailable.length > 0 ? (
              <span className="mt-1 block">
                Not available:{" "}
                {unavailable
                  .map((provider) => `${provider.name} (${STATUS_NOTE[provider.status as keyof typeof STATUS_NOTE]})`)
                  .join(", ")}
                .
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
