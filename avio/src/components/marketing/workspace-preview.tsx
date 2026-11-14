import { findModel } from "@/config/catalog";
import { LogoMark } from "@/components/ui/logo";
import { ProviderDot } from "@/components/ui/provider-dot";

const LEFT = findModel("gpt-6.1-sol");
const RIGHT = findModel("claude-sonnet-5-5");

const HISTORY = ["w-[78%]", "w-[62%]", "w-[84%]", "w-[55%]", "w-[70%]", "w-[48%]"];
const LEFT_LINES = ["w-[92%]", "w-[84%]", "w-[96%]", "w-[58%]", "w-[88%]", "w-[73%]", "w-[40%]"];
const RIGHT_LINES = ["w-[86%]", "w-[95%]", "w-[66%]", "w-[90%]", "w-[79%]", "w-[52%]"];

function Pane({
  provider,
  label,
  lines,
}: {
  provider: "openai" | "anthropic" | "google";
  label: string;
  lines: string[];
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-bg/60">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5 text-xs text-muted">
        <ProviderDot provider={provider} />
        <span className="truncate font-medium text-fg">{label}</span>
      </div>
      <div className="flex flex-col gap-2.5 p-3.5">
        {lines.map((width, index) => (
          <div key={index} className={`skeleton h-2 ${width}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * An abstract picture of the workspace in compare mode for the landing page.
 * Replies are drawn as placeholder bars on purpose: the page never shows text
 * attributed to a model that the model did not write.
 */
export function WorkspacePreview() {
  return (
    <div aria-hidden="true" className="relative">
      <div className="absolute inset-x-16 -top-px h-px bg-linear-to-r from-transparent via-fg/30 to-transparent" />
      <div className="flex h-[26rem] overflow-hidden rounded-2xl border border-line bg-panel text-left shadow-pop">
        <aside className="hidden w-52 shrink-0 flex-col border-r border-line p-3 md:flex">
          <div className="flex items-center gap-2 px-1.5 py-1 text-fg">
            <LogoMark className="size-4" />
            <span className="text-xs font-semibold tracking-[0.16em]">AVIO</span>
          </div>
          <div className="mt-3 rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-xs text-muted">
            New chat
          </div>
          <div className="mt-4 flex flex-col gap-1">
            {HISTORY.map((width, index) => (
              <div
                key={index}
                className={`rounded-md px-2 py-2 ${index === 0 ? "bg-hover" : ""}`}
              >
                <div className={`h-1.5 rounded-full bg-line-strong ${width}`} />
              </div>
            ))}
          </div>
          <div className="mt-auto px-1.5">
            <div className="flex items-center justify-between text-[0.6875rem] text-subtle">
              <span>Credits</span>
              <span className="font-mono text-muted">4,318</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
              <div className="h-full w-[86%] rounded-full bg-fg/70" />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-fg">
              <ProviderDot provider="openai" />
              {LEFT?.label}
            </span>
            <span className="text-subtle">vs</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-fg">
              <ProviderDot provider="anthropic" />
              {RIGHT?.label}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
            <div className="max-w-[80%] self-end rounded-2xl bg-surface px-3.5 py-2 text-[0.8125rem] text-fg">
              Summarize the trade-offs between REST and GraphQL.
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <Pane provider="openai" label={LEFT?.label ?? ""} lines={LEFT_LINES} />
              <div className="hidden sm:block">
                <Pane provider="anthropic" label={RIGHT?.label ?? ""} lines={RIGHT_LINES} />
              </div>
            </div>
          </div>

          <div className="shrink-0 px-4 pb-4 sm:px-5">
            <div className="flex h-11 items-center justify-between rounded-xl border border-line-strong bg-surface pr-1.5 pl-3.5 text-[0.8125rem] text-subtle">
              Ask both models
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-fg">
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
