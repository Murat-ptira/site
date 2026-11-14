import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkspaceShell } from "@/components/workspace/shell";
import { WorkspaceSkeleton } from "@/components/workspace/skeletons";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getCreditSummary } from "@/server/billing/credits";
import { listConversations } from "@/server/chat/conversations";
import { toUserDTO } from "@/server/chat/dto";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Everything inside the workspace belongs to one signed-in user. This is the
 * authoritative check for the pages: no valid session, no workspace. (The
 * proxy only pre-filters requests that have no session cookie at all.)
 */
async function Workspace({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  const [credits, conversations] = await Promise.all([
    getCreditSummary(user.id),
    listConversations(user.id),
  ]);
  return (
    <WorkspaceProvider
      user={toUserDTO(user)}
      initialCredits={credits}
      initialConversations={conversations}
    >
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  // The session is read per request, so it sits behind a Suspense boundary and
  // the skeleton is what gets prerendered.
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <Workspace>{children}</Workspace>
    </Suspense>
  );
}
