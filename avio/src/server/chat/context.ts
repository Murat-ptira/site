import "server-only";

import { LIMITS } from "@/config/limits";
import type { ChatMessage } from "@/server/ai/types";

export function systemPrompt(modelLabel: string): string {
  return [
    `You are ${modelLabel}, answering inside AVIO, a workspace where people use several AI models side by side.`,
    "Be accurate and direct.",
    "Format replies in Markdown when it helps, and put code in fenced blocks with a language tag.",
  ].join(" ");
}

export interface HistoryMessage {
  role: "USER" | "ASSISTANT";
  content: string;
  status: "PENDING" | "COMPLETE" | "ERROR";
  lane: number | null;
}

/**
 * Builds what one model gets to see: every user prompt, that model's own
 * finished replies (its lane), and the new prompt.
 *
 * Failed or unfinished replies are left out, which can leave two user turns in
 * a row; those are merged because providers expect alternating roles. The
 * oldest turns are dropped first to stay inside the context budget.
 */
export function buildContext(
  history: HistoryMessage[],
  lane: number,
  prompt: string,
): ChatMessage[] {
  const merged: ChatMessage[] = [];
  const push = (message: ChatMessage) => {
    const last = merged.at(-1);
    if (last && last.role === message.role) {
      last.content = `${last.content}\n\n${message.content}`;
    } else {
      merged.push({ ...message });
    }
  };

  for (const message of history) {
    if (message.role === "USER") {
      push({ role: "user", content: message.content });
    } else if (
      message.lane === lane &&
      message.status === "COMPLETE" &&
      message.content.trim()
    ) {
      push({ role: "assistant", content: message.content });
    }
  }
  push({ role: "user", content: prompt });

  // Walk back from the newest message; the new prompt is always kept.
  const kept: ChatMessage[] = [];
  let chars = 0;
  for (let index = merged.length - 1; index >= 0; index -= 1) {
    const message = merged[index];
    const isNewest = index === merged.length - 1;
    const overBudget =
      kept.length >= LIMITS.maxContextMessages ||
      chars + message.content.length > LIMITS.maxContextChars;
    if (!isNewest && overBudget) break;
    kept.unshift(message);
    chars += message.content.length;
  }
  // A conversation handed to a provider has to open with the user.
  while (kept.length > 1 && kept[0].role === "assistant") kept.shift();
  return kept;
}
