import { Prisma } from "@prisma/client";

const MAIN_TREASURY_ID = "main-treasury";

/**
 * Returns the single treasury row, creating it with a deterministic id when
 * the database is empty. The deterministic id makes first-time creation safe
 * when two requests race.
 */
export async function getOrCreateTreasury(
  tx: Prisma.TransactionClient
) {
  const existing = await tx.treasury.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return tx.treasury.upsert({
    where: { id: MAIN_TREASURY_ID },
    update: {},
    create: {
      id: MAIN_TREASURY_ID,
      name: "الخزينة الرئيسية",
      currentBalance: 0,
    },
  });
}
