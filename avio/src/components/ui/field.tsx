import type { InputHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Validation message shown under the input. */
  error?: string;
  hint?: string;
  ref?: Ref<HTMLInputElement>;
}

/** A labelled text input with room for a hint or an error. */
export function Field({ label, error, hint, id, name, className, ...props }: FieldProps) {
  const inputId = id ?? name;
  const messageId = error || hint ? `${inputId}-message` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[0.8125rem] font-medium text-fg">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={cn(
          "h-10 w-full rounded-lg border bg-surface px-3 text-sm text-fg transition-colors duration-150 placeholder:text-subtle",
          error ? "border-danger/70" : "border-line-strong hover:border-subtle",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={messageId} className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-[0.8125rem] text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
