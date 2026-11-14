import "server-only";

import type { z } from "zod";

import { HttpError, payloadTooLarge } from "./errors";

/**
 * Reads the body without trusting Content-Length: the stream is abandoned as
 * soon as it grows past `maxBytes`.
 */
async function readLimited(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validationError(error: z.ZodError): HttpError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  const first = error.issues[0]?.message ?? "The request is invalid.";
  return new HttpError(400, "validation", first, { fields });
}

/** Parses and validates a size-limited JSON body. */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes: number,
): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Requests must be sent as JSON.",
    );
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw payloadTooLarge();
  }
  const text = await readLimited(request, maxBytes);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "The request body is not valid JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}
