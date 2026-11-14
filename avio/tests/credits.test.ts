import { beforeEach, describe, expect, it } from "vitest";

import { LIMITS } from "@/config/limits";
import {
  grantCredits,
  releaseStaleReservations,
  reserveCredits,
  settleUsageFailure,
  settleUsageSuccess,
} from "@/server/billing/credits";
import { prisma } from "@/server/db";

import { balanceOf, createUser, resetDatabase } from "./support/helpers";

// $2 in / $10 out per million tokens.
const PRICING = { inputUsdPerMTok: 2, outputUsdPerMTok: 10 };
// 1,000 in + 500 out at that price is 700 units (7 credits).
const USAGE = { inputTokens: 1000, outputTokens: 500 };
const COST = 700;

beforeEach(async () => {
  await resetDatabase();
  await prisma.aIProvider.create({ data: { id: "openai", name: "OpenAI" } });
});

/** What starting a request does: place a hold and record the pending usage. */
async function startRequest(userId: string, hold: number) {
  return prisma.$transaction(async (tx) => {
    if (!(await reserveCredits(tx, userId, hold))) return null;
    return tx.usageRecord.create({
      data: { userId, providerId: "openai", model: "gpt-6-luna", creditsReserved: hold },
    });
  });
}

function settle(usageRecordId: string, usage = USAGE) {
  return settleUsageSuccess({
    usageRecordId,
    usage,
    pricing: PRICING,
    content: "reply",
    latencyMs: 10,
  });
}

describe("reserving credits", () => {
  it("places a hold without changing the balance", async () => {
    const user = await createUser({ credits: 1000 });
    expect(await startRequest(user.id, 400)).not.toBeNull();
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 1000, reservedCredits: 400 });
  });

  it("refuses a hold larger than what is still available", async () => {
    const user = await createUser({ credits: 1000 });
    await startRequest(user.id, 700);
    expect(await startRequest(user.id, 400)).toBeNull();
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 1000, reservedCredits: 700 });
  });

  it("never lets concurrent requests hold more than the balance", async () => {
    const user = await createUser({ credits: 100 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => startRequest(user.id, 30)),
    );
    // 100 units fit exactly three holds of 30.
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 100, reservedCredits: 90 });
  });
});

describe("settling a request", () => {
  it("charges the real cost, releases the hold and records the transaction", async () => {
    const user = await createUser({ credits: 1000 });
    const record = await startRequest(user.id, 900);

    const settlement = await settle(record!.id);
    expect(settlement).toMatchObject({ charged: COST, balance: 1000 - COST });
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 1000 - COST, reservedCredits: 0 });

    const usage = await prisma.usageRecord.findUniqueOrThrow({ where: { id: record!.id } });
    expect(usage).toMatchObject({
      status: "SUCCEEDED",
      inputTokens: 1000,
      outputTokens: 500,
      costMicroUsd: 7000,
      creditsCharged: COST,
    });
    const charges = await prisma.creditTransaction.findMany({ where: { type: "USAGE" } });
    expect(charges).toMatchObject([
      { userId: user.id, amount: -COST, balanceAfter: 1000 - COST, usageRecordId: record!.id },
    ]);
  });

  it("charges once when the same request is settled twice", async () => {
    const user = await createUser({ credits: 1000 });
    const record = await startRequest(user.id, 900);

    expect(await settle(record!.id)).not.toBeNull();
    expect(await settle(record!.id)).toBeNull();

    expect((await balanceOf(user.id)).creditBalance).toBe(1000 - COST);
    expect(await prisma.creditTransaction.count({ where: { type: "USAGE" } })).toBe(1);
  });

  it("charges once when settlements race each other", async () => {
    const user = await createUser({ credits: 1000 });
    const record = await startRequest(user.id, 900);

    const results = await Promise.all(Array.from({ length: 6 }, () => settle(record!.id)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 1000 - COST, reservedCredits: 0 });
    expect(await prisma.creditTransaction.count({ where: { type: "USAGE" } })).toBe(1);
  });

  it("releases the hold and charges nothing when a request fails", async () => {
    const user = await createUser({ credits: 1000 });
    const record = await startRequest(user.id, 900);

    expect(
      await settleUsageFailure({
        usageRecordId: record!.id,
        errorCode: "provider_unavailable",
        partialContent: "",
        latencyMs: 10,
      }),
    ).toBe(true);
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 1000, reservedCredits: 0 });

    // A late success for the same request can no longer charge.
    expect(await settle(record!.id)).toBeNull();
    expect((await balanceOf(user.id)).creditBalance).toBe(1000);
    expect(await prisma.creditTransaction.count({ where: { type: "USAGE" } })).toBe(0);
  });

  it("cannot spend another request's hold or overdraw the balance", async () => {
    const user = await createUser({ credits: 1000 });
    const first = await startRequest(user.id, 500);
    const second = await startRequest(user.id, 500);

    // Both replies turn out to cost 700, more than either hold of 500.
    expect(await settle(first!.id)).toMatchObject({ charged: 500, balance: 500 });
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 500, reservedCredits: 500 });
    expect(await settle(second!.id)).toMatchObject({ charged: 500, balance: 0 });
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 0, reservedCredits: 0 });
  });

  it("uses unreserved balance when a reply costs more than its hold", async () => {
    const user = await createUser({ credits: 1000 });
    const record = await startRequest(user.id, 500);
    expect(await settle(record!.id)).toMatchObject({ charged: COST, balance: 1000 - COST });
  });
});

