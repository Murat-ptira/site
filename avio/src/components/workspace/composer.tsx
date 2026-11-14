"use client";

import { ArrowUp, LoaderCircle } from "lucide-react";
import { useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from "react";

import { LIMITS } from "@/config/limits";
import { cn } from "@/lib/cn";

const MAX_HEIGHT = 220;

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  placeholder: string;
  /** Nothing can be sent at all, e.g. no model is available. */
  disabled: boolean;
  /** A reply is being generated; typing is fine, sending waits. */
  busy: boolean;
}

export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  busy,
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text up to a limit, then scroll.
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const length = value.length;
  const tooLong = length > LIMITS.maxMessageChars;
  const nearLimit = length > LIMITS.maxMessageChars * 0.9;
  const canSend = !disabled && !busy && !tooLong && value.trim().length > 0;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (canSend) onSend(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a line. Leave Enter alone while an input
    // method editor is composing a character.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "rounded-2xl border bg-surface transition-colors duration-150",
        tooLong ? "border-danger/60" : "border-line-strong focus-within:border-subtle",
        disabled && "opacity-60",
      )}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Message"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[0.9375rem] leading-relaxed text-fg placeholder:text-subtle focus-visible:outline-hidden disabled:cursor-not-allowed"
        style={{ maxHeight: MAX_HEIGHT }}
      />
      <div className="flex items-center justify-between gap-3 px-2.5 pt-1 pb-2.5">
        <span className="hidden pl-1.5 text-[0.6875rem] text-subtle sm:block">
          Enter to send · Shift + Enter for a new line
        </span>
        <div className="ml-auto flex items-center gap-3">
          {nearLimit ? (
            <span
              className={cn(
                "font-mono text-[0.6875rem] tabular-nums",
                tooLong ? "text-danger" : "text-subtle",
              )}
            >
              {length.toLocaleString("en-US")} / {LIMITS.maxMessageChars.toLocaleString("en-US")}
            </span>
          ) : null}
          <button
            type="submit"
            disabled={!canSend}
            aria-label={busy ? "Waiting for the reply" : "Send message"}
            className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-fg transition-opacity duration-150 hover:opacity-85 disabled:opacity-25"
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
