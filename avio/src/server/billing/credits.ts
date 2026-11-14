import "server-only";

import { LIMITS } from "@/config/limits";
import type { CreditSummary } from "@/lib/types";
import type { CreditTransactionType } from "@/generated/prisma/client";
import { prisma, type Db, type Tx } from "@/server/db";

import { costOf, type TokenUsage } from "./pricing";
import type { ModelPricing } from "@/config/catalog";

/**
 * The credit ledger.
 *
 * Every AI request follows reserve -> settle:
 *
 *   1. Before calling a provider we place a hold for the worst-case cost. The
 *      hold only succeeds if `creditBalance - reservedCredits` covers it, so
 *      concurrent requests cannot jointly spend more than the balance.
 *   2. When the request ends, the hold is released and, on success, the real
 *      cost is deducted. A usage record leaves PENDING exactly once, which
 *      makes settlement idempotent: a retry or a duplicate callback is a no-op.
 *
 * `creditBalance` only ever changes together with a CreditTransaction row.
 */

export interface GrantInput {
  userId: string;
  /** Positive amount in credit units. */
  amount: number;
  type: Extract<
    CreditTransactionType,
    "SIGNUP_GRANT" | "ADJUSTMENT" | "PURCHASE" | "REFUND"
  >;
  description?: string;
  /**
   * Idempotency key for grants driven by an external event (for example a
   * payment provider's event id). A second grant with the same reference
   * violates a unique constraint and rolls back.
   */
  reference?: string;
}

/**
 * Adds credits to a balance and records the transaction. This is the entry
 * point a future payment integration should call.
 */
export async function grantCredits(tx: Tx, input: GrantInput) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("A credit grant must be a positive whole number of units.");
  }
  // The increment is one atomic UPDATE; its row lock is held until commit, so
  // `balanceAfter` is exact even when grants and charges interleave.
  const user = await tx.user.update({
    where: { id: input.userId },
    data: { creditBalance: { increment: input.amount } },
    select: { creditBalance: true },
  });
  return tx.creditTransaction.create({
    data: {
      userId: input.userId,
      type: input.type,
      amount: input.amount,
      balanceAfter: user.creditBalance,
      description: input.description,
      reference: input.reference,
    },
  });
}

/**
 * Places a hold on the user's balance. Returns false when the available
 * balance (balance minus existing holds) is too small.
 *
 * Implemented as a single conditional UPDATE so the check and the hold cannot
 * be separated by a concurrent request.
 */
export async function reserveCredits(
  tx: Tx,
  userId: string,
  amount: number,
): Promise<boolean> {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("A reservation must be a non-negative whole number of units.");
  }
  const updated = await tx.$executeRaw`
    UPDATE "User"
    SET "reservedCredits" = "reservedCredits" + ${amount}
    WHERE "id" = ${userId}
      AND "creditBalance" - "reservedCredits" >= ${amount}`;
  return updated === 1;
}

/**
 * Releases holds whose request never settled, for instance because the server
 * process died mid-stream. Runs opportunistically before new work for the user.
 */
export async function releaseStaleReservations(
  tx: Tx,
  userId: string,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - LIMITS.reservationTtlMs);
  // UPDATE ... RETURNING claims the stale records atomically. A late settlement
  // for one of them will find it no longer PENDING and do nothing.
  const stale = await tx.$queryRaw<
    { id: string; creditsReserved: number; messageId: string | null }[]
  >`
    UPDATE "UsageRecord"
    SET "status" = 'FAILED', "errorCode" = 'interrupted', "completedAt" = ${now}
    WHERE "userId" = ${userId}
      AND "status" = 'PENDING'
      AND "createdAt" < ${cutoff}
    RETURNING "id", "creditsReserved", "messageId"`;
  if (stale.length === 0) return 0;

  const released = stale.reduce((sum, row) => sum + row.creditsReserved, 0);
  await tx.user.update({
    where: { id: userId },
    data: { reservedCredits: { decrement: released } },
  });
  const messageIds = stale.flatMap((row) => (row.messageId ? [row.messageId] : []));
  if (messageIds.length > 0) {
    await tx.message.updateMany({
      where: { id: { in: messageIds }, status: "PENDING" },
      data: { status: "ERROR", errorCode: "interrupted" },
    });
  }
  return stale.length;
}

