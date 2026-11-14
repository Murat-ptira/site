import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/current-user";

/**
 * Sends visitors who already have a valid session straight to the workspace.
 * Reads the session cookie, so render it inside <Suspense>.
 */
export async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/chat");
  return null;
}
