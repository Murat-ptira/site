import type { ApiErrorBody } from "@/lib/types";

/** A failed API call, with the server's explanation. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const OFFLINE = "Can't reach AVIO. Check your connection and try again.";

/** Turns a non-2xx response into an ApiError. */
export async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error?.message) {
      return new ApiError(response.status, body.error.code, body.error.message, body.error.fields);
    }
  } catch {
    // Not JSON: fall through to a generic message.
  }
  return new ApiError(
    response.status,
    "unknown",
    response.status >= 500
      ? "The server ran into a problem. Please try again."
      : "The request could not be completed.",
  );
}

/** A dropped connection or unreachable server, as opposed to an API error. */
export function networkError(): ApiError {
  return new ApiError(0, "network", OFFLINE);
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** JSON fetch for our own API. Throws ApiError on any failure. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError();
  }
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}

/**
 * Leaves the current document for `path`. Used whenever the session changes
 * (sign-in, sign-out, expiry) instead of a client-side navigation, so nothing
 * held in memory for the previous session survives.
 */
export function hardNavigate(path: string): void {
  window.location.assign(path);
}

/** Sends the browser to the sign-in page, remembering where it was. */
export function redirectToLogin(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  hardNavigate(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * Only same-site paths are followed after sign-in, so a crafted link cannot
 * bounce a user to another site.
 */
export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/chat";
  }
  return value;
}