export interface SettleSuccessInput {
  usageRecordId: string;
  usage: TokenUsage;
  pricing: ModelPricing;
  /** The finished reply, saved onto the assistant message. */
  content: string;
  latencyMs: number;
}

export interface Settlement {
  /** Credit units charged. */
  charged: number;
  /** Balance after the charge. */
  balance: number;
  usage: TokenUsage;
}

/**
 * Charges a successful request and releases its hold. Returns null if the
 * record was already settled.
 */
export async function settleUsageSuccess(
  input: SettleSuccessInput,
): Promise<Settlement | null> {
  const cost = costOf(input.pricing, input.usage);
  return prisma.$transaction(async (tx) => {
    // Claim the record. Only one caller can move it out of PENDING, so a
    // usage record is never charged twice.
    const claimed = await tx.usageRecord.updateMany({
      where: { id: input.usageRecordId, status: "PENDING" },
      data: {
        status: "SUCCEEDED",
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        costMicroUsd: cost.microUsd,
        latencyMs: input.latencyMs,
        completedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return null;

    const record = await tx.usageRecord.findUniqueOrThrow({
      where: { id: input.usageRecordId },
      select: { userId: true, creditsReserved: true, messageId: true, model: true },
    });

    // Lock the user row so the balance cannot change under us.
    const [locked] = await tx.$queryRaw<
      { creditBalance: number; reservedCredits: number }[]
    >`SELECT "creditBalance", "reservedCredits" FROM "User" WHERE "id" = ${record.userId} FOR UPDATE`;
    if (!locked) throw new Error("User disappeared during settlement.");

    // The estimate behind a hold can be low. If the real cost is higher, the
    // request may also use balance that is not held by anyone else, but it can
    // never eat into another request's hold or push the balance below zero.
    const unreserved = Math.max(0, locked.creditBalance - locked.reservedCredits);
    const charged = Math.min(
      cost.units,
      record.creditsReserved + unreserved,
      locked.creditBalance,
    );

    const user = await tx.user.update({
      where: { id: record.userId },
      data: {
        creditBalance: { decrement: charged },
        reservedCredits: { decrement: record.creditsReserved },
      },
      select: { creditBalance: true },
    });
    await tx.usageRecord.update({
      where: { id: input.usageRecordId },
      data: { creditsCharged: charged },
    });
    // usageRecordId is unique on CreditTransaction: the database itself
    // refuses a second charge for the same request.
    await tx.creditTransaction.create({
      data: {
        userId: record.userId,
        type: "USAGE",
        amount: -charged,
        balanceAfter: user.creditBalance,
        description: record.model,
        usageRecordId: input.usageRecordId,
      },
    });
    if (record.messageId) {
      await tx.message.updateMany({
        where: { id: record.messageId },
        data: { content: input.content, status: "COMPLETE", errorCode: null },
      });
    }
    return { charged, balance: user.creditBalance, usage: input.usage };
  });
}

export interface SettleFailureInput {
  usageRecordId: string;
  errorCode: string;
  /** Whatever text arrived before the failure; kept so the user can read it. */
  partialContent: string;
  latencyMs: number;
}

/**
 * Releases the hold of a failed request without charging. Returns false if the
 * record was already settled.
 */
export async function settleUsageFailure(
  input: SettleFailureInput,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.usageRecord.updateMany({
      where: { id: input.usageRecordId, status: "PENDING" },
      data: {
        status: "FAILED",
        errorCode: input.errorCode,
        latencyMs: input.latencyMs,
        completedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return false;

    const record = await tx.usageRecord.findUniqueOrThrow({
      where: { id: input.usageRecordId },
      select: { userId: true, creditsReserved: true, messageId: true },
    });
    await tx.user.update({
      where: { id: record.userId },
      data: { reservedCredits: { decrement: record.creditsReserved } },
    });
    if (record.messageId) {
      await tx.message.updateMany({
        where: { id: record.messageId },
        data: {
          content: input.partialContent,
          status: "ERROR",
          errorCode: input.errorCode,
        },
      });
    }
    return true;
  });
}

export async function getCreditSummary(
  userId: string,
  db: Db = prisma,
): Promise<CreditSummary> {
  const [user, granted] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditBalance: true },
    }),
    db.creditTransaction.aggregate({
      where: { userId, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
  ]);
  return { balance: user.creditBalance, granted: granted._sum.amount ?? 0 };
}
