import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSalesRepById } from "@/queries/sales";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  Users, ArrowRight, Phone, MapPin, Calendar, Target,
  TrendingUp, FileText, Gift, Minus, DollarSign, AlertTriangle,
} from "lucide-react";
import { BonusDeductionForms } from "./bonus-deduction-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const rep = await getSalesRepById(params.id);
  return { title: rep ? `${rep.name} — المندوب` : "مندوب" };
}

export default async function RepDetailPage({ params }: { params: { id: string } }) {
  const rep = await getSalesRepById(params.id);
  if (!rep) notFound();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Financial data for current month
  const [monthInvoices, bonuses, deductions, targetPeriod] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        salesRepId: rep.id,
        invoiceDate: { gte: new Date(currentYear, currentMonth - 1, 1) },
      },
      _sum: { total: true },
      _count: true,
    }),
    prisma.repBonus.findMany({
      where: { salesRepId: rep.id },
      orderBy: { appliedAt: "desc" },
      take: 20,
    }),
    prisma.repDeduction.findMany({
      where: { salesRepId: rep.id },
      orderBy: { appliedAt: "desc" },
      take: 20,
    }),
    prisma.repTargetPeriod.findFirst({
      where: { salesRepId: rep.id, periodYear: currentYear, periodMonth: currentMonth },
    }),
  ]);

  const monthSales = Number(monthInvoices._sum.total ?? 0);
  const target = Number(rep.monthlyTarget);
  const achievement = target > 0 ? Math.min((monthSales / target) * 100, 100) : 0;

  const totalBonuses = bonuses.reduce((s, b) => s + Number(b.amount), 0);
  const totalDeductions = deductions.reduce((s, d) => s + Number(d.amount), 0);
  const netSalary = Number(rep.baseSalary) + totalBonuses - totalDeductions;

  const achievementColor =
    achievement >= 100 ? "bg-emerald-500" :
    achievement >= 70  ? "bg-blue-500" :
    achievement >= 40  ? "bg-amber-500" : "bg-red-500";

  return (
    <div dir="rtl" className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/sales" className="hover:text-foreground transition-colors">المبيعات</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <Link href="/dashboard/sales/reps" className="hover:text-foreground transition-colors">المناديب</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">{rep.name}</span>
      </nav>

      {/* Profile header */}
      <div className="section-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-primary/20 flex items-center justify-center text-primary font-bold text-2xl">
              {rep.name[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{rep.name}</h1>
              <p className="text-sm text-muted-foreground font-mono">{rep.employeeCode}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                {rep.phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{rep.phone}</span>
                )}
                {rep.governorate && (
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{rep.governorate.name}</span>
                )}
                {rep.hiredAt && (
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />منذ {formatDate(rep.hiredAt)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs px-2.5 py-1 rounded-full font-semibold",
              rep.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                           : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}>
              {rep.isActive ? "نشط" : "غير نشط"}
            </span>
          </div>
        </div>
      </div>

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">الراتب الأساسي</p>
          <p className="text-xl font-bold mt-1.5 tabular-nums">{formatCurrency(String(rep.baseSalary))}</p>
          <p className="text-[11px] text-muted-foreground mt-1">شهرياً</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">إجمالي المكافآت</p>
          <p className="text-xl font-bold mt-1.5 text-emerald-600 tabular-nums">+{formatCurrency(String(totalBonuses))}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{bonuses.length} مكافأة</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">إجمالي الخصومات</p>
          <p className="text-xl font-bold mt-1.5 text-red-600 tabular-nums">-{formatCurrency(String(totalDeductions))}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{deductions.length} خصم</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">صافي الراتب</p>
          <p className="text-xl font-bold mt-1.5 text-primary tabular-nums">{formatCurrency(String(netSalary))}</p>
          <p className="text-[11px] text-muted-foreground mt-1">المستحق الإجمالي</p>
        </div>
      </div>

      {/* Monthly Target Progress */}
      <div className="section-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            أداء الشهر الحالي
          </h2>
          <div className="text-xs text-muted-foreground">
            {now.toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-muted/40 rounded-xl p-3.5 text-center">
            <p className="text-xs text-muted-foreground mb-1">مبيعات الشهر</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(String(monthSales))}</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-3.5 text-center">
            <p className="text-xs text-muted-foreground mb-1">الهدف الشهري</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(String(target))}</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-3.5 text-center">
            <p className="text-xs text-muted-foreground mb-1">نسبة الإنجاز</p>
            <p className={cn(
              "text-lg font-bold tabular-nums",
              achievement >= 100 ? "text-emerald-600" : achievement >= 70 ? "text-blue-600" : "text-amber-600"
            )}>
              {Math.round(achievement)}%
            </p>
          </div>
        </div>

        {target > 0 ? (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>0</span>
              <span className="font-medium">{formatCurrency(String(target))}</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${achievementColor}`}
                style={{ width: `${achievement}%` }}
              />
            </div>
            {achievement >= 100 && (
              <p className="text-xs text-emerald-600 font-semibold mt-2 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                🎉 تم تحقيق الهدف الشهري!
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            لم يُحدَّد هدف شهري لهذا المندوب
          </p>
        )}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bonuses & Deductions forms + history */}
        <div className="lg:col-span-1 space-y-4">
          <BonusDeductionForms repId={rep.id} />

          {/* Bonuses list */}
          {bonuses.length > 0 && (
            <div className="section-card overflow-hidden">
              <div className="section-card-header">
                <h3 className="section-card-title">
                  <Gift className="w-4 h-4 text-emerald-500" />
                  المكافآت
                </h3>
              </div>
              <div className="divide-y divide-border/50 max-h-48 overflow-y-auto">
                {bonuses.map((b) => (
                  <div key={b.id} className="px-4 py-3 flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium">{b.reason ?? "مكافأة"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {b.periodMonth}/{b.periodYear}
                      </p>
                    </div>
                    <span className="text-emerald-600 font-bold text-sm tabular-nums">
                      +{formatCurrency(String(b.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deductions list */}
          {deductions.length > 0 && (
            <div className="section-card overflow-hidden">
              <div className="section-card-header">
                <h3 className="section-card-title">
                  <Minus className="w-4 h-4 text-red-500" />
                  الخصومات
                </h3>
              </div>
              <div className="divide-y divide-border/50 max-h-48 overflow-y-auto">
                {deductions.map((d) => (
                  <div key={d.id} className="px-4 py-3 flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium">{d.reason ?? "خصم"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {d.periodMonth}/{d.periodYear}
                      </p>
                    </div>
                    <span className="text-red-600 font-bold text-sm tabular-nums">
                      -{formatCurrency(String(d.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Invoices table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="section-card">
            <div className="section-card-header">
              <h3 className="section-card-title">
                <FileText className="w-4 h-4 text-primary" />
                آخر الفواتير ({monthInvoices._count} هذا الشهر)
              </h3>
              <Link href={`/dashboard/sales?repId=${rep.id}`} className="text-xs text-primary hover:underline">
                عرض الكل
              </Link>
            </div>

            {rep.invoices.length === 0 ? (
              <div className="empty-state py-10">
                <FileText className="empty-state-icon" />
                <p className="empty-state-title">لا توجد فواتير مسجلة</p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead className="data-table-header">
                    <tr>
                      <th className="text-right">رقم الفاتورة</th>
                      <th className="text-right">الصيدلية</th>
                      <th className="text-center">المبلغ</th>
                      <th className="text-center">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.invoices.map((inv) => (
                      <tr key={inv.id} className="data-table-row">
                        <td className="data-table-cell font-mono text-primary">
                          <Link href={`/dashboard/sales/${inv.id}`} className="hover:underline">
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="data-table-cell text-sm">{inv.pharmacy.name}</td>
                        <td className="data-table-cell text-center font-semibold tabular-nums">
                          {formatCurrency(String(inv.total))}
                        </td>
                        <td className="data-table-cell text-center text-xs text-muted-foreground tabular-nums">
                          {formatDate(inv.invoiceDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Assigned pharmacies */}
          <div className="section-card">
            <div className="section-card-header">
              <h3 className="section-card-title">
                <DollarSign className="w-4 h-4 text-primary" />
                الصيدليات المسؤولة ({rep.assignedPharmacies.length})
              </h3>
            </div>
            {rep.assignedPharmacies.length === 0 ? (
              <div className="empty-state py-8">
                <p className="empty-state-title">لا توجد صيدليات مُسندة</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {rep.assignedPharmacies.map(({ pharmacy }) => (
                  <div key={pharmacy.id} className="px-5 py-3 flex justify-between items-center">
                    <Link href={`/dashboard/pharmacies/${pharmacy.id}`} className="text-sm font-medium hover:text-primary hover:underline transition-colors">
                      {pharmacy.name}
                    </Link>
                    <div className="text-left text-xs text-muted-foreground tabular-nums">
                      <p>ديون: <span className="font-semibold text-amber-500">{formatCurrency(String(pharmacy.currentBalance))}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
