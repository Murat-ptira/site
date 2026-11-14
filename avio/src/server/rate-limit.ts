import "server-only";

import { prisma } from "@/server/db";
import { HttpError } from "@/server/http/errors";

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter kept in Postgres, so the limit holds across every
 * server instance without extra infrastructure.
 *
 * The upsert is a single statement: concurrent requests for the same key queue
 * on the row lock and each sees the count left by the previous one.
 */
export async function consumeRateLimit(
  key: string,
  policy: RateLimitPolicy,
  cost = 1,
  now = Date.now(),
): Promise<RateLimitResult> {
  const windowStart = new Date(
    Math.floor(now / policy.windowMs) * policy.windowMs,
  );
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, ${cost})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" = EXCLUDED."windowStart"
          THEN "RateLimit"."count" + EXCLUDED."count"
        ELSE EXCLUDED."count"
      END,
      "windowStart" = EXCLUDED."windowStart"
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? cost);
  const windowEnd = windowStart.getTime() + policy.windowMs;
  return {
    allowed: count <= policy.limit,
    remaining: Math.max(0, policy.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  };
}

/** Throws a 429 when the caller is over the limit. */
export async function enforceRateLimit(
  key: string,
  policy: RateLimitPolicy,
  cost = 1,
): Promise<void> {
  const result = await consumeRateLimit(key, policy, cost);
  if (!result.allowed) {
    throw new HttpError(
      429,
      "rate_limited",
      `Too many requests. Try again in ${result.retryAfterSeconds} seconds.`,
      { headers: { "retry-after": String(result.retryAfterSeconds) } },
    );
  }
}
