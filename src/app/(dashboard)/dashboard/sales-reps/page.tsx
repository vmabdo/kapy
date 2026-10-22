import type { Metadata } from "next";
import { getAllSalesReps } from "@/queries/sales";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { Users, Target } from "lucide-react";
import { AddRepDialog } from "./add-rep-dialog";
import { SalesRepsList } from "@/components/sales/reps-list";

export const metadata: Metadata = { title: "مندوبي المبيعات" };
export const dynamic = "force-dynamic";

export default async function SalesRepsPage() {
  const [reps, governorates] = await Promise.all([
    getAllSalesReps(),
    prisma.governorate.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Calculate current month stats per rep
  const now = new Date();
  
  const [monthSalesAgg, bonusAgg, deductionAgg] = await Promise.all([
    prisma.invoice.groupBy({
      by: ['salesRepId'],
      where: { invoiceDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
      _sum: { total: true },
    }),
    prisma.repBonus.groupBy({
      by: ['salesRepId'],
      where: { periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 },
      _sum: { amount: true },
    }),
    prisma.repDeduction.groupBy({
      by: ['salesRepId'],
      where: { periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 },
      _sum: { amount: true },
    }),
  ]);

  const repStats = reps.map((rep) => {
    const monthSalesTotal = Number(monthSalesAgg.find(m => m.salesRepId === rep.id)?._sum.total ?? 0);
    const target = Number(rep.monthlyTarget);
    const achievement = target > 0 ? Math.min((monthSalesTotal / target) * 100, 100) : 0;
    
    const bonus = Number(bonusAgg.find(b => b.salesRepId === rep.id)?._sum.amount ?? 0);
    const deduction = Number(deductionAgg.find(d => d.salesRepId === rep.id)?._sum.amount ?? 0);
    
    const netSalary = Number(rep.baseSalary) + bonus - deduction;

    return { repId: rep.id, monthSalesTotal, achievement, netSalary };
  });

  const statsMap = new Map(repStats.map((s) => [s.repId, s]));

  const repRows = reps.map((rep) => {
    const stats = statsMap.get(rep.id);

    return {
      id: rep.id,
      name: rep.name,
      phone: rep.phone,
      employeeCode: rep.employeeCode,
      hasSystemAccount: Boolean(rep.user?.email),
      monthlyTarget: Number(rep.monthlyTarget),
      assignedPharmaciesCount: rep._count.assignedPharmacies,
      invoicesCount: rep._count.invoices,
      achievement: stats?.achievement ?? 0,
      netSalary: stats?.netSalary ?? Number(rep.baseSalary),
    };
  });

  return (
    <div dir="rtl">
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            فريق المبيعات
          </h1>
          <p className="page-subtitle">
            {reps.length} مندوب نشط — إدارة الرواتب والمكافآت والخصومات والأهداف
          </p>
        </div>
        <AddRepDialog governorates={governorates} />
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "إجمالي المناديب",
            value: reps.length,
            icon: <Users className="w-5 h-5" />,
            color: "text-blue-600 bg-blue-500/10",
          },
          {
            label: "مبيعات الشهر (الفريق)",
            value: formatCurrency(String(repStats.reduce((s, r) => s + r.monthSalesTotal, 0))),
            icon: <Target className="w-5 h-5" />,
            color: "text-emerald-600 bg-emerald-500/10",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                <p className="text-xl font-bold mt-1 tabular-nums">{kpi.value}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${kpi.color}`}>{kpi.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Reps grid */}
      <SalesRepsList reps={repRows} />
    </div>
  );
}
