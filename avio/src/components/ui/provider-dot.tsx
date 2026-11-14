import type { ProviderId } from "@/config/catalog";
import { cn } from "@/lib/cn";

const COLORS: Record<ProviderId, string> = {
  openai: "var(--openai)",
  anthropic: "var(--anthropic)",
  google: "var(--google)",
};

/** The small coloured dot that identifies a provider throughout the app. */
export function ProviderDot({
  provider,
  className,
}: {
  provider: ProviderId;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: COLORS[provider] }}
    />
  );
}
