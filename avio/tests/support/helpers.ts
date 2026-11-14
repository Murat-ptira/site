import { randomUUID } from "node:crypto";

import { resetAvailabilityCache } from "@/server/ai/availability";
import { createInviteCode } from "@/server/auth/invite";
import { SESSION_COOKIE, createSession } from "@/server/auth/session";
import { grantCredits } from "@/server/billing/credits";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";

export const ORIGIN = "http://localhost";

const TABLES = [
  "CreditTransaction",
  "UsageRecord",
  "Message",
  "Conversation",
  "Session",
  "User",
  "InviteCode",
  "AIProvider",
  "RateLimit",
];

/** Empties every table. Each suite calls this before each test. */
export async function resetDatabase(): Promise<void> {
  const list = TABLES.map((table) => `"${table}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  resetAvailabilityCache();
}

/** Changes configuration for the current test. */
export function setEnv(values: Record<string, string>): void {
  Object.assign(process.env, values);
  resetEnvCache();
  resetAvailabilityCache();
}

export interface TestUser {
  id: string;
  email: string;
  /** Cookie header value carrying this user's session. */
  cookie: string;
}

/**
 * Creates a user directly in the database (skipping the deliberately slow
 * password hash) with a live session and, optionally, a credit balance.
 */
export async function createUser(options: { credits?: number; name?: string } = {}): Promise<TestUser> {
  const email = `user-${randomUUID()}@example.com`;
  const user = await prisma.user.create({
    data: { email, name: options.name ?? "Test User", passwordHash: "not-a-real-hash" },
  });
  const credits = options.credits ?? 0;
  if (credits > 0) {
    await prisma.$transaction((tx) =>
      grantCredits(tx, { userId: user.id, amount: credits, type: "ADJUSTMENT", description: "test grant" }),
    );
  }
  const session = await createSession(prisma, user.id);
  return { id: user.id, email, cookie: `${SESSION_COOKIE}=${session.token}` };
}

export async function createInvite(maxUses = 1): Promise<string> {
  return (await createInviteCode({ maxUses })).code;
}

export async function balanceOf(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { creditBalance: true, reservedCredits: true },
  });
}

interface RequestOptions {
  cookie?: string;
  origin?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Builds a request the way a browser on our own origin would send it. */
export function request(method: string, path: string, options: RequestOptions = {}): Request {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN);
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  return new Request(`${ORIGIN}${path}`, { method, headers, body });
}

/** Route context for handlers with an `[id]` segment. */
export const withId = (id: string) => ({ params: Promise.resolve({ id }) });

export async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code ?? "";
}