describe("ledger integrity", () => {
  it("keeps the balance equal to the sum of its transactions", async () => {
    const user = await createUser({ credits: 50_000 });
    for (const outputTokens of [100, 2500, 40]) {
      const record = await startRequest(user.id, 4000);
      await settle(record!.id, { inputTokens: 300, outputTokens });
    }
    const failed = await startRequest(user.id, 100);
    await settleUsageFailure({
      usageRecordId: failed!.id,
      errorCode: "provider_timeout",
      partialContent: "",
      latencyMs: 1,
    });

    const [{ creditBalance, reservedCredits }, ledger] = await Promise.all([
      balanceOf(user.id),
      prisma.creditTransaction.aggregate({ where: { userId: user.id }, _sum: { amount: true } }),
    ]);
    expect(reservedCredits).toBe(0);
    expect(ledger._sum.amount).toBe(creditBalance);
  });

  it("is protected by the database against negative balances", async () => {
    const user = await createUser({ credits: 10 });
    await expect(
      prisma.user.update({ where: { id: user.id }, data: { creditBalance: -1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.user.update({ where: { id: user.id }, data: { reservedCredits: -1 } }),
    ).rejects.toThrow();
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 10, reservedCredits: 0 });
  });

  it("applies a grant with the same external reference only once", async () => {
    const user = await createUser();
    const grant = () =>
      prisma.$transaction((tx) =>
        grantCredits(tx, {
          userId: user.id,
          amount: 2500,
          type: "PURCHASE",
          reference: "payment-event-1",
        }),
      );

    await grant();
    await expect(grant()).rejects.toThrow();

    expect((await balanceOf(user.id)).creditBalance).toBe(2500);
    expect(await prisma.creditTransaction.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rejects grants that are not a positive whole amount", async () => {
    const user = await createUser();
    for (const amount of [0, -5, 1.5]) {
      await expect(
        prisma.$transaction((tx) =>
          grantCredits(tx, { userId: user.id, amount, type: "ADJUSTMENT" }),
        ),
      ).rejects.toThrow();
    }
    expect((await balanceOf(user.id)).creditBalance).toBe(0);
  });
});

describe("abandoned requests", () => {
  it("releases holds whose request never settled, and only those", async () => {
    const user = await createUser({ credits: 1000 });
    const stale = await startRequest(user.id, 300);
    const fresh = await startRequest(user.id, 200);
    await prisma.usageRecord.update({
      where: { id: stale!.id },
      data: { createdAt: new Date(Date.now() - LIMITS.reservationTtlMs - 1000) },
    });

    const released = await prisma.$transaction((tx) => releaseStaleReservations(tx, user.id));
    expect(released).toBe(1);
    expect(await balanceOf(user.id)).toEqual({ creditBalance: 1000, reservedCredits: 200 });

    const records = await prisma.usageRecord.findMany({ orderBy: { creditsReserved: "desc" } });
    expect(records).toMatchObject([
      { id: stale!.id, status: "FAILED", errorCode: "interrupted" },
      { id: fresh!.id, status: "PENDING" },
    ]);

    // If the abandoned request does finish after all, it is not charged late.
    expect(await settle(stale!.id)).toBeNull();
    expect((await balanceOf(user.id)).creditBalance).toBe(1000);
  });
});
