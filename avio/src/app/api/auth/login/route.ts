import { LIMITS } from "@/config/limits";
import { logIn, loginSchema } from "@/server/auth/service";
import { sessionCookie } from "@/server/auth/session";
import { toUserDTO } from "@/server/chat/dto";
import { readJson } from "@/server/http/body";
import { assertSameOrigin, clientAddress, fingerprint } from "@/server/http/request";
import { json, route } from "@/server/http/respond";
import { enforceRateLimit } from "@/server/rate-limit";

const WINDOW_MS = 10 * 60 * 1000;

export const POST = route(async (request) => {
  assertSameOrigin(request);
  // Two brakes on password guessing: one per address, one per account.
  await enforceRateLimit(
    `login:addr:${fingerprint(clientAddress(request))}`,
    { limit: 30, windowMs: WINDOW_MS },
  );
  const input = await readJson(request, loginSchema, LIMITS.smallBodyBytes);
  await enforceRateLimit(
    `login:acct:${fingerprint(input.email)}`,
    { limit: 10, windowMs: WINDOW_MS },
  );
  const { user, session } = await logIn(input);
  return json(
    { user: toUserDTO(user) },
    { headers: { "set-cookie": sessionCookie(session) } },
  );
});
