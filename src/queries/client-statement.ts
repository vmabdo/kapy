import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildClientLedger,
  computeLedgerTotals,
  computeOpeningBalance,
  roundCurrency,
  type LedgerEntry,
  type LedgerTotals,
} from "@/lib/client-ledger";

export interface ClientStatementData {
  entries: LedgerEntry[];
  totals: LedgerTotals;
  /**
   * Balance immediately before the first ledger entry. Normally zero; a
   * non-zero value represents prior debt / a historical reconciliation.
   */
  openingBalance: number;
  /** Cash-refunded returns — shown for information only. */
  cashRefundsTotal: number;
  invoiceCount: number;
}

/**
 * Single source of truth for the client account statement.
 *
 * Rules:
 *  - Invoice debit = original amount before returns (never the mutated total).
 *  - Payment = credit.
 *  - Return on a CREDIT invoice = credit (reduces debt / creates client credit).
 *  - Return on a CASH invoice = memo only, because it was refunded in cash and
 *    never affected `pharmacy.currentBalance`.
 *  - Closing balance (unfiltered) = openingBalance + debit - credit and is
 *    reconciled to `pharmacy.currentBalance`.
 */
export async function getClientStatement(
  clientId: string,
  currentBalance: number
): Promise<ClientStatementData> {
  const [invoices, payments, returns] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        pharmacyId: clientId,
        // Fully returned invoices are marked CANCELLED, but their original
        // debit and the matching return credit must still appear in the ledger.
        OR: [
          { status: { not: InvoiceStatus.CANCELLED } },
          { returns: { some: {} } },
          { payments: { some: {} } },
        ],
      },
      select: {
        id: true,
        invoiceNumber: true,
        type: true,
        isLegacy: true,
        subtotal: true,
        discountAmount: true,
        total: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            product: { select: { name: true } },
          },
          take: 3,
        },
        returns: { select: { totalAmount: true } },
      },
      orderBy: { createdAt: "asc" },
    }),

    prisma.payment.findMany({
      where: { pharmacyId: clientId },
      select: {
        id: true,
        amount: true,
        method: true,
        referenceNo: true,
        notes: true,
        createdAt: true,
        invoice: { select: { invoiceNumber: true } },
        paymentItems: {
          select: {
            paidQuantity: true,
            product: { select: { name: true } },
          },
          take: 3,
        },
      },
      orderBy: { createdAt: "asc" },
    }),

    prisma.return.findMany({
      where: { pharmacyId: clientId },
      select: {
        id: true,
        returnNumber: true,
        totalAmount: true,
        createdAt: true,
        invoice: { select: { type: true, isLegacy: true } },
        items: {
          select: {
            quantity: true,
            product: { select: { name: true } },
          },
          take: 3,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const entries = buildClientLedger({ invoices, payments, returns });
  const totals = computeLedgerTotals(entries);
  const openingBalance = computeOpeningBalance(currentBalance, entries);
  const cashRefundsTotal = roundCurrency(
    entries.reduce((sum, entry) => sum + (entry.memoAmount ?? 0), 0)
  );

  return {
    entries,
    totals,
    openingBalance,
    cashRefundsTotal,
    invoiceCount: invoices.length,
  };
}
