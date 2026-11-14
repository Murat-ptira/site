import { describe, expect, it } from "vitest";

import { CREDIT_POLICY, MODELS, PROVIDERS } from "@/config/catalog";
import { UNITS_PER_CREDIT } from "@/lib/credits";
import {
  costOf,
  estimateTokens,
  unitsPer1kTokens,
  worstCaseCost,
} from "@/server/billing/pricing";

describe("pricing", () => {
  it("turns token usage into provider cost and credit units", () => {
    // $2 in / $10 out per million tokens: 1,000 in + 500 out costs $0.007,
    // which is 7 credits at 1,000 credits per dollar.
    const cost = costOf(
      { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
      { inputTokens: 1000, outputTokens: 500 },
    );
    expect(cost).toEqual({ microUsd: 7000, units: 7 * UNITS_PER_CREDIT });
  });

  it("charges the smallest unit for tiny requests and nothing for no usage", () => {
    const pricing = { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 };
    expect(costOf(pricing, { inputTokens: 5, outputTokens: 1 }).units).toBe(1);
    expect(costOf(pricing, { inputTokens: 0, outputTokens: 0 })).toEqual({
      microUsd: 0,
      units: 0,
    });
  });

  it("does not round up because of floating point noise", () => {
    // 1.1 * 100 is 110.00000000000001 in binary floating point; a naive
    // ceil() of that amount in units would charge 12 instead of 11.
    expect(1.1 * 100).not.toBe(110);
    const cost = costOf(
      { inputUsdPerMTok: 1.1, outputUsdPerMTok: 0 },
      { inputTokens: 100, outputTokens: 0 },
    );
    expect(cost).toEqual({ microUsd: 110, units: 11 });
  });

  it("reserves enough for a full-length reply", () => {
    for (const model of MODELS) {
      const hold = worstCaseCost(model, 1000);
      const full = costOf(model.pricing, {
        inputTokens: 1000,
        outputTokens: model.maxOutputTokens,
      });
      expect(hold.units).toBe(full.units);
      // No real reply can cost more than the hold for the same input.
      const typical = costOf(model.pricing, { inputTokens: 1000, outputTokens: 600 });
      expect(typical.units).toBeLessThanOrEqual(hold.units);
    }
  });

  it("estimates unsent text on the high side", () => {
    expect(estimateTokens("a".repeat(300))).toBe(100);
    // Three bytes per character in UTF-8, roughly one token each.
    expect(estimateTokens("日本語")).toBe(3);
  });

  it("derives price hints from the same policy", () => {
    // $10 per million tokens is $0.01 per thousand: 10 credits.
    expect(unitsPer1kTokens(10)).toBe(
      (10 * UNITS_PER_CREDIT * CREDIT_POLICY.markup * 0.001) / CREDIT_POLICY.usdPerCredit,
    );
  });
});

describe("catalog", () => {
  it("lists every model once, with a known provider, a price and an output cap", () => {
    const ids = MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const model of MODELS) {
      expect(PROVIDERS[model.provider]).toBeDefined();
      expect(model.pricing.inputUsdPerMTok).toBeGreaterThan(0);
      expect(model.pricing.outputUsdPerMTok).toBeGreaterThan(0);
      expect(model.maxOutputTokens).toBeGreaterThan(0);
    }
  });
});
