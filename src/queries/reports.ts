import { ClientType, InvoiceStatus, InvoiceType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";

// ─── Debts Report ─────────────────────────────────────────────

export const DEBT_ENTITY_TYPE_FILTERS = [
  "ALL",
  "PHARMACY",
  "EXTERNAL_WAREHOUSE",
] as const;

export type DebtEntityTypeFilter = (typeof DEBT_ENTITY_TYPE_FILTERS)[number];

export function isDebtEntityTypeFilter(
  value: string | undefined
): value is DebtEntityTypeFilter {
  return (
    value === "ALL" ||
    value === "PHARMACY" ||
    value === "EXTERNAL_WAREHOUSE"
  );
}

export interface DebtsReportFilters {
  governorateId?: string;
  entityType?: DebtEntityTypeFilter;
  search?: string;
  /** When true (default), only clients with an outstanding balance are returned. */
  onlyDebt?: boolean;
}

export interface DebtReportRow {
  id: string;
  name: string;
  clientType: ClientType;
  isActive: boolean;
  governorate: string;
  salesRep: string | null;
  /** Unpaid remaining amount on standard credit invoices (isLegacy = false). */
  standardDebt: number;
  /** Unpaid remaining amount on legacy debt invoices (isLegacy = true). */
  legacyDebt: number;
  /** Total outstanding debt (standard + legacy, including un-invoiced ledger balance). */
  totalDebt: number;
  unpaidInvoicesCount: number;
  creditLimit: number | null;
  creditUsagePct: number | null;
}

export interface DebtsReportSummary {
  /** Grand total debt for the filtered result set. */
  totalDebt: number;
  pharmaciesDebt: number;
  companiesDebt: number;
  debtorsCount: number;
}

export interface DebtsReportTotals {
  standardDebt: number;
  legacyDebt: number;
  totalDebt: number;
  unpaidInvoicesCount: number;
  clientCount: number;
}

export interface DebtsReportData {
  rows: DebtReportRow[];
  summary: DebtsReportSummary;
  totals: DebtsReportTotals;
}

/**
 * Statuses that represent an issued invoice which still carries a balance.
 * DRAFT invoices are not yet issued, while PAID / CANCELLED invoices owe nothing.
 */
const OPEN_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.CONFIRMED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

/** Governorates are fetched fresh so the filter always reflects the database. */
export async function getDebtsReportGovernorates() {
  return prisma.governorate.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Builds the pharmacies / companies debts report.
 *
 * Debt is composed of:
 *  - standard credit invoices (isLegacy = false) -> `standardDebt`
 *  - legacy debt invoices (isLegacy = true)      -> `legacyDebt`
 *  - any positive ledger balance not covered by open invoices (prior debt)
 *
 * This guarantees that a client whose `currentBalance > 0` is never dropped
 * from the report, even if their debt predates the invoice ledger.
 */
export async function getDebtsReportData(
  filters: DebtsReportFilters = {}
): Promise<DebtsReportData> {
  const {
    governorateId,
    entityType = "ALL",
    search,
    onlyDebt = true,
  } = filters;

  const normalizedSearch = search?.trim();

  const where: Prisma.PharmacyWhereInput = {
    ...(governorateId ? { governorateId } : {}),
    ...(entityType !== "ALL" ? { clientType: entityType } : {}),
    ...(normalizedSearch
      ? { name: { contains: normalizedSearch, mode: "insensitive" } }
      : {}),
    // Narrow the query to actual debtors before loading invoice aggregates.
    // A client qualifies when either the ledger balance or an open invoice has value.
    ...(onlyDebt
      ? {
          OR: [
            { currentBalance: { gt: 0 } },
            {
              invoices: {
                some: {
                  type: InvoiceType.CREDIT,
                  status: { in: OPEN_INVOICE_STATUSES },
                  remainingAmount: { gt: 0 },
                },
              },
            },
          ],
        }
      : {}),
  };

  const clients = await prisma.pharmacy.findMany({
    where,
    select: {
      id: true,
      name: true,
      clientType: true,
      isActive: true,
      currentBalance: true,
      creditLimit: true,
      governorate: { select: { name: true } },
      assignedReps: {
        where: { isActive: true },
        orderBy: { assignedAt: "desc" },
        take: 1,
        select: { salesRep: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  const clientIds = clients.map((client) => client.id);

  // Aggregate open invoice balances per client, split by invoice origin.
  const invoiceGroups = clientIds.length
    ? await prisma.invoice.groupBy({
        by: ["pharmacyId", "isLegacy"],
        where: {
          pharmacyId: { in: clientIds },
          type: InvoiceType.CREDIT,
          status: { in: OPEN_INVOICE_STATUSES },
          remainingAmount: { gt: 0 },
        },
        _sum: { remainingAmount: true },
        _count: { _all: true },
      })
    : [];

  const debtByClient = new Map<
    string,
    { standardDebt: number; legacyDebt: number; unpaidInvoicesCount: number }
  >();

  for (const group of invoiceGroups) {
    const current = debtByClient.get(group.pharmacyId) ?? {
      standardDebt: 0,
      legacyDebt: 0,
      unpaidInvoicesCount: 0,
    };

    const remaining = toNumber(group._sum.remainingAmount);

    if (group.isLegacy) {
      current.legacyDebt += remaining;
    } else {
      current.standardDebt += remaining;
    }
    current.unpaidInvoicesCount += group._count._all;

    debtByClient.set(group.pharmacyId, current);
  }

  const rows: DebtReportRow[] = clients.map((client) => {
    const debt = debtByClient.get(client.id) ?? {
      standardDebt: 0,
      legacyDebt: 0,
      unpaidInvoicesCount: 0,
    };

    const standardDebt = debt.standardDebt;
    const ledgerBalance = Math.max(0, toNumber(client.currentBalance));
    const invoicedDebt = standardDebt + debt.legacyDebt;

    // A positive ledger balance above the open-invoice total represents older
    // debt that is not backed by an open invoice row. Surface it as legacy debt
    // so totals stay consistent and no outstanding balance is omitted.
    const legacyDebt =
      debt.legacyDebt + Math.max(0, ledgerBalance - invoicedDebt);

    const totalDebt = standardDebt + legacyDebt;
    const creditLimit =
      client.creditLimit === null ? null : toNumber(client.creditLimit);

    return {
      id: client.id,
      name: client.name,
      clientType: client.clientType,
      isActive: client.isActive,
      governorate: client.governorate.name,
      salesRep: client.assignedReps[0]?.salesRep.name ?? null,
      standardDebt,
      legacyDebt,
      totalDebt,
      unpaidInvoicesCount: debt.unpaidInvoicesCount,
      creditLimit,
      creditUsagePct:
        creditLimit && creditLimit > 0
          ? (totalDebt / creditLimit) * 100
          : null,
    };
  });

  const filteredRows = onlyDebt
    ? rows.filter((row) => row.totalDebt > 0.009)
    : rows;

  filteredRows.sort(
    (a, b) =>
      b.totalDebt - a.totalDebt || a.name.localeCompare(b.name, "ar")
  );

  const summary: DebtsReportSummary = {
    totalDebt: 0,
    pharmaciesDebt: 0,
    companiesDebt: 0,
    debtorsCount: 0,
  };

  const totals: DebtsReportTotals = {
    standardDebt: 0,
    legacyDebt: 0,
    totalDebt: 0,
    unpaidInvoicesCount: 0,
    clientCount: filteredRows.length,
  };

  for (const row of filteredRows) {
    summary.totalDebt += row.totalDebt;
    totals.standardDebt += row.standardDebt;
    totals.legacyDebt += row.legacyDebt;
    totals.totalDebt += row.totalDebt;
    totals.unpaidInvoicesCount += row.unpaidInvoicesCount;

    if (row.clientType === ClientType.PHARMACY) {
      summary.pharmaciesDebt += row.totalDebt;
    } else if (row.clientType === ClientType.EXTERNAL_WAREHOUSE) {
      summary.companiesDebt += row.totalDebt;
    }

    if (row.totalDebt > 0.009) {
      summary.debtorsCount += 1;
    }
  }

  return { rows: filteredRows, summary, totals };
}
