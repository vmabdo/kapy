"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { resolveProductCost } from "@/lib/costing";
import { InvoiceType, UserRole } from "@prisma/client";
import {
  getInventoryValuation,
  getOpeningStockValue,
  getPurchasesValue,
  getSamplesDispatchValue,
  getStockAdjustmentTotals,
} from "@/queries/stock-financials";

// --- Types --------------------------------------------------------------------

export interface IncomeStatementData {
  grossSalesRevenue: number;
  totalReturns: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  repSalaries: number;
  repBonuses: number;
  repDeductions: number;
  operatingExpenses: number;
  inventoryShortageLoss: number;
  marketingSamplesExpense: number;
  totalOperatingExpenses: number;
  inventorySurplusGain: number;
  periodPurchasesValue: number;
  netIncome: number;
}

export interface BalanceSheetData {
  cashBalance: number;
  accountsReceivable: number;
  inventoryValue: number;
  openingInventoryValue: number;
  totalAssets: number;
  accountsPayable: number;
  totalLiabilities: number;
  equity: number;
}

export interface CashFlowData {
  cashSalesInflows: number;
  collectedCreditInflows: number;
  otherInflows: number;
  totalInflows: number;
  supplierPayments: number;
  salaryPayments: number;
  operatingOutflows: number;
  otherOutflows: number;
  totalOutflows: number;
  netCashFlow: number;
}

// --- Helper -------------------------------------------------------------------

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getPeriodDates(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate };
}

/**
 * Financial statements contain company-wide payroll, receivables, cash and
 * inventory information. They are restricted to finance/admin roles even when
 * called directly as a Server Action.
 */
async function requireFinancialStatementsAccess() {
  await requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
  ]);
}

// --- Income Statement ---------------------------------------------------------

export async function getIncomeStatement(year: number, month: number): Promise<IncomeStatementData> {
  await requireFinancialStatementsAccess();

  const { startDate, endDate } = getPeriodDates(year, month);

  const [
    salesAggregate,
    returnsAggregate,
    invoiceItemsWithCost,
    returnedItemsWithCost,
    salariesAggregate,
    bonusesAggregate,
    deductionsAggregate,
    opExpensesAggregate,
    stockAdjustments,
    periodPurchasesValue,
    marketingSamplesExpense,
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        invoiceDate: { gte: startDate, lte: endDate },
        // CANCELLED currently means "fully returned". Keep the original
        // invoice revenue here and let the return rows below act as the
        // contra-revenue entry. Excluding it here while also subtracting the
        // return is what produced negative revenue in the old calculation.
        status: { not: "DRAFT" },
        isLegacy: false,
      },
      // Invoice.total is mutated by returns. subtotal/discountAmount are the
      // immutable original invoice value.
      _sum: { subtotal: true, discountAmount: true },
    }),
    prisma.return.aggregate({
      where: {
        returnDate: { gte: startDate, lte: endDate },
        invoice: { isLegacy: false },
      },
      _sum: { totalAmount: true },
    }),
    prisma.invoiceItem.findMany({
      where: {
        invoice: {
          invoiceDate: { gte: startDate, lte: endDate },
          status: { not: "DRAFT" },
          isLegacy: false,
        },
      },
      select: {
        quantity: true,
        product: { select: { costPrice: true, sellingPrice: true } },
      },
    }),
    prisma.returnItem.findMany({
      where: {
        return: {
          returnDate: { gte: startDate, lte: endDate },
          invoice: { isLegacy: false },
        },
      },
      select: {
        quantity: true,
        product: { select: { costPrice: true, sellingPrice: true } },
      },
    }),
    prisma.transaction.aggregate({
      where: {
        category: "REP_SALARY",
        type: "CASH_OUT",
        transactedAt: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        category: "REP_BONUS",
        type: "CASH_OUT",
        transactedAt: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        category: "REP_DEDUCTION",
        type: "CASH_OUT",
        transactedAt: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        category: { in: ["OPERATING_EXPENSE", "WAREHOUSE_EXPENSE", "OTHER"] },
        type: "CASH_OUT",
        transactedAt: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    }),
    getStockAdjustmentTotals(startDate, endDate),
    getPurchasesValue(startDate, endDate),
    getSamplesDispatchValue(startDate, endDate),
  ]);

  const grossSalesRevenue = roundMoney(
    Number(salesAggregate._sum.subtotal ?? 0) -
      Number(salesAggregate._sum.discountAmount ?? 0)
  );
  const totalReturns = roundMoney(
    Number(returnsAggregate._sum.totalAmount ?? 0)
  );
  const netRevenue = roundMoney(grossSalesRevenue - totalReturns);

  const originalCogs = invoiceItemsWithCost.reduce(
    (sum, item) =>
      sum + Number(item.quantity) * resolveProductCost(item.product),
    0
  );
  const returnedCogs = returnedItemsWithCost.reduce(
    (sum, item) =>
      sum + Number(item.quantity) * resolveProductCost(item.product),
    0
  );
  const cogs = roundMoney(originalCogs - returnedCogs);

  const grossProfit = roundMoney(netRevenue - cogs);

  const repSalaries = Number(salariesAggregate._sum.amount ?? 0);
  const repBonuses = Number(bonusesAggregate._sum.amount ?? 0);
  const repDeductions = Number(deductionsAggregate._sum.amount ?? 0);
  const operatingExpenses = Number(opExpensesAggregate._sum.amount ?? 0);

  // Non-cash inventory adjustments for the selected period.
  const inventoryShortageLoss = stockAdjustments.shortageValue;
  const inventorySurplusGain = stockAdjustments.surplusValue;

  const totalOperatingExpenses =
    repSalaries +
    repBonuses -
    repDeductions +
    operatingExpenses +
    inventoryShortageLoss +
    marketingSamplesExpense;
  const netIncome =
    grossProfit + inventorySurplusGain - totalOperatingExpenses;

  return {
    grossSalesRevenue,
    totalReturns,
    netRevenue,
    cogs,
    grossProfit,
    repSalaries,
    repBonuses,
    repDeductions,
    operatingExpenses,
    inventoryShortageLoss,
    marketingSamplesExpense,
    totalOperatingExpenses,
    inventorySurplusGain,
    periodPurchasesValue,
    netIncome,
  };
}

