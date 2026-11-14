"use client";

import { Columns2, Ellipsis, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDismiss } from "@/components/ui/use-dismiss";
import { LIMITS } from "@/config/limits";
import { cn } from "@/lib/cn";
import type { ConversationDTO } from "@/lib/types";

import { useWorkspace } from "./workspace-provider";

const MENU_WIDTH = 168;
const MENU_HEIGHT = 84;

const menuItem =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[0.8125rem] transition-colors duration-100 hover:bg-hover focus-visible:bg-hover";

export function ConversationItem({
  conversation,
  active,
}: {
  conversation: ConversationDTO;
  active: boolean;
}) {
  const router = useRouter();
  const { renameConversation, deleteConversation } = useWorkspace();

  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuAt(null), []);
  useDismiss(menuAt !== null, closeMenu, [buttonRef, menuRef]);

  function toggleMenu() {
    if (menuAt) return closeMenu();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The list scrolls, so the menu is fixed to the viewport and flips upward
    // when there is no room below.
    const below = rect.bottom + 4;
    const top = below + MENU_HEIGHT > window.innerHeight ? rect.top - MENU_HEIGHT - 4 : below;
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
    setMenuAt({ top, left });
  }

  function startRename() {
    closeMenu();
    setTitle(conversation.title);
    setEditing(true);
  }

  async function commitRename() {
    setEditing(false);
    const next = title.trim();
    if (!next || next === conversation.title) return;
    try {
      await renameConversation(conversation.id, next);
    } catch {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2500);
    }
  }

  function onRenameKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setTitle(conversation.title);
      setEditing(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteConversation(conversation.id);
      setConfirming(false);
      if (active) router.push("/chat");
    } catch {
      setDeleting(false);
      setConfirming(false);
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2500);
    }
  }

  if (editing) {
    return (
      <li>
        <input
          autoFocus
          value={title}
          maxLength={LIMITS.maxTitleChars}
          aria-label="Conversation title"
          onChange={(event) => setTitle(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={commitRename}
          onKeyDown={onRenameKey}
          className="h-8 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[0.8125rem] text-fg"
        />
      </li>
    );
  }

  return (
    <li className="group relative">
      <Link
        href={`/chat/${conversation.id}`}
        aria-current={active ? "page" : undefined}
        // Already open: navigating again would reload it over a live stream.
        onClick={(event) => {
          if (active) event.preventDefault();
        }}
        className={cn(
          "flex h-8 items-center gap-2 rounded-lg pr-8 pl-2.5 text-[0.8125rem] transition-colors duration-150",
          active ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg",
          failed && "text-danger",
        )}
      >
        {conversation.mode === "compare" ? (
          <Columns2 className="size-3.5 shrink-0 text-subtle" aria-label="Comparison" />
        ) : null}
        <span className="truncate">{failed ? "Couldn't save changes" : conversation.title}</span>
      </Link>

      <button
        ref={buttonRef}
        type="button"
        aria-label={`Options for ${conversation.title}`}
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        onClick={toggleMenu}
        className={cn(
          "absolute top-1 right-1 flex size-6 items-center justify-center rounded-md text-subtle transition-opacity duration-150 hover:bg-hover hover:text-fg",
          menuAt
            ? "opacity-100"
            : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
        )}
      >
        <Ellipsis className="size-4" aria-hidden="true" />
      </button>

      {menuAt ? (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: menuAt.top, left: menuAt.left, width: MENU_WIDTH }}
          className="animate-pop fixed z-[60] rounded-xl border border-line-strong bg-raised p-1 shadow-pop"
        >
          <button type="button" role="menuitem" autoFocus onClick={startRename} className={menuItem}>
            <Pencil className="size-3.5 text-subtle" aria-hidden="true" />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              setConfirming(true);
            }}
            className={cn(menuItem, "text-danger")}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Delete this conversation?"
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      >
        “{conversation.title}” and all of its messages will be permanently
        deleted. Credits already spent on it are not refunded.
      </ConfirmDialog>
    </li>
  );
}
