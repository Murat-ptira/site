import "server-only";

import { z } from "zod";

// Treat `FOO=""` the same as an unset variable.
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().optional());
const optionalUrl = z.preprocess(blankToUndefined, z.url().optional());

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: optionalUrl,
  REGISTRATION_MODE: z.preprocess(
    blankToUndefined,
    z.enum(["invite", "open", "closed"]).default("invite"),
  ),
  INITIAL_CREDITS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).max(10_000_000).default(5000),
  ),
  AI_RATE_LIMIT_PER_MINUTE: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(600).default(20),
  ),
  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  OPENAI_BASE_URL: optionalUrl,
  ANTHROPIC_BASE_URL: optionalUrl,
  GEMINI_BASE_URL: optionalUrl,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validated server configuration. Parsed on first use rather than at import
 * time so that `next build` does not need production secrets.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Name the variables, never print their values.
    const names = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid or missing environment variables: ${names.join(", ")}. See .env.example.`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: forget the parsed environment after changing process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
