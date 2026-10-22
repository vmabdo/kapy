import { prisma } from "@/lib/prisma";
import { InvoiceStatus, InvoiceType } from "@prisma/client";
import {
  getZonedDayRange,
  getZonedMonthRange,
  getZonedYearMonth,
} from "@/lib/datetime";

// ─── Invoices ─────────────────────────────────────────────────

export async function getInvoices(filters?: {
  status?: InvoiceStatus;
  type?: InvoiceType;
  salesRepId?: string;
  pharmacyId?: string;
  from?: Date;
  to?: Date;
  query?: string;
  take?: number;
  skip?: number;
}) {
  const { status, type, salesRepId, pharmacyId, from, to, query, take = 50, skip = 0 } = filters ?? {};

  // Build date range filter. `to` is exclusive so callers can pass the start
  // of the day after the selected local date without off-by-one duplicates.
  const invoiceDateFilter =
    from || to
      ? {
          invoiceDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
          },
        }
      : {};

  // Build text search filter
  const searchFilter = query
    ? {
        OR: [
          { invoiceNumber: { contains: query, mode: "insensitive" as const } },
          { pharmacy: { name: { contains: query, mode: "insensitive" as const } } },
          { salesRep: { name: { contains: query, mode: "insensitive" as const } } },
          { notes: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  return prisma.invoice.findMany({
    where: {
      ...(status && { status }),
      ...(type && { type }),
      ...(salesRepId && { salesRepId }),
      ...(pharmacyId && { pharmacyId }),
      ...invoiceDateFilter,
      ...searchFilter,
    },
    include: {
      pharmacy: {
        select: {
          name: true,
          clientType: true,
          governorate: { select: { name: true } },
        },
      },
      salesRep: { select: { name: true } },
    },
    orderBy: { invoiceDate: "desc" },
    take,
    skip,
  });
}

export async function getInvoiceById(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      pharmacy: { include: { governorate: true } },
      salesRep: true,
      items: {
        include: {
          product: { select: { name: true, sku: true, unit: true } },
        },
      },
      payments: {
        orderBy: { paidAt: "desc" },
        include: {
          paymentItems: true,
          // LEGACY DEBT: target items for rep target tracking
          targetItems: {
            include: { product: { select: { id: true, name: true, unit: true } } },
          },
        },
      },
      returns: { include: { items: { include: { product: { select: { name: true } } } } } },
    },
  });
}



// ─── Sales Reps ───────────────────────────────────────────────

export async function getAllSalesReps() {
  const reps = await prisma.salesRep.findMany({
    where: { isActive: true },
    include: {
      // user may be null for reps without system login accounts
      user: { select: { email: true } },
      _count: { select: { invoices: true, assignedPharmacies: true } },
    },
    orderBy: { name: "asc" },
  });

  // Serialize Prisma Decimal fields to plain numbers for Client Component compatibility
  return reps.map((rep) => ({
    ...rep,
    baseSalary: Number(rep.baseSalary),
    monthlyTarget: Number(rep.monthlyTarget),
  }));
}

export async function getSalesRepById(id: string) {
  const rep = await prisma.salesRep.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } },
      governorate: { select: { name: true } },
      assignedPharmacies: { include: { pharmacy: { select: { id: true, name: true, salesTarget: true, currentBalance: true } } } },
      invoices: {
        take: 10,
        orderBy: { invoiceDate: "desc" },
        include: { pharmacy: { select: { name: true } } },
      },
      stockMovements: {
        take: 10,
        orderBy: { movedAt: "desc" },
        include: { items: { include: { product: { select: { name: true } } } } },
      },
    },
  });

  if (!rep) return null;

  // Serialize Prisma Decimal fields to plain numbers
  return {
    ...rep,
    baseSalary: Number(rep.baseSalary),
    monthlyTarget: Number(rep.monthlyTarget),
  };
}

// ─── Analytics Helpers ────────────────────────────────────────

/**
 * Lightweight stats for pages (like the dashboard) that only need the current
 * month's revenue and the outstanding receivables. Keeping this separate from
 * `getSalesStats` avoids the extra "today" aggregate — important when several
 * dashboard queries are already running against a small connection pool.
 */
export async function getMonthlySalesStats(salesRepId?: string) {
  const now = new Date();
  const currentPeriod = getZonedYearMonth(now);
  const { start: monthStart, endExclusive: nextMonthStart } =
    getZonedMonthRange(currentPeriod.year, currentPeriod.month);
  const repFilter = salesRepId ? { salesRepId } : {};

  const [monthInvoices, totalReceivables] = await Promise.all([
    // This month's total — explicit Africa/Cairo calendar boundaries.
    prisma.invoice.aggregate({
      where: {
        invoiceDate: { gte: monthStart, lt: nextMonthStart },
        status: { not: InvoiceStatus.DRAFT },
        isLegacy: false,
        ...repFilter,
      },
      _sum: { total: true },
    }),
    // Total outstanding credit
    prisma.invoice.aggregate({
      where: {
        type: InvoiceType.CREDIT,
        status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.DRAFT] },
        ...repFilter,
      },
      _sum: { remainingAmount: true },
    }),
  ]);

  return {
    monthTotal: monthInvoices._sum.total ?? 0,
    totalReceivables: totalReceivables._sum.remainingAmount ?? 0,
  };
}

/**
 * Today + month + receivables. Runs three queries in parallel; prefer
 * `getMonthlySalesStats()` when the "today" numbers are not needed.
 */
export async function getSalesStats(salesRepId?: string) {
  const { start: today, endExclusive: tomorrow } = getZonedDayRange(
    new Date()
  );
  const repFilter = salesRepId ? { salesRepId } : {};

  const [todayInvoices, monthlyStats] = await Promise.all([
    // Today's total — explicit Africa/Cairo calendar boundaries.
    prisma.invoice.aggregate({
      where: {
        invoiceDate: { gte: today, lt: tomorrow },
        status: { not: InvoiceStatus.DRAFT },
        isLegacy: false,
        ...repFilter,
      },
      _sum: { total: true },
      _count: true,
    }),
    getMonthlySalesStats(salesRepId),
  ]);

  return {
    todayTotal: todayInvoices._sum.total ?? 0,
    todayCount: todayInvoices._count,
    ...monthlyStats,
  };
}
