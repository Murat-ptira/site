import "server-only";

import type { ProviderId } from "@/config/catalog";

import { anthropicAdapter } from "./providers/anthropic";
import { googleAdapter } from "./providers/google";
import { openaiAdapter } from "./providers/openai";
import type { ProviderAdapter } from "./types";

/**
 * Every provider the app can talk to. To add one: write an adapter in
 * ./providers, register it here, and list its models in src/config/catalog.ts.
 */
const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
};

export function getAdapter(provider: ProviderId): ProviderAdapter {
  return ADAPTERS[provider];
}
