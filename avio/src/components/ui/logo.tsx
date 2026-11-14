import { cn } from "@/lib/cn";

/**
 * The AVIO mark: an A without its crossbar, which doubles as a heading
 * marker pointing up.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-5", className)}
    >
      <path d="M4.5 19.5 12 4.5l7.5 15" />
      <path d="M12 13.25v.01" strokeWidth="2.75" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <LogoMark />
      <span className="text-[0.9375rem] font-semibold tracking-[0.16em]">AVIO</span>
    </span>
  );
}
