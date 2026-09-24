import { prisma } from "@/lib/prisma";
import { ClientType } from "@prisma/client";

// ─── External Companies / Warehouses ───────────────────────────────

export async function getCompanies(filters?: { governorateId?: string; salesRepId?: string }) {
  const { governorateId, salesRepId } = filters ?? {};

  return prisma.pharmacy.findMany({
    where: {
      clientType: ClientType.EXTERNAL_WAREHOUSE,
      ...(governorateId && { governorateId }),
      ...(salesRepId && { assignedReps: { some: { salesRepId } } }),
    },
    include: {
      governorate: { select: { name: true } },
      assignedReps: { include: { salesRep: { select: { name: true } } } },
      _count: { select: { invoices: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getCompanyById(id: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return prisma.pharmacy.findFirst({
    where: { 
      id,
      clientType: ClientType.EXTERNAL_WAREHOUSE,
    },
    include: {
      governorate: true,
      assignedReps: { include: { salesRep: { select: { name: true, employeeCode: true } } } },
      invoices: {
        take: 10,
        orderBy: { invoiceDate: "desc" },
        include: { salesRep: { select: { name: true } } },
      },
      targetAttainments: {
        where: { periodYear: year, periodMonth: month },
        take: 1,
      },
      payments: {
        take: 10,
        orderBy: { paidAt: "desc" },
      }
    },
  });
}

export async function getCompanyStats() {
  const [totalCompanies, totalCredit] = await Promise.all([
    prisma.pharmacy.count({ where: { clientType: ClientType.EXTERNAL_WAREHOUSE } }),
    prisma.pharmacy.aggregate({ 
      where: { clientType: ClientType.EXTERNAL_WAREHOUSE },
      _sum: { currentBalance: true } 
    }),
  ]);

  return {
    totalCompanies,
    totalCredit: totalCredit._sum?.currentBalance ?? 0,
  };
}
