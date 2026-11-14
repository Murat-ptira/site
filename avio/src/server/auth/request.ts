import "server-only";

import { parseCookies } from "@/server/http/cookies";
import { unauthenticated } from "@/server/http/errors";

import { SESSION_COOKIE, validateSessionToken, type AuthUser } from "./session";

/** Session helpers for route handlers, which receive the raw request. */

export function sessionTokenFrom(request: Request): string | undefined {
  return parseCookies(request.headers.get("cookie")).get(SESSION_COOKIE);
}

export async function getRequestUser(request: Request): Promise<AuthUser | null> {
  return validateSessionToken(sessionTokenFrom(request));
}

/** Resolves the signed-in user or fails the request with 401. */
export async function requireRequestUser(request: Request): Promise<AuthUser> {
  const user = await getRequestUser(request);
  if (!user) throw unauthenticated();
  return user;
}
