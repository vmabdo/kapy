import type { Metadata } from "next";
import Link from "next/link";
import { getRequiredSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getSalesStats } from "@/queries/sales";
import { getTreasury } from "@/queries/treasury";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Building2,
  Wallet,
  Plus,
  FileText,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";

export const metadata: Metadata = { title: "لوحة التحكم" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getRequiredSession();

  // Fetch all dashboard stats in parallel
  const [salesStats, treasury, totalProducts, totalPharmacies, recentInvoices, recentAlerts] =
    await Promise.all([
      getSalesStats(),
      getTreasury(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.pharmacy.count({ where: { isActive: true } }),
      prisma.invoice.findMany({
        take: 5,
        orderBy: { invoiceDate: "desc" },
        include: {
          pharmacy: { select: { name: true, governorate: { select: { name: true } } } },
        },
      }),
      prisma.alert.findMany({
        take: 4,
        orderBy: { triggeredAt: "desc" },
        where: { status: "UNREAD" },
      }),
    ]);

  const todaySalesAmount = Number(salesStats.todayTotal);
  const treasuryBalance = Number(treasury.currentBalance);
  const totalReceivables = Number(salesStats.totalReceivables);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-primary" />
            لوحة التحكم الرئيسية
          </h1>
          <p className="page-subtitle">
            مرحباً، {session.user.name} — نظرة عامة لحظية على أداء Kapy Pharma اليوم
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/dashboard/sales/new"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20"
          >
            <Plus className="w-3.5 h-3.5" />
            فاتورة جديدة
          </Link>
          <Link
            href="/dashboard/pharmacies/new"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-medium hover:bg-muted transition-all"
          >
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            صيدلية جديدة
          </Link>
          <Link
            href="/dashboard/reports/daily"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-medium hover:bg-muted transition-all"
          >
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
            التقرير اليومي
          </Link>
        </div>
      </div>

      {/* KPI Grid — staggered entrance animation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sales Today */}
        <div className="stat-card card-enter-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">مبيعات اليوم</p>
              <p className="text-2xl font-bold mt-1.5 text-foreground tabular-nums">
                {formatCurrency(todaySalesAmount.toString())}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {salesStats.todayCount > 0 ? `${salesStats.todayCount} فواتير مسجلة اليوم` : "لا توجد مبيعات مسجلة اليوم"}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="stat-card card-enter-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">دليل الأدوية والمنتجات</p>
              <p className="text-2xl font-bold mt-1.5 text-foreground tabular-nums">{totalProducts}</p>
              <Link href="/dashboard/inventory/products" className="text-[11px] text-primary hover:underline mt-1 inline-flex items-center gap-1">
                عرض كل المنتجات <ArrowRight className="w-3 h-3 rotate-180" />
              </Link>
            </div>
            <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Active Pharmacies */}
        <div className="stat-card card-enter-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">الصيدليات والعملاء</p>
              <p className="text-2xl font-bold mt-1.5 text-foreground tabular-nums">{totalPharmacies}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                إجمالي الديون: <span className="font-semibold text-amber-500 tabular-nums">{formatCurrency(totalReceivables.toString())}</span>
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Treasury */}
        <div className="stat-card card-enter-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">رصيد الخزينة الحالية</p>
              <p className="text-2xl font-bold mt-1.5 text-primary tabular-nums">
                {formatCurrency(treasuryBalance.toString())}
              </p>
              <Link href="/dashboard/treasury" className="text-[11px] text-primary hover:underline mt-1 inline-flex items-center gap-1">
                حركات الخزينة <ArrowRight className="w-3 h-3 rotate-180" />
              </Link>
            </div>
            <div className="p-3 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices Table (2 cols) */}
        <div className="lg:col-span-2 section-card">
          <div className="section-card-header">
            <h2 className="section-card-title">
              <FileText className="w-4 h-4 text-primary" />
              أحدث فواتير المبيعات
            </h2>
            <Link
              href="/dashboard/sales"
              className="text-xs text-primary hover:text-primary/80 hover:underline font-medium flex items-center gap-1 transition-colors"
            >
              عرض الكل <ArrowRight className="w-3 h-3 rotate-180" />
            </Link>
          </div>

          {recentInvoices.length === 0 ? (
            <div className="empty-state">
              <FileText className="empty-state-icon" />
              <p className="empty-state-title">لا توجد فواتير مبيعات مسجلة حتى الآن</p>
              <Link
                href="/dashboard/sales/new"
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="w-3 h-3" /> سجل أول فاتورة
              </Link>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead className="data-table-header">
                  <tr>
                    <th className="text-right">رقم الفاتورة</th>
                    <th className="text-right">الصيدلية</th>
                    <th className="text-center">النوع</th>
                    <th className="text-center">المبلغ</th>
                    <th className="text-center">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id} className="data-table-row">
                      <td className="data-table-cell font-mono font-medium">
                        <Link
                          href={`/dashboard/sales/${inv.id}`}
                          className="text-primary hover:underline"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="data-table-cell">
                        <p className="font-medium text-foreground text-sm">{inv.pharmacy.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{inv.pharmacy.governorate.name}</p>
                      </td>
                      <td className="data-table-cell text-center">
                        <span
                          className={cn(
                            "status-badge",
                            inv.type === "CASH"
                              ? "status-paid"
                              : "status-partial"
                          )}
                        >
                          {inv.type === "CASH" ? "نقدي" : "آجل"}
                        </span>
                      </td>
                      <td className="data-table-cell text-center font-semibold tabular-nums">
                        {formatCurrency(inv.total.toString())}
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

        {/* Side Panel: Alerts & System Health */}
        <div className="space-y-4">
          <div className="section-card p-5">
            <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              التنبيهات والإشعارات
            </h2>

            {recentAlerts.length === 0 ? (
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 text-center">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-green-800 dark:text-green-300">
                  كل شيء يسير على ما يرام!
                </p>
                <p className="text-[11px] text-green-700/80 dark:text-green-400/80 mt-0.5">
                  لا توجد تنبيهات عاجلة أو فواتير متأخرة حالياً.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-xl bg-muted/40 border border-border/50 text-xs space-y-1"
                  >
                    <p className="font-semibold text-foreground">{alert.title}</p>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">{alert.message}</p>
                    <p className="text-[10px] text-muted-foreground/70 font-mono">
                      {formatDate(alert.triggeredAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Company Quick Summary */}
          <div className="section-card p-5 space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              حالة النظام
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-border/40">
                <span className="text-muted-foreground">قاعدة البيانات:</span>
                <span className="font-medium text-green-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" /> متصلة
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/40">
                <span className="text-muted-foreground">حسابك:</span>
                <span className="font-medium text-foreground">{session.user.name} ({session.user.role})</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-muted-foreground">المنطقة الزمنية:</span>
                <span className="font-medium text-foreground">سوهاج (GMT+3)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
