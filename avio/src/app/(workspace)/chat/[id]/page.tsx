import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ThreadSkeleton } from "@/components/workspace/skeletons";
import { Thread } from "@/components/workspace/thread";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getConversationDetail } from "@/server/chat/conversations";

export const metadata: Metadata = { title: "Conversation" };

interface Props {
  params: Promise<{ id: string }>;
}

async function Conversation({ params }: Props) {
  const [{ id }, user] = await Promise.all([params, requireCurrentUser()]);
  // Scoped to the signed-in user: someone else's id is simply not found.
  const conversation = await getConversationDetail(user.id, id);
  if (!conversation) notFound();
  return <Thread key={conversation.id} mode={conversation.mode} initial={conversation} />;
}

export default function ConversationPage({ params }: Props) {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <Conversation params={params} />
    </Suspense>
  );
}
