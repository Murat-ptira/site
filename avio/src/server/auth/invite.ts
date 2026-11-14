import "server-only";

import { randomInt } from "node:crypto";

import { prisma, type Tx } from "@/server/db";
import { HttpError } from "@/server/http/errors";

// Crockford base32: no I, L, O or U, so codes survive being read aloud.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `AVIO-XXXX-XXXX-XXXX`, 60 bits of randomness. */
export function generateInviteCode(): string {
  const groups = Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""),
  );
  return `AVIO-${groups.join("-")}`;
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function createInviteCode(options: {
  maxUses?: number;
  expiresAt?: Date | null;
  note?: string | null;
} = {}) {
  return prisma.inviteCode.create({
    data: {
      code: generateInviteCode(),
      maxUses: options.maxUses ?? 1,
      expiresAt: options.expiresAt ?? null,
      note: options.note ?? null,
    },
  });
}

/**
 * Consumes one use of an invite code and returns its id.
 *
 * The conditional UPDATE is atomic, so two people racing for the last use of a
 * code cannot both get in. Run it in the transaction that creates the user:
 * if sign-up fails afterwards, the use is rolled back with it.
 */
export async function redeemInviteCode(
  tx: Tx,
  code: string | undefined,
): Promise<string> {
  const invalid = new HttpError(
    403,
    "invalid_invite",
    "This invite code is not valid or has already been used.",
    { fields: { inviteCode: "This invite code is not valid." } },
  );
  if (!code) throw invalid;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "InviteCode"
    SET "useCount" = "useCount" + 1
    WHERE "code" = ${normalizeInviteCode(code)}
      AND "useCount" < "maxUses"
      AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
    RETURNING "id"`;
  const id = rows[0]?.id;
  if (!id) throw invalid;
  return id;
}
