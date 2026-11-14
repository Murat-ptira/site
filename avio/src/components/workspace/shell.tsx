"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { Sidebar } from "./sidebar";

const ShellContext = createContext<{ openSidebar: () => void }>({
  openSidebar: () => {},
});

/** The frame of the workspace: sidebar on the left, the current page on the right. */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // On small screens the sidebar is a drawer. Remembering the page it was
  // opened on closes it automatically as soon as the user navigates.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const drawerOpen = openedOn === pathname;
  const setDrawerOpen = (open: boolean) => setOpenedOn(open ? pathname : null);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 lg:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r border-line bg-panel transition-[translate,visibility] duration-200",
          "lg:visible lg:static lg:z-auto lg:max-w-none lg:translate-x-0",
          drawerOpen ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <Sidebar />
      </aside>
      <ShellContext value={{ openSidebar: () => setDrawerOpen(true) }}>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </ShellContext>
    </div>
  );
}

/** The bar across the top of every workspace page. */
export function TopBar({ children }: { children?: ReactNode }) {
  const { openSidebar } = useContext(ShellContext);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
      <IconButton aria-label="Open sidebar" onClick={openSidebar} className="lg:hidden">
        <Menu className="size-[1.125rem]" aria-hidden="true" />
      </IconButton>
      {children}
    </header>
  );
}
