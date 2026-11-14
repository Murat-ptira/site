import { LIMITS } from "@/config/limits";
import { signUp, signupSchema } from "@/server/auth/service";
import { sessionCookie } from "@/server/auth/session";
import { toUserDTO } from "@/server/chat/dto";
import { readJson } from "@/server/http/body";
import { assertSameOrigin, clientAddress, fingerprint } from "@/server/http/request";
import { json, route } from "@/server/http/respond";
import { enforceRateLimit } from "@/server/rate-limit";

export const POST = route(async (request) => {
  assertSameOrigin(request);
  await enforceRateLimit(
    `signup:${fingerprint(clientAddress(request))}`,
    { limit: 20, windowMs: 60 * 60 * 1000 },
  );
  const input = await readJson(request, signupSchema, LIMITS.smallBodyBytes);
  const { user, session } = await signUp(input);
  return json(
    { user: toUserDTO(user) },
    { status: 201, headers: { "set-cookie": sessionCookie(session) } },
  );
});
