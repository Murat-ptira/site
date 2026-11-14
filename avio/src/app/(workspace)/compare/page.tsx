import type { Metadata } from "next";

import { DraftThread } from "@/components/workspace/thread";

export const metadata: Metadata = { title: "Compare models" };

export default function ComparePage() {
  return <DraftThread mode="compare" />;
}
