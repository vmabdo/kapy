import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, cn } from "@/lib/utils";
import { TrendingUp, ArrowRight, Users, Target, FileText, Award } from "lucide-react";
import { RepPerformanceTable } from "./rep-performance-table";

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

      {/* Performance table and details — client component with search */}
      <RepPerformanceTable sortedStats={sortedStats} monthLabel={monthLabel} />
    </div>
  );
}
