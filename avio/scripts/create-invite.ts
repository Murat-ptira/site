/**
 * Creates an invite code for sign-up.
 *
 *   npm run invite:create
 *   npm run invite:create -- --uses 5 --days 30 --note "Design team"
 */
import { parseArgs } from "node:util";

import { createInviteCode } from "@/server/auth/invite";
import { prisma } from "@/server/db";

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file; rely on the environment.
  }

  const { values } = parseArgs({
    options: {
      uses: { type: "string", default: "1" },
      days: { type: "string" },
      note: { type: "string" },
    },
  });

  const maxUses = Number(values.uses);
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10_000) {
    throw new Error("--uses must be a whole number between 1 and 10000.");
  }
  let expiresAt: Date | null = null;
  if (values.days !== undefined) {
    const days = Number(values.days);
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error("--days must be a positive number.");
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const invite = await createInviteCode({ maxUses, expiresAt, note: values.note ?? null });
  const origin = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  console.log(`Invite code  ${invite.code}`);
  console.log(`Uses         ${invite.maxUses}`);
  console.log(`Expires      ${invite.expiresAt ? invite.expiresAt.toISOString() : "never"}`);
  console.log(`Sign-up link ${origin}/signup?invite=${invite.code}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
