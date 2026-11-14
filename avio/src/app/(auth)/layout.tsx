import Link from "next/link";

import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center px-5 sm:px-8">
        <Link href="/" aria-label="AVIO home" className="rounded-md">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="animate-rise w-full max-w-sm">{children}</div>
      </main>
      <footer className="px-5 py-6 text-center text-[0.8125rem] text-subtle">
        One platform. Every AI. Your choice.
      </footer>
    </div>
  );
}
