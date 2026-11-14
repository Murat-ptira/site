import "server-only";

import { unstable_rethrow } from "next/navigation";

import { HttpError } from "./errors";

const NO_STORE = { "cache-control": "no-store" };

export function json(
  data: unknown,
  init: { status?: number; headers?: HeadersInit } = {},
): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(NO_STORE)) headers.set(key, value);
  return Response.json(data, { status: init.status ?? 200, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      },
      { status: error.status, headers: error.headers },
    );
  }
  // Log the failure without request data, which may hold passwords or prompts.
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[api] unhandled ${name}: ${message}`);
  return json(
    {
      error: {
        code: "internal",
        message: "Something went wrong on our side. Please try again.",
      },
    },
    { status: 500 },
  );
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Wraps a route handler so thrown errors become JSON error responses. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      // Next.js signals some control flow (such as opting out of prerendering)
      // by throwing; those are not failures and must reach the framework.
      unstable_rethrow(error);
      return errorResponse(error);
    }
  };
}
