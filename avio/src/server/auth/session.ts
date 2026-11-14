import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { ThemePreference } from "@/lib/types";
import { prisma, type Db } from "@/server/db";
import { serializeCookie } from "@/server/http/cookies";

export const SESSION_COOKIE = "avio_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The signed-in user, reduced to what the rest of the app may see. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  theme: ThemePreference;
}

const authUserSelect = { id: true, email: true, name: true, theme: true } as const;

function toAuthUser(row: {
  id: string;
  email: string;
  name: string;
  theme: string;
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    theme: row.theme.toLowerCase() as ThemePreference,
  };
}

// Only a hash of the token is stored, so a leaked database cannot be replayed
// as session cookies.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface NewSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(db: Db, userId: string): Promise<NewSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function validateSessionToken(
  token: string | null | undefined,
): Promise<AuthUser | null> {
  if (!token || token.length > 128) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, user: { select: authUserSelect } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return toAuthUser(session.user);
}

export async function revokeSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

const isProduction = process.env.NODE_ENV === "production";

export function sessionCookie(session: NewSession): string {
  return serializeCookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax",
    expires: session.expiresAt,
  });
}

export function expiredSessionCookie(): string {
  return serializeCookie(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax",
    maxAge: 0,
  });
}

export { toAuthUser, authUserSelect };
