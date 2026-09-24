import { prisma } from "@/lib/prisma";

// ─── Pharmacies ───────────────────────────────────────────────

export async function getPharmacies(filters?: { governorateId?: string; salesRepId?: string }) {
  const { governorateId, salesRepId } = filters ?? {};

  return prisma.pharmacy.findMany({
    where: {
      clientType: "PHARMACY",
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

export async function getPharmacyById(id: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return prisma.pharmacy.findUnique({
    where: { id },
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
    },
  });
}

export async function getPharmacyStats() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [totalPharmacies, totalCredit, topPerformers] = await Promise.all([
    prisma.pharmacy.count({ where: { clientType: "PHARMACY" } }),
    prisma.pharmacy.aggregate({ where: { clientType: "PHARMACY" }, _sum: { currentBalance: true } }),
    // Get pharmacies closest to hitting their target this month
    prisma.pharmacyTargetPeriod.findMany({
      where: {
        periodYear: year,
        periodMonth: month,
        target: { gt: 0 },
      },
      include: { pharmacy: { select: { id: true, name: true, governorate: { select: { name: true } } } } },
      orderBy: [
        { achieved: "desc" },
      ],
      take: 5,
    }),
  ]);

  return {
    totalPharmacies,
    totalCredit: totalCredit._sum.currentBalance ?? 0,
    topPerformers,
  };
}
