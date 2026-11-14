import { sessionTokenFrom } from "@/server/auth/request";
import { expiredSessionCookie, revokeSession } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/http/request";
import { json, route } from "@/server/http/respond";

export const POST = route(async (request) => {
  assertSameOrigin(request);
  // Delete the session server-side so the token is dead even if it was copied.
  await revokeSession(sessionTokenFrom(request));
  return json({ ok: true }, { headers: { "set-cookie": expiredSessionCookie() } });
});
