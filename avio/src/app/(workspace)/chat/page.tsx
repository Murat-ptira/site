import type { Metadata } from "next";

import { DraftThread } from "@/components/workspace/thread";

export const metadata: Metadata = { title: "New chat" };

export default function NewChatPage() {
  return <DraftThread mode="chat" />;
}
