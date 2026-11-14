import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-5 text-center">
      <Logo />
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Link href="/" className={buttonClass({ variant: "secondary" })}>
        Back to AVIO
      </Link>
    </div>
  );
}
