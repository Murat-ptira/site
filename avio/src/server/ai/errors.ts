import "server-only";

import type { ProviderId } from "@/config/catalog";
import type { ResponseErrorCode } from "@/lib/errors";

/** A provider failure, classified so the UI can explain it. */
export class ProviderError extends Error {
  readonly code: ResponseErrorCode;
  readonly provider: ProviderId;
  readonly status?: number;

  constructor(
    code: ResponseErrorCode,
    provider: ProviderId,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(`${provider}: ${code}`, { cause: options.cause });
    this.name = "ProviderError";
    this.code = code;
    this.provider = provider;
    this.status = options.status;
  }
}

/** Classifies an HTTP status the same way for every provider. */
export function codeForStatus(status: number | undefined): ResponseErrorCode {
  if (status === undefined) return "internal";
  if (status === 401 || status === 403) return "provider_auth";
  if (status === 404) return "model_unavailable";
  if (status === 408) return "provider_timeout";
  if (status === 413) return "context_too_long";
  if (status === 429) return "provider_rate_limited";
  if (status === 400 || status === 422) return "provider_bad_request";
  if (status >= 500) return "provider_unavailable";
  return "internal";
}

/** Refines a status-based code using the provider's error text. */
export function codeForFailure(
  status: number | undefined,
  detail: string,
): ResponseErrorCode {
  const text = detail.toLowerCase();
  if (/insufficient_quota|exceeded your current quota|credit balance|billing/.test(text)) {
    return "provider_quota";
  }
  if (/context.{0,20}(length|window)|too many tokens|prompt is too long|maximum context/.test(text)) {
    return "context_too_long";
  }
  if (status === 400 && /api.?key/.test(text)) return "provider_auth";
  return codeForStatus(status);
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/** fetch() reports unreachable hosts and dropped connections as TypeError. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}
