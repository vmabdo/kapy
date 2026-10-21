import type { InvoiceType } from "@prisma/client";

export type LedgerEntryType = "INVOICE" | "PAYMENT" | "RETURN";

/**
 * One row in a client account statement.
 *
 * `debit` and `credit` are the ONLY values that may change the client's
 * outstanding balance. Informational rows (e.g. cash-refunded returns) must
 * keep both at zero and carry their amount in `memoAmount` instead.
 */
export interface LedgerEntry {
  id: string;
  /** Full timestamp used for ordering, date filtering and display. */
  occurredAt: Date;
  type: LedgerEntryType;
  reference: string;
  description: string;
  /** Increases the client's debt (original invoice amount, before returns). */
  debit: number;
  /** Decreases the client's debt (payments + debt-reducing returns). */
  credit: number;
  /** Amount shown for information only — never included in the balance. */
  memoAmount?: number;
  /** True for returns on CASH invoices, which are settled in cash. */
  isCashRefund?: boolean;
}

export interface LedgerInvoiceSource {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  isLegacy: boolean;
  subtotal: unknown;
  discountAmount: unknown;
  total: unknown;
  createdAt: Date;
  items: Array<{ quantity: unknown; product: { name: string } }>;
  /** Used to reconstruct the original gross amount for old/corrupt rows. */
  returns?: Array<{ totalAmount: unknown }>;
}

export interface LedgerPaymentSource {
  id: string;
  amount: unknown;
  method: string;
  referenceNo: string | null;
  notes: string | null;
  createdAt: Date;
  invoice: { invoiceNumber: string };
  paymentItems: Array<{
    paidQuantity: unknown;
    product: { name: string };
  }>;
}

export interface LedgerReturnSource {
  id: string;
  returnNumber: string;
  totalAmount: unknown;
  createdAt: Date;
  invoice: { type: InvoiceType; isLegacy: boolean };
  items: Array<{ quantity: unknown; product: { name: string } }>;
}

export interface LedgerTotals {
  debit: number;
  credit: number;
  net: number;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
  CHECK: "شيك",
};

/**
 * Deterministic ordering for identical timestamps.
 * Invoices must always be posted before returns/payments so the running
 * balance never dips artificially out of order.
 */
const ENTRY_PRIORITY: Record<LedgerEntryType, number> = {
  INVOICE: 0,
  RETURN: 1,
  PAYMENT: 2,
};

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeItems(
  items: Array<{ quantity: unknown; product: { name: string } }>
): string {
  return items
    .map((item) => `${toNumber(item.quantity)} × ${item.product.name}`)
    .join("، ");
}

export function getInvoiceReturnedAmount(invoice: LedgerInvoiceSource): number {
  return roundCurrency(
    (invoice.returns ?? []).reduce(
      (sum, returned) => sum + toNumber(returned.totalAmount),
      0
    )
  );
}

/**
 * The invoice debit row must show the ORIGINAL invoice amount before returns.
 *
 * `processInvoiceReturn()` mutates `invoice.total` downward for backward
 * compatibility with the rest of the app, but `subtotal` and `discountAmount`
 * are frozen at invoice creation and are never touched by a return. For legacy
 * debt invoices the `subtotal` itself is the original registered debt.
 *
 * Reconstructing the gross amount here prevents the classic double deduction:
 *   Debit  = original invoice (1,792.50 + 243.75 = 2,036.25)
 *   Credit = return (243.75)
 * instead of debiting the already-reduced 1,792.50 and crediting 243.75 again.
 */
export function getInvoiceOriginalTotal(invoice: LedgerInvoiceSource): number {
  const subtotal = toNumber(invoice.subtotal);
  const discount = toNumber(invoice.discountAmount);
  const hasStableSubtotal = subtotal > 0 || discount > 0;

  if (hasStableSubtotal) {
    return roundCurrency(
      Math.max(0, invoice.isLegacy ? subtotal : subtotal - discount)
    );
  }

  // Fallback for old/corrupt rows where subtotal was never populated.
  return roundCurrency(toNumber(invoice.total) + getInvoiceReturnedAmount(invoice));
}

