import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { TopBar } from "@/components/workspace/shell";

export default function WorkspaceNotFound() {
  return (
    <>
      <TopBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 text-center">
        <div>
          <h1 className="text-xl font-medium tracking-[-0.02em]">Conversation not found</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            It may have been deleted, or the link may be wrong.
          </p>
        </div>
        <Link href="/chat" className={buttonClass({ variant: "secondary" })}>
          Start a new chat
        </Link>
      </div>
    </>
  );
}
