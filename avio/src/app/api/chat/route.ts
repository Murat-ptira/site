import { LIMITS } from "@/config/limits";
import { requireRequestUser } from "@/server/auth/request";
import { chatRequestSchema, keepAlive, startTurn, streamTurn } from "@/server/chat/turn";
import { env } from "@/server/env";
import { readJson } from "@/server/http/body";
import { assertSameOrigin } from "@/server/http/request";
import { route } from "@/server/http/respond";
import { enforceRateLimit } from "@/server/rate-limit";

// Long replies can stream for a while.
export const maxDuration = 300;

/**
 * Sends a prompt to one model (chat) or two (compare) and streams the replies
 * as newline-delimited JSON. See ChatStreamEvent for the event shapes.
 */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const user = await requireRequestUser(request);
  const input = await readJson(request, chatRequestSchema, LIMITS.chatBodyBytes);
  // Each model called counts against the limit, so a comparison costs two.
  await enforceRateLimit(
    `ai:${user.id}`,
    { limit: env().AI_RATE_LIMIT_PER_MINUTE, windowMs: 60 * 1000 },
    input.models.length,
  );

  const prepared = await startTurn(user, input);
  const { body, finished } = streamTurn(prepared);
  keepAlive(finished);

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      // Ask reverse proxies not to buffer the stream.
      "x-accel-buffering": "no",
    },
  });
});