// --- Balance Sheet -------------------------------------------------------------

export async function getBalanceSheet(): Promise<BalanceSheetData> {
  await requireFinancialStatementsAccess();

  const [treasury, creditReceivables, inventoryValue, openingInventoryValue] =
    await Promise.all([
      prisma.treasury.findFirst({
        select: { currentBalance: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.invoice.aggregate({
        where: {
          type: "CREDIT",
          status: { notIn: ["PAID", "CANCELLED"] },
          remainingAmount: { gt: 0 },
        },
        _sum: { remainingAmount: true },
      }),
      // Current quantities already include opening balances, surplus and
      // shortage corrections, and are net of free-sample dispatches because
      // every inventory action updates StockItem.
      getInventoryValuation(),
      getOpeningStockValue(),
    ]);

  const cashBalance = Number(treasury?.currentBalance ?? 0);
  const accountsReceivable = Number(creditReceivables._sum.remainingAmount ?? 0);

  const totalAssets = cashBalance + accountsReceivable + inventoryValue;
  const accountsPayable = 0;
  const totalLiabilities = accountsPayable;
  const equity = totalAssets - totalLiabilities;

  return {
    cashBalance,
    accountsReceivable,
    inventoryValue,
    openingInventoryValue,
    totalAssets,
    accountsPayable,
    totalLiabilities,
    equity,
  };
}

// --- Cash Flow Statement ------------------------------------------------------

export async function getCashFlowStatement(year: number, month: number): Promise<CashFlowData> {
  await requireFinancialStatementsAccess();

  const { startDate, endDate } = getPeriodDates(year, month);

  const [
    inboundTransactions,
    supplierOutTxns,
    salaryOutTxns,
    operatingOutTxns,
    otherOutTxns,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        type: { in: ["CASH_IN", "TRANSFER_IN"] },
        transactedAt: { gte: startDate, lte: endDate },
      },
      select: {
        type: true,
        category: true,
        amount: true,
        payment: {
          select: {
            invoice: { select: { type: true } },
          },
        },
      },
    }),
    prisma.transaction.aggregate({
      where: { type: "CASH_OUT", category: "SUPPLIER_PAYMENT", transactedAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "CASH_OUT", category: { in: ["REP_SALARY", "REP_BONUS"] }, transactedAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "CASH_OUT", category: { in: ["OPERATING_EXPENSE", "WAREHOUSE_EXPENSE"] }, transactedAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: { in: ["CASH_OUT", "TRANSFER_OUT"] }, category: { in: ["REP_DEDUCTION", "OTHER"] }, transactedAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    }),
  ]);

  // A payment on a CASH invoice is a cash sale. A payment on a CREDIT
  // invoice (including its upfront portion) is a debt collection, never a
  // cash sale. Internal TRANSFER_IN movements are not operating revenue.
  let cashSalesInflows = 0;
  let collectedCreditInflows = 0;
  let otherInflows = 0;

  for (const transaction of inboundTransactions) {
    const amount = Number(transaction.amount);

    if (transaction.type === "TRANSFER_IN") {
      otherInflows += amount;
      continue;
    }

    const invoiceType = transaction.payment?.invoice.type;

    if (transaction.category === "INVOICE_PAYMENT" && invoiceType) {
      if (invoiceType === InvoiceType.CASH) {
        cashSalesInflows += amount;
      } else {
        collectedCreditInflows += amount;
      }
    } else {
      otherInflows += amount;
    }
  }

  cashSalesInflows = roundMoney(cashSalesInflows);
  collectedCreditInflows = roundMoney(collectedCreditInflows);
  otherInflows = roundMoney(otherInflows);
  const totalInflows = roundMoney(
    cashSalesInflows + collectedCreditInflows + otherInflows
  );

  const supplierPayments = Number(supplierOutTxns._sum.amount ?? 0);
  const salaryPayments = Number(salaryOutTxns._sum.amount ?? 0);
  const operatingOutflows = Number(operatingOutTxns._sum.amount ?? 0);
  const otherOutflows = Number(otherOutTxns._sum.amount ?? 0);
  const totalOutflows = roundMoney(
    supplierPayments + salaryPayments + operatingOutflows + otherOutflows
  );

  const netCashFlow = roundMoney(totalInflows - totalOutflows);

  return {
    cashSalesInflows,
    collectedCreditInflows,
    otherInflows,
    totalInflows,
    supplierPayments,
    salaryPayments,
    operatingOutflows,
    otherOutflows,
    totalOutflows,
    netCashFlow,
  };
}

export async function getAllFinancialStatements(year: number, month: number) {
  await requireFinancialStatementsAccess();

  const [incomeStatement, balanceSheet, cashFlow] = await Promise.all([
    getIncomeStatement(year, month),
    getBalanceSheet(),
    getCashFlowStatement(year, month),
  ]);
  return { incomeStatement, balanceSheet, cashFlow };
}
