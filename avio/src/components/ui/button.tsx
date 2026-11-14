import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:opacity-45";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary/88",
  secondary: "border border-line-strong bg-raised text-fg hover:bg-hover",
  ghost: "text-muted hover:bg-hover hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger/88",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-[0.9375rem]",
};

/** Class names for anything that should look like a button, such as a link. */
export function buttonClass(
  options: { variant?: Variant; size?: Size; className?: string } = {},
): string {
  return cn(
    BASE,
    VARIANTS[options.variant ?? "primary"],
    SIZES[options.size ?? "md"],
    options.className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={buttonClass({ variant, size, className })}
      {...props}
    />
  );
}

/** Square icon-only button. Always give it an aria-label. */
export function IconButton({
  className,
  type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-fg disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}
