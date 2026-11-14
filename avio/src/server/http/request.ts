import "server-only";

import { createHash } from "node:crypto";

import { env } from "@/server/env";

import { HttpError } from "./errors";

/** The origin this request was addressed to, as the browser saw it. */
function expectedHost(request: Request): string {
  const configured = env().APP_URL;
  if (configured) return new URL(configured).host;
  // Behind a reverse proxy the public host arrives in X-Forwarded-Host.
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("host") || new URL(request.url).host;
}

/**
 * CSRF defence for state-changing requests, on top of the SameSite=Lax session
 * cookie. Browsers attach `Origin` to every cross-site POST/PATCH/DELETE, so a
 * mismatch means the request was not made by our own pages.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients send no Origin. Browsers that omit it still label
    // the request with Sec-Fetch-Site.
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      throw new HttpError(403, "bad_origin", "Cross-site request blocked.");
    }
    return;
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "bad_origin", "Cross-site request blocked.");
  }
  if (originHost !== expectedHost(request)) {
    throw new HttpError(403, "bad_origin", "Cross-site request blocked.");
  }
}

/**
 * Best-effort client address for rate limiting. Only meaningful behind a proxy
 * that sets X-Forwarded-For, which every mainstream host does.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** Short stable digest, so rate-limit keys never store an address or email. */
export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
