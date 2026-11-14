import "server-only";

import { isProviderId, modelLabel } from "@/config/catalog";
import type {
  CreditTransactionDTO,
  UsageByModelDTO,
  UsageOverviewDTO,
} from "@/lib/types";
import { prisma } from "@/server/db";

import { getCreditSummary } from "./credits";

/** Everything the settings page shows about one user's usage. */
export async function getUsageOverview(userId: string): Promise<UsageOverviewDTO> {
  const succeeded = { userId, status: "SUCCEEDED" as const };
  const [credits, totals, grouped, transactions] = await Promise.all([
    getCreditSummary(userId),
    prisma.usageRecord.aggregate({
      where: succeeded,
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, creditsCharged: true },
    }),
    prisma.usageRecord.groupBy({
      by: ["providerId", "model"],
      where: succeeded,
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, creditsCharged: true },
    }),
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const byModel: UsageByModelDTO[] = grouped
    .flatMap((row) =>
      isProviderId(row.providerId)
        ? [
            {
              provider: row.providerId,
              model: row.model,
              modelLabel: modelLabel(row.model),
              requests: row._count._all,
              inputTokens: row._sum.inputTokens ?? 0,
              outputTokens: row._sum.outputTokens ?? 0,
              credits: row._sum.creditsCharged ?? 0,
            },
          ]
        : [],
    )
    .sort((a, b) => b.credits - a.credits);

  return {
    credits,
    totals: {
      requests: totals._count._all,
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      credits: totals._sum.creditsCharged ?? 0,
    },
    byModel,
    transactions: transactions.map(
      (row): CreditTransactionDTO => ({
        id: row.id,
        type: row.type.toLowerCase() as CreditTransactionDTO["type"],
        amount: row.amount,
        balanceAfter: row.balanceAfter,
        description: row.description,
        createdAt: row.createdAt.toISOString(),
      }),
    ),
  };
}
