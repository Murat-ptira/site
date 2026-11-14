import "server-only";

import {
  CREDIT_POLICY,
  type CatalogModel,
  type ModelPricing,
} from "@/config/catalog";
import { UNITS_PER_CREDIT } from "@/lib/credits";

/**
 * Turns token counts into money. All prices come from src/config/catalog.ts.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface Cost {
  /** Estimated provider cost in millionths of a US dollar. */
  microUsd: number;
  /** What that cost is worth in credit units. */
  units: number;
}

const MICRO_USD_PER_UNIT =
  (CREDIT_POLICY.usdPerCredit * 1_000_000) / UNITS_PER_CREDIT;

// Trim binary floating-point noise (0.1 * 3 = 0.30000000000000004) before
// rounding up, so an exact amount is never bumped to the next unit.
const tidy = (value: number) => Number(value.toFixed(6));

export function costOf(pricing: ModelPricing, usage: TokenUsage): Cost {
  // Dollars per million tokens times tokens is exactly micro-dollars.
  const microUsd = tidy(
    usage.inputTokens * pricing.inputUsdPerMTok +
      usage.outputTokens * pricing.outputUsdPerMTok,
  );
  if (microUsd <= 0) return { microUsd: 0, units: 0 };
  const units = Math.ceil(tidy((microUsd * CREDIT_POLICY.markup) / MICRO_USD_PER_UNIT));
  // Anything that used tokens costs at least the smallest unit.
  return { microUsd: Math.ceil(microUsd), units: Math.max(1, units) };
}

/**
 * Upper-leaning token estimate for text we have not sent yet. Tokens average
 * about four bytes in English and about three in CJK scripts; dividing by
 * three keeps the estimate on the high side across languages.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 3);
}

const TOKENS_PER_MESSAGE_OVERHEAD = 8;
const TOKENS_PER_REQUEST_OVERHEAD = 32;

export function estimateInputTokens(texts: string[]): number {
  return texts.reduce(
    (total, text) => total + estimateTokens(text) + TOKENS_PER_MESSAGE_OVERHEAD,
    TOKENS_PER_REQUEST_OVERHEAD,
  );
}

/** Most a request to `model` can cost: estimated input plus a full-length reply. */
export function worstCaseCost(model: CatalogModel, inputTokens: number): Cost {
  return costOf(model.pricing, {
    inputTokens,
    outputTokens: model.maxOutputTokens,
  });
}

/** Price hint for model pickers, in credit units per 1,000 tokens. */
export function unitsPer1kTokens(usdPerMTok: number): number {
  // One thousand tokens at $x per million cost x * 1000 micro-dollars.
  return tidy((usdPerMTok * 1000 * CREDIT_POLICY.markup) / MICRO_USD_PER_UNIT);
}
