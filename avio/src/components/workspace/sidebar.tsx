"use client";

import { Columns2, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { recencyGroup, type RecencyGroup } from "@/lib/format";
import type { ConversationDTO } from "@/lib/types";

import { ConversationItem } from "./conversation-item";
import { CreditMeter } from "./credit-meter";
import { UserMenu } from "./user-menu";
import { useWorkspace } from "./workspace-provider";

const GROUP_ORDER: RecencyGroup[] = ["Today", "Yesterday", "Previous 7 days", "Older"];

function ActionLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors duration-150",
        active ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}

export function Sidebar() {
  const { conversations } = useWorkspace();
  const pathname = usePathname();

  const groups = useMemo(() => {
    const byGroup = new Map<RecencyGroup, ConversationDTO[]>();
    for (const conversation of conversations) {
      const group = recencyGroup(conversation.updatedAt);
      byGroup.set(group, [...(byGroup.get(group) ?? []), conversation]);
    }
    return GROUP_ORDER.flatMap((group) => {
      const items = byGroup.get(group);
      return items ? [{ group, items }] : [];
    });
  }, [conversations]);

  return (
    <>
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/chat" aria-label="AVIO workspace" className="rounded-md">
          <Logo />
        </Link>
      </div>

      <div className="flex flex-col gap-0.5 px-3">
        <ActionLink href="/chat" active={pathname === "/chat"}>
          <SquarePen className="size-4" aria-hidden="true" />
          New chat
        </ActionLink>
        <ActionLink href="/compare" active={pathname === "/compare"}>
          <Columns2 className="size-4" aria-hidden="true" />
          Compare models
        </ActionLink>
      </div>

      <nav aria-label="Conversations" className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {groups.length === 0 ? (
          <p className="px-2.5 py-2 text-[0.8125rem] leading-relaxed text-subtle">
            Conversations you start will be saved here.
          </p>
        ) : (
          groups.map(({ group, items }) => (
            <section key={group} className="mb-4 last:mb-0">
              <h2 className="px-2.5 pb-1.5 text-[0.6875rem] font-medium tracking-wide text-subtle uppercase">
                {group}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {items.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    active={pathname === `/chat/${conversation.id}`}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <CreditMeter />
        <UserMenu />
      </div>
    </>
  );
}
