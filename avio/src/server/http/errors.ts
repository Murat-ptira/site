import "server-only";

export interface HttpErrorOptions {
  /** Per-field validation messages, keyed by field name. */
  fields?: Record<string, string>;
  headers?: Record<string, string>;
}

/** An error that is safe to show to the caller as-is. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    options: HttpErrorOptions = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.fields = options.fields;
    this.headers = options.headers;
  }
}

export const unauthenticated = () =>
  new HttpError(401, "unauthenticated", "Sign in to continue.");

export const notFound = (what: string) =>
  new HttpError(404, "not_found", `${what} not found.`);

export const payloadTooLarge = () =>
  new HttpError(413, "payload_too_large", "The request is too large.");
