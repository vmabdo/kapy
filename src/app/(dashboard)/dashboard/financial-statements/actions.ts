"use server";

import { prisma } from "@/lib/prisma";

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
  totalOperatingExpenses: number;
  netIncome: number;
}

export interface BalanceSheetData {
  cashBalance: number;
  accountsReceivable: number;
  inventoryValue: number;
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

function getPeriodDates(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate };
}

// --- Income Statement ---------------------------------------------------------

export async function getIncomeStatement(year: number, month: number): Promise<IncomeStatementData> {
  const { startDate, endDate } = getPeriodDates(year, month);

  const [
    salesAggregate,
    returnsAggregate,
    invoiceItemsWithCost,
    salariesAggregate,
    bonusesAggregate,
    deductionsAggregate,
    opExpensesAggregate,
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        invoiceDate: { gte: startDate, lte: endDate },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      _sum: { total: true },
    }),
    prisma.return.aggregate({
      where: { returnDate: { gte: startDate, lte: endDate } },
      _sum: { totalAmount: true },
    }),
    prisma.invoiceItem.findMany({
      where: {
        invoice: {
          invoiceDate: { gte: startDate, lte: endDate },
          status: { notIn: ["DRAFT", "CANCELLED"] },
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
  ]);

  const grossSalesRevenue = Number(salesAggregate._sum.total ?? 0);
  const totalReturns = Number(returnsAggregate._sum.totalAmount ?? 0);
  const netRevenue = grossSalesRevenue - totalReturns;

  const cogs = invoiceItemsWithCost.reduce((sum: number, item: any) => {
    const cost = item.product.costPrice != null
      ? Number(item.product.costPrice)
      : Number(item.product.sellingPrice) * 0.6;
    return sum + item.quantity * cost;
  }, 0);

  const grossProfit = netRevenue - cogs;

  const repSalaries = Number(salariesAggregate._sum.amount ?? 0);
  const repBonuses = Number(bonusesAggregate._sum.amount ?? 0);
  const repDeductions = Number(deductionsAggregate._sum.amount ?? 0);
  const operatingExpenses = Number(opExpensesAggregate._sum.amount ?? 0);

  const totalOperatingExpenses = repSalaries + repBonuses - repDeductions + operatingExpenses;
  const netIncome = grossProfit - totalOperatingExpenses;

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
    totalOperatingExpenses,
    netIncome,
  };
}

// --- Balance Sheet -------------------------------------------------------------

export async function getBalanceSheet(): Promise<BalanceSheetData> {
  const [treasury, creditReceivables, stockItems] = await Promise.all([
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
    prisma.stockItem.findMany({
      where: { quantity: { gt: 0 } },
      select: {
        quantity: true,
        product: { select: { costPrice: true, sellingPrice: true } },
      },
    }),
  ]);

  const cashBalance = Number(treasury?.currentBalance ?? 0);
  const accountsReceivable = Number(creditReceivables._sum.remainingAmount ?? 0);

  const inventoryValue = stockItems.reduce((sum: number, item: any) => {
    const cost = item.product.costPrice != null
      ? Number(item.product.costPrice)
      : Number(item.product.sellingPrice) * 0.6;
    return sum + item.quantity * cost;
  }, 0);

  const totalAssets = cashBalance + accountsReceivable + inventoryValue;
  const accountsPayable = 0;
  const totalLiabilities = accountsPayable;
  const equity = totalAssets - totalLiabilities;

  return {
    cashBalance,
    accountsReceivable,
    inventoryValue,
    totalAssets,
    accountsPayable,
    totalLiabilities,
    equity,
  };
}

// --- Cash Flow Statement ------------------------------------------------------

export async function getCashFlowStatement(year: number, month: number): Promise<CashFlowData> {
  const { startDate, endDate } = getPeriodDates(year, month);

  const [
    cashSalesTxns,
    collectionsTxns,
    otherInboundTxns,
    supplierOutTxns,
    salaryOutTxns,
    operatingOutTxns,
    otherOutTxns,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: "CASH_IN", category: "INVOICE_PAYMENT", transactedAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "TRANSFER_IN", transactedAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "CASH_IN", category: { notIn: ["INVOICE_PAYMENT"] }, transactedAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
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

  const cashSalesInflows = Number(cashSalesTxns._sum.amount ?? 0);
  const collectedCreditInflows = Number(collectionsTxns._sum.amount ?? 0);
  const otherInflows = Number(otherInboundTxns._sum.amount ?? 0);
  const totalInflows = cashSalesInflows + collectedCreditInflows + otherInflows;

  const supplierPayments = Number(supplierOutTxns._sum.amount ?? 0);
  const salaryPayments = Number(salaryOutTxns._sum.amount ?? 0);
  const operatingOutflows = Number(operatingOutTxns._sum.amount ?? 0);
  const otherOutflows = Number(otherOutTxns._sum.amount ?? 0);
  const totalOutflows = supplierPayments + salaryPayments + operatingOutflows + otherOutflows;

  const netCashFlow = totalInflows - totalOutflows;

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
  const [incomeStatement, balanceSheet, cashFlow] = await Promise.all([
    getIncomeStatement(year, month),
    getBalanceSheet(),
    getCashFlowStatement(year, month),
  ]);
  return { incomeStatement, balanceSheet, cashFlow };
}
