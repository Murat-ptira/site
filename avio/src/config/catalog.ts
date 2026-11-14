/**
 * The catalog: every provider and model AVIO knows about, what each model
 * costs, and how provider cost turns into credits.
 *
 * This file is the single place to edit when a provider changes a price or
 * ships a model. Nothing else in the codebase hardcodes a model id or a price.
 *
 * A model listed here is only offered to users when its provider's API key is
 * configured and the provider confirms the key can use that model
 * (see src/server/ai/availability.ts).
 */

export type ProviderId = "openai" | "anthropic" | "google";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** Environment variable that holds the provider's API key. */
  apiKeyEnv: "OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GEMINI_API_KEY";
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: { id: "openai", name: "OpenAI", apiKeyEnv: "OPENAI_API_KEY" },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  google: { id: "google", name: "Google Gemini", apiKeyEnv: "GEMINI_API_KEY" },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS;
}

/** List prices in US dollars per one million tokens. */
export interface ModelPricing {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export type ModelTier = "flagship" | "balanced" | "fast";

export interface CatalogModel {
  /** The id sent to the provider's API. */
  id: string;
  provider: ProviderId;
  label: string;
  tier: ModelTier;
  description: string;
  /**
   * Hard cap on generated tokens per reply, including any hidden reasoning
   * tokens the provider bills as output. It bounds the worst-case cost that is
   * reserved from the user's balance before a request is sent.
   */
  maxOutputTokens: number;
  /**
   * For models that think before answering: how much effort to spend. Chat
   * replies default to "low" to keep latency and hidden-token cost down.
   * Leave unset for models without such a setting.
   */
  reasoningEffort?: ReasoningEffort;
  pricing: ModelPricing;
}

export type ReasoningEffort = "low" | "medium" | "high";

/** How provider cost is converted into credits. */
export const CREDIT_POLICY = {
  /** Provider cost covered by one credit. 0.001 means 1,000 credits per dollar. */
  usdPerCredit: 0.001,
  /** Multiplier applied on top of provider cost. 1 passes cost through unchanged. */
  markup: 1,
} as const;

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

// Prices are the providers' published standard, short-context rates,
// last checked on 2026-11-14.
export const MODELS: CatalogModel[] = [
  {
    id: "gpt-6-astra",
    provider: "openai",
    reasoningEffort: "low",
    label: "GPT-6 Astra",
    tier: "flagship",
    description: "Most capable, for demanding work",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  },
  {
    id: "gpt-6.1-sol",
    provider: "openai",
    reasoningEffort: "low",
    label: "GPT-6.1 Sol",
    tier: "balanced",
    description: "Near-flagship quality at lower cost",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  },
  {
    id: "gpt-6.1-terra",
    provider: "openai",
    reasoningEffort: "low",
    label: "GPT-6.1 Terra",
    tier: "balanced",
    description: "Everyday balance of quality and cost",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    reasoningEffort: "low",
    label: "GPT-6 Luna",
    tier: "fast",
    description: "Fast and inexpensive",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 },
  },
  {
    id: "claude-fable-5-2",
    provider: "anthropic",
    label: "Claude Fable 5.2",
    tier: "flagship",
    description: "Most capable, for the hardest problems",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 8, outputUsdPerMTok: 40 },
  },
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    tier: "flagship",
    description: "Strong all-rounder for complex work",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    tier: "balanced",
    description: "Best mix of speed and intelligence",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    label: "Claude Haiku 5.5",
    tier: "fast",
    description: "Fastest, lowest cost",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 },
  },
  {
    id: "gemini-3.1-pro-preview",
    provider: "google",
    reasoningEffort: "low",
    label: "Gemini 3.1 Pro",
    tier: "flagship",
    description: "Deep reasoning (preview)",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 12 },
  },
  {
    id: "gemini-3.8-flash",
    provider: "google",
    reasoningEffort: "low",
    label: "Gemini 3.8 Flash",
    tier: "balanced",
    description: "Fast general-purpose model",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    // Standard rate. Google bills half of this until 2026-12-31.
    pricing: { inputUsdPerMTok: 1.5, outputUsdPerMTok: 7.5 },
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "google",
    reasoningEffort: "low",
    label: "Gemini 3.5 Flash-Lite",
    tier: "fast",
    description: "Lightweight and inexpensive",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    pricing: { inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5 },
  },
];

const MODELS_BY_ID = new Map(MODELS.map((model) => [model.id, model]));

export function findModel(id: string): CatalogModel | undefined {
  return MODELS_BY_ID.get(id);
}

/** Display name for a model id, including ids that have left the catalog. */
export function modelLabel(id: string): string {
  return MODELS_BY_ID.get(id)?.label ?? id;
}
