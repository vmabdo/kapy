import type { Metadata } from "next";
import Link from "next/link";
import { getAllSalesReps } from "@/queries/sales";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { Users, Plus, ArrowRight, UserCheck, ShieldAlert, Phone, Target, Wallet } from "lucide-react";
import { AddRepDialog } from "./add-rep-dialog";

export const metadata: Metadata = { title: "مندوبي المبيعات" };
export const dynamic = "force-dynamic";

export default async function SalesRepsPage() {
  const [reps, governorates] = await Promise.all([
    getAllSalesReps(),
    prisma.governorate.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Calculate current month stats per rep
  const now = new Date();
  const repStats = await Promise.all(
    reps.map(async (rep) => {
      const [monthSales, bonusTotal, deductionTotal] = await Promise.all([
        prisma.invoice.aggregate({
          where: {
            salesRepId: rep.id,
            invoiceDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
          },
          _sum: { total: true },
        }),
        prisma.repBonus.aggregate({
          where: { salesRepId: rep.id, periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 },
          _sum: { amount: true },
        }),
        prisma.repDeduction.aggregate({
          where: { salesRepId: rep.id, periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 },
          _sum: { amount: true },
        }),
      ]);

      const monthSalesTotal = Number(monthSales._sum.total ?? 0);
      const target = Number(rep.monthlyTarget);
      const achievement = target > 0 ? Math.min((monthSalesTotal / target) * 100, 100) : 0;
      const netSalary =
        Number(rep.baseSalary) +
        Number(bonusTotal._sum.amount ?? 0) -
        Number(deductionTotal._sum.amount ?? 0);

      return { repId: rep.id, monthSalesTotal, achievement, netSalary };
    })
  );

  const statsMap = new Map(repStats.map((s) => [s.repId, s]));

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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reps.length === 0 ? (
          <div className="col-span-full empty-state">
            <Users className="empty-state-icon" />
            <p className="empty-state-title">لا يوجد مندوبين مسجلين بعد</p>
            <p className="empty-state-desc">أضف أول مندوب مبيعات لبدء إدارة فريقك</p>
          </div>
        ) : (
          reps.map((rep) => {
            const stats = statsMap.get(rep.id);
            const achievement = stats?.achievement ?? 0;
            const achievementColor =
              achievement >= 100
                ? "bg-emerald-500"
                : achievement >= 70
                ? "bg-blue-500"
                : achievement >= 40
                ? "bg-amber-500"
                : "bg-red-500";

            return (
              <Link
                key={rep.id}
                href={`/dashboard/sales-reps/${rep.id}`}
                className="block section-card hover:border-primary/30 transition-all group"
              >
                <div className="p-5">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                        {rep.name[0]}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground leading-tight">{rep.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{rep.employeeCode}</p>
                      </div>
                    </div>
                    {rep.user?.email ? (
                      <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 p-1.5 rounded-md shrink-0" title="يمتلك حساب نظام">
                        <UserCheck className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 p-1.5 rounded-md shrink-0">
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  {/* Phone */}
                  {rep.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-3">
                      <Phone className="w-3 h-3" />
                      {rep.phone}
                    </p>
                  )}

                  {/* Target progress */}
                  {Number(rep.monthlyTarget) > 0 && (
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[11px] text-muted-foreground">إنجاز الهدف الشهري</span>
                        <span className="text-[11px] font-bold tabular-nums">{Math.round(achievement)}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${achievementColor}`}
                          style={{ width: `${achievement}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">الصيدليات</p>
                      <p className="font-bold text-sm">{rep._count.assignedPharmacies}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">الفواتير</p>
                      <p className="font-bold text-sm">{rep._count.invoices}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">صافي الراتب</p>
                      <p className="font-bold text-sm text-primary tabular-nums">
                        {formatCurrency(String(stats?.netSalary ?? rep.baseSalary))}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
