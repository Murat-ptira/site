/**
 * Adds credits to an account and records the change in the ledger.
 *
 *   npm run credits:grant -- --email ada@example.com --credits 1000
 *   npm run credits:grant -- --email ada@example.com --credits 250 --note "Goodwill top-up"
 */
import { parseArgs } from "node:util";

import { creditsToUnits, formatCredits } from "@/lib/credits";
import { grantCredits } from "@/server/billing/credits";
import { prisma } from "@/server/db";

const MAX_CREDITS_PER_GRANT = 1_000_000;

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file; rely on the environment.
  }

  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      credits: { type: "string" },
      note: { type: "string" },
    },
  });

  // Accounts are stored under the trimmed, lower-cased address.
  const email = values.email?.trim().toLowerCase();
  if (!email) throw new Error("--email is required.");

  const credits = Number(values.credits);
  const units = Number.isFinite(credits) ? creditsToUnits(credits) : 0;
  if (units <= 0 || credits > MAX_CREDITS_PER_GRANT) {
    throw new Error(
      `--credits must be a positive number of at most ${MAX_CREDITS_PER_GRANT}.`,
    );
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account uses the email ${email}.`);

  const entry = await prisma.$transaction((tx) =>
    grantCredits(tx, {
      userId: user.id,
      amount: units,
      type: "ADJUSTMENT",
      description: values.note?.trim() || "Credits added",
    }),
  );

  console.log(`Added    ${formatCredits(units)} credits to ${email}`);
  console.log(`Balance  ${formatCredits(entry.balanceAfter)} credits`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
