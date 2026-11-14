import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SESSION_COOKIE, validateSessionToken, type AuthUser } from "./session";

/**
 * Session helpers for Server Components. `cache` makes repeated calls within
 * one render share a single database lookup.
 *
 * These read the request cookie, so call them from a component rendered inside
 * a <Suspense> boundary.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSessionToken(token);
});

export async function requireCurrentUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
