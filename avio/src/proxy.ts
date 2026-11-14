import { NextResponse, type NextRequest } from "next/server";

// Kept in sync with SESSION_COOKIE in src/server/auth/session.ts. It is not
// imported because this file must stay free of server-only dependencies.
const SESSION_COOKIE = "avio_session";

/**
 * An optimistic check only: visitors without a session cookie are sent to
 * sign-in before any workspace page renders. The cookie is not validated here;
 * every page and API route verifies the session against the database itself.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/chat/:path*", "/compare/:path*", "/settings/:path*"],
};
