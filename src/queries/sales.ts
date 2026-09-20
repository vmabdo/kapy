import { prisma } from "@/lib/prisma";
import { InvoiceStatus, InvoiceType } from "@prisma/client";

// ─── Invoices ─────────────────────────────────────────────────

export async function getInvoices(filters?: {
  status?: InvoiceStatus;
  type?: InvoiceType;
  salesRepId?: string;
  pharmacyId?: string;
  from?: Date;
  to?: Date;
  take?: number;
  skip?: number;
}) {
  const { status, type, salesRepId, pharmacyId, from, to, take = 50, skip = 0 } = filters ?? {};

  return prisma.invoice.findMany({
    where: {
      ...(status && { status }),
      ...(type && { type }),
      ...(salesRepId && { salesRepId }),
      ...(pharmacyId && { pharmacyId }),
      ...(from && { invoiceDate: { gte: from } }),
      ...(to && { invoiceDate: { lte: to } }),
    },
    include: {
      pharmacy: { select: { name: true, governorate: { select: { name: true } } } },
      salesRep: { select: { name: true } },
      items: true,
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
        include: { product: { select: { name: true, sku: true, unit: true } } },
      },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
}

// ─── Sales Reps ───────────────────────────────────────────────

export async function getAllSalesReps() {
  const reps = await prisma.salesRep.findMany({
    where: { isActive: true },
    include: {
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

export async function getSalesStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayInvoices, monthInvoices, totalReceivables] = await Promise.all([
    // Today's total
    prisma.invoice.aggregate({
      where: { invoiceDate: { gte: today }, status: { not: InvoiceStatus.DRAFT } },
      _sum: { total: true },
      _count: true,
    }),
    // This month's total
    prisma.invoice.aggregate({
      where: {
        invoiceDate: { gte: new Date(today.getFullYear(), today.getMonth(), 1) },
        status: { not: InvoiceStatus.DRAFT },
      },
      _sum: { total: true },
    }),
    // Total outstanding credit
    prisma.invoice.aggregate({
      where: { type: InvoiceType.CREDIT, status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.DRAFT] } },
      _sum: { remainingAmount: true },
    }),
  ]);

  return {
    todayTotal: todayInvoices._sum.total ?? 0,
    todayCount: todayInvoices._count,
    monthTotal: monthInvoices._sum.total ?? 0,
    totalReceivables: totalReceivables._sum.remainingAmount ?? 0,
  };
}
