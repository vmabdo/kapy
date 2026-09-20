import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, cn } from "@/lib/utils";
import { TrendingUp, ArrowRight, Users, Target, FileText, Award } from "lucide-react";

export const metadata: Metadata = { title: "تقرير أداء فريق المبيعات" };
export const dynamic = "force-dynamic";

export default async function SalesPerformancePage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthStart = new Date(currentYear, currentMonth - 1, 1);

  // Get all active sales reps
  const reps = await prisma.salesRep.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { invoices: true, assignedPharmacies: true } },
    },
    orderBy: { name: "asc" },
  });

  // For each rep, get their current month sales aggregate
  const repStats = await Promise.all(
    reps.map(async (rep) => {
      const [monthAgg, totalAgg, bonusAgg, deductionAgg] = await Promise.all([
        prisma.invoice.aggregate({
          where: {
            salesRepId: rep.id,
            invoiceDate: { gte: monthStart },
          },
          _sum: { total: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: { salesRepId: rep.id },
          _sum: { total: true },
          _count: true,
        }),
        prisma.repBonus.aggregate({
          where: { salesRepId: rep.id, periodYear: currentYear, periodMonth: currentMonth },
          _sum: { amount: true },
        }),
        prisma.repDeduction.aggregate({
          where: { salesRepId: rep.id, periodYear: currentYear, periodMonth: currentMonth },
          _sum: { amount: true },
        }),
      ]);

      const monthSales = Number(monthAgg._sum.total ?? 0);
      const totalSales = Number(totalAgg._sum.total ?? 0);
      const target = Number(rep.monthlyTarget);
      const achievement = target > 0 ? Math.min((monthSales / target) * 100, 100) : 0;
      const netSalary =
        Number(rep.baseSalary) +
        Number(bonusAgg._sum.amount ?? 0) -
        Number(deductionAgg._sum.amount ?? 0);

      return {
        rep,
        monthSales,
        totalSales,
        monthInvoiceCount: monthAgg._count,
        totalInvoiceCount: totalAgg._count,
        target,
        achievement,
        netSalary,
      };
    })
  );

  // Sort by achievement desc
  const sortedStats = [...repStats].sort((a, b) => b.monthSales - a.monthSales);

  // Team totals
  const teamMonthSales = repStats.reduce((s, r) => s + r.monthSales, 0);
  const teamTarget = repStats.reduce((s, r) => s + r.target, 0);
  const teamAchievement = teamTarget > 0 ? Math.min((teamMonthSales / teamTarget) * 100, 100) : 0;

  const monthLabel = now.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

  return (
    <div dir="rtl" className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/reports" className="hover:text-foreground transition-colors">
          التقارير
        </Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">أداء فريق المبيعات</span>
      </nav>

      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-green-500" />
            تقرير أداء فريق المبيعات
          </h1>
          <p className="page-subtitle">
            مقارنة أداء المناديب وتحقيق الأهداف — {monthLabel}
          </p>
        </div>
        <Link
          href="/dashboard/sales/reps"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          <Users className="w-4 h-4" />
          إدارة المناديب
        </Link>
      </div>

      {/* Team KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card card-enter-1">
          <p className="text-xs text-muted-foreground font-medium">مبيعات الفريق ({monthLabel})</p>
          <p className="text-2xl font-bold mt-1.5 tabular-nums">{formatCurrency(String(teamMonthSales))}</p>
          <p className="text-[11px] text-muted-foreground mt-1">إجمالي مبيعات هذا الشهر</p>
        </div>
        <div className="stat-card card-enter-2">
          <p className="text-xs text-muted-foreground font-medium">هدف الفريق</p>
          <p className="text-2xl font-bold mt-1.5 tabular-nums">{formatCurrency(String(teamTarget))}</p>
          <p className="text-[11px] text-muted-foreground mt-1">مجموع أهداف المناديب</p>
        </div>
        <div className="stat-card card-enter-3">
          <p className="text-xs text-muted-foreground font-medium">إنجاز الفريق</p>
          <p className={cn(
            "text-2xl font-bold mt-1.5 tabular-nums",
            teamAchievement >= 100 ? "text-emerald-600" : teamAchievement >= 70 ? "text-blue-600" : "text-amber-600"
          )}>
            {Math.round(teamAchievement)}%
          </p>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                teamAchievement >= 100 ? "bg-emerald-500" :
                teamAchievement >= 70 ? "bg-blue-500" : "bg-amber-500"
              )}
              style={{ width: `${teamAchievement}%` }}
            />
          </div>
        </div>
        <div className="stat-card card-enter-4">
          <p className="text-xs text-muted-foreground font-medium">عدد المناديب</p>
          <p className="text-2xl font-bold mt-1.5 tabular-nums">{reps.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {repStats.filter((r) => r.achievement >= 100).length} حققوا هدفهم
          </p>
        </div>
      </div>

      {/* Performance table */}
      <div className="section-card">
        <div className="section-card-header">
          <h2 className="section-card-title">
            <Award className="w-4 h-4 text-primary" />
            مقارنة أداء المناديب
          </h2>
          <span className="text-xs text-muted-foreground">{monthLabel}</span>
        </div>

        {sortedStats.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <p className="empty-state-title">لا يوجد مناديب مسجلون</p>
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead className="data-table-header">
                <tr>
                  <th className="text-right w-8">#</th>
                  <th className="text-right">المندوب</th>
                  <th className="text-center">مبيعات الشهر</th>
                  <th className="text-center">الهدف</th>
                  <th className="text-center min-w-[160px]">نسبة الإنجاز</th>
                  <th className="text-center">الفواتير</th>
                  <th className="text-center">الصيدليات</th>
                  <th className="text-center">صافي الراتب</th>
                </tr>
              </thead>
              <tbody>
                {sortedStats.map((s, idx) => {
                  const achievementColor =
                    s.achievement >= 100 ? "bg-emerald-500" :
                    s.achievement >= 70 ? "bg-blue-500" :
                    s.achievement >= 40 ? "bg-amber-500" : "bg-red-500";

                  return (
                    <tr key={s.rep.id} className="data-table-row">
                      <td className="data-table-cell text-muted-foreground text-sm font-bold">
                        {idx + 1}
                      </td>
                      <td className="data-table-cell">
                        <Link
                          href={`/dashboard/sales/reps/${s.rep.id}`}
                          className="flex items-center gap-2.5 group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                            {s.rep.name[0]}
                          </div>
                          <div>
                            <p className="font-medium text-sm group-hover:text-primary transition-colors">
                              {s.rep.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {s.rep.employeeCode}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="data-table-cell text-center font-semibold tabular-nums">
                        {formatCurrency(String(s.monthSales))}
                      </td>
                      <td className="data-table-cell text-center text-sm text-muted-foreground tabular-nums">
                        {s.target > 0 ? formatCurrency(String(s.target)) : "—"}
                      </td>
                      <td className="data-table-cell">
                        {s.target > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${achievementColor}`}
                                style={{ width: `${s.achievement}%` }}
                              />
                            </div>
                            <span className={cn(
                              "text-xs font-bold tabular-nums min-w-[38px] text-left",
                              s.achievement >= 100 ? "text-emerald-600" :
                              s.achievement >= 70 ? "text-blue-600" :
                              s.achievement >= 40 ? "text-amber-600" : "text-red-600"
                            )}>
                              {Math.round(s.achievement)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">لا هدف</span>
                        )}
                      </td>
                      <td className="data-table-cell text-center tabular-nums">
                        <div className="flex flex-col items-center">
                          <span className="font-semibold">{s.monthInvoiceCount}</span>
                          <span className="text-[10px] text-muted-foreground">هذا الشهر</span>
                        </div>
                      </td>
                      <td className="data-table-cell text-center tabular-nums">
                        {s.rep._count.assignedPharmacies}
                      </td>
                      <td className="data-table-cell text-center font-semibold text-primary tabular-nums">
                        {formatCurrency(String(s.netSalary))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Individual progress cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Target className="w-4 h-4" />
          تفاصيل أداء كل مندوب
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedStats.map((s) => {
            const achievementColor =
              s.achievement >= 100 ? "bg-emerald-500" :
              s.achievement >= 70 ? "bg-blue-500" :
              s.achievement >= 40 ? "bg-amber-500" : "bg-red-500";

            return (
              <Link
                key={s.rep.id}
                href={`/dashboard/sales/reps/${s.rep.id}`}
                className="section-card p-5 hover:border-primary/30 transition-all group block"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold group-hover:bg-primary group-hover:text-white transition-colors">
                    {s.rep.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{s.rep.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{s.rep.employeeCode}</p>
                  </div>
                  {s.achievement >= 100 && (
                    <span className="mr-auto text-emerald-500" title="حقق الهدف!">
                      <Award className="w-4 h-4" />
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">مبيعات الشهر</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(String(s.monthSales))}</span>
                  </div>
                  {s.target > 0 && (
                    <>
                      <div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                          <span>الإنجاز</span>
                          <span className="font-bold">{Math.round(s.achievement)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${achievementColor}`}
                            style={{ width: `${s.achievement}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="flex gap-3 pt-2 border-t border-border/50">
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-muted-foreground">فواتير</p>
                      <p className="font-bold text-sm">{s.monthInvoiceCount}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-muted-foreground">صيدليات</p>
                      <p className="font-bold text-sm">{s.rep._count.assignedPharmacies}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-muted-foreground">الراتب</p>
                      <p className="font-bold text-sm text-primary tabular-nums">
                        {formatCurrency(String(s.netSalary))}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
