import { prisma } from "@/lib/prisma";
import { TransactionType } from "@prisma/client";

// ─── Treasury ─────────────────────────────────────────────────

export async function getTreasury() {
  let treasury = await prisma.treasury.findFirst();
  
  if (!treasury) {
    treasury = await prisma.treasury.create({
      data: { name: "الخزينة الرئيسية", currentBalance: 0 },
    });
  }
  
  return treasury;
}

export async function getTransactions(filters?: { type?: TransactionType; take?: number }) {
  const { type, take = 50 } = filters ?? {};

  return prisma.transaction.findMany({
    where: {
      ...(type && { type }),
    },
    orderBy: { transactedAt: "desc" },
    take,
  });
}

export async function getTreasuryStats() {
  const treasury = await getTreasury();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayIn, todayOut] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: TransactionType.CASH_IN, transactedAt: { gte: today } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: TransactionType.CASH_OUT, transactedAt: { gte: today } },
      _sum: { amount: true },
    }),
  ]);

  return {
    currentBalance: treasury.currentBalance,
    todayIn: todayIn._sum.amount ?? 0,
    todayOut: todayOut._sum.amount ?? 0,
  };
}
