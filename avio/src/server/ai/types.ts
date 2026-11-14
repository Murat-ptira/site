import "server-only";

import type { ProviderId, ReasoningEffort } from "@/config/catalog";

/**
 * The contract every provider adapter implements. The rest of the app talks
 * to providers only through this interface, so adding a provider means adding
 * one file in ./providers and one entry in ./registry.ts.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamChatParams {
  /** Provider model id, e.g. "gpt-6-luna". */
  model: string;
  system: string;
  /** Alternating turns, starting with the user and ending with the new prompt. */
  messages: ChatMessage[];
  maxOutputTokens: number;
  reasoningEffort?: ReasoningEffort;
  signal: AbortSignal;
}

export type ProviderStreamEvent =
  | { type: "text"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number };

export interface ProviderAdapter {
  readonly id: ProviderId;
  /** Whether an API key is present. Says nothing about whether it works. */
  isConfigured(): boolean;
  /** Ids of the models this key can use, as reported by the provider. */
  listModelIds(signal: AbortSignal): Promise<string[]>;
  /**
   * Streams one reply. Yields text as it arrives and the billed token counts
   * once known. Failures are thrown as ProviderError.
   */
  streamChat(params: StreamChatParams): AsyncIterable<ProviderStreamEvent>;
}
