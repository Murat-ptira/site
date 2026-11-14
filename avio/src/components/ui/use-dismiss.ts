"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";

/**
 * Closes a popover or menu on Escape, on a press outside `refs`, and when the
 * route it lives in is hidden (Next.js keeps hidden routes mounted, so an open
 * menu would otherwise still be open on return).
 */
export function useDismiss(
  open: boolean,
  close: () => void,
  refs: RefObject<HTMLElement | null>[],
): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!refs.some((ref) => ref.current?.contains(target))) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // `refs` holds stable ref objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);

  useLayoutEffect(() => close, [close]);
}
