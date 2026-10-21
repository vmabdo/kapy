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

/** Matches invoice numbers such as INV-20261021-12-8 or INV-2026-00001. */
const INVOICE_NUMBER_PATTERN = /INV-[A-Za-z0-9_-]+/g;

/**
 * Enriches older ledger rows — which only carry the invoice number in their
 * description — with the client (pharmacy/company) name.
 */
async function withClientNames<T extends { description: string | null }>(
  transactions: T[]
): Promise<T[]> {
  if (transactions.length === 0) return transactions;

  const invoiceNumbers = Array.from(
    new Set(
      transactions.flatMap(
        (tx) => tx.description?.match(INVOICE_NUMBER_PATTERN) ?? []
      )
    )
  );

  if (invoiceNumbers.length === 0) return transactions;

  const invoices = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: invoiceNumbers } },
    select: {
      invoiceNumber: true,
      pharmacy: { select: { name: true } },
    },
  });

  const clientNameByInvoice = new Map(
    invoices.map((invoice) => [invoice.invoiceNumber, invoice.pharmacy.name])
  );

  return transactions.map((tx) => {
    if (!tx.description) return tx;

    const names = Array.from(
      new Set(
        (tx.description.match(INVOICE_NUMBER_PATTERN) ?? [])
          .map((invoiceNumber) => clientNameByInvoice.get(invoiceNumber))
          .filter((name): name is string => Boolean(name))
          .filter((name) => !tx.description!.includes(name))
      )
    );

    if (names.length === 0) return tx;

    return {
      ...tx,
      description: `${tx.description} — ${names.join(" — ")}`,
    };
  });
}

export async function getTransactions(filters?: { type?: TransactionType; take?: number }) {
  const { type, take = 50 } = filters ?? {};

  const transactions = await prisma.transaction.findMany({
    where: {
      ...(type && { type }),
    },
    orderBy: { transactedAt: "desc" },
    take,
  });

  return withClientNames(transactions);
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