/**
 * Returns on CREDIT invoices reduce the client's receivable balance (or create
 * a credit balance if the invoice was already paid). Returns on CASH invoices
 * are cash refunds: the client already paid in full, so the refund must never
 * be posted as a credit against outstanding debt.
 */
export function isDebtReducingReturn(invoiceType: InvoiceType): boolean {
  return invoiceType === "CREDIT";
}

export function sortLedgerEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    const byTimestamp = a.occurredAt.getTime() - b.occurredAt.getTime();
    if (byTimestamp !== 0) return byTimestamp;

    const byPriority = ENTRY_PRIORITY[a.type] - ENTRY_PRIORITY[b.type];
    if (byPriority !== 0) return byPriority;

    return a.id.localeCompare(b.id);
  });
}

export function buildClientLedger(input: {
  invoices: LedgerInvoiceSource[];
  payments: LedgerPaymentSource[];
  returns: LedgerReturnSource[];
}): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const invoice of input.invoices) {
    const productSummary = summarizeItems(invoice.items);
    const returnedAmount = getInvoiceReturnedAmount(invoice);

    const baseDescription =
      productSummary ||
      (invoice.isLegacy
        ? "مديونية سابقة مرحّلة"
        : invoice.type === "CASH"
        ? "فاتورة نقدية"
        : "فاتورة آجلة");

    entries.push({
      id: invoice.id,
      occurredAt: invoice.createdAt,
      type: "INVOICE",
      reference: `فاتورة ${invoice.invoiceNumber}`,
      description:
        returnedAmount > 0
          ? `${baseDescription} · الإجمالي الأصلي قبل المرتجعات`
          : baseDescription,
      debit: getInvoiceOriginalTotal(invoice),
      credit: 0,
    });
  }

  for (const payment of input.payments) {
    const itemSummary = payment.paymentItems
      .map(
        (item) =>
          `${toNumber(item.paidQuantity)} × ${item.product.name}`
      )
      .join("، ");

    const description = itemSummary
      ? `سداد بكميات: ${itemSummary}`
      : payment.notes
      ? payment.notes
      : payment.referenceNo
      ? `مرجع: ${payment.referenceNo}`
      : `${
          PAYMENT_METHOD_LABEL[payment.method] ?? payment.method
        } — مقابل ${payment.invoice.invoiceNumber}`;

    entries.push({
      id: payment.id,
      occurredAt: payment.createdAt,
      type: "PAYMENT",
      reference: `دفعة — ${payment.invoice.invoiceNumber}`,
      description,
      debit: 0,
      credit: roundCurrency(toNumber(payment.amount)),
    });
  }

  for (const returned of input.returns) {
    const productSummary = summarizeItems(returned.items);
    const debtReducing = isDebtReducingReturn(returned.invoice.type);
    const amount = roundCurrency(toNumber(returned.totalAmount));

    const description = [
      productSummary,
      debtReducing ? null : "رد نقدي — لا يؤثر على مديونية العميل",
    ]
      .filter(Boolean)
      .join(" · ");

    entries.push({
      id: returned.id,
      occurredAt: returned.createdAt,
      type: "RETURN",
      reference: `مرتجع ${returned.returnNumber}`,
      description,
      debit: 0,
      credit: debtReducing ? amount : 0,
      memoAmount: debtReducing ? undefined : amount,
      isCashRefund: !debtReducing,
    });
  }

  return sortLedgerEntries(entries);
}

export function computeLedgerTotals(entries: LedgerEntry[]): LedgerTotals {
  const debit = roundCurrency(entries.reduce((sum, e) => sum + e.debit, 0));
  const credit = roundCurrency(entries.reduce((sum, e) => sum + e.credit, 0));
  return { debit, credit, net: roundCurrency(debit - credit) };
}

/**
 * Balance before the first ledger entry.
 *
 * In a fully reconciled ledger this is zero. If the database contains older
 * debt that predates the recorded documents (or a historical imbalance), the
 * difference is surfaced explicitly as an opening balance instead of silently
 * producing a closing balance that disagrees with `pharmacy.currentBalance`.
 */
export function computeOpeningBalance(
  currentBalance: number,
  entries: LedgerEntry[]
): number {
  return roundCurrency(currentBalance - computeLedgerTotals(entries).net);
}
