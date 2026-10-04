import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
  Activity,
  AlertOctagon
} from "lucide-react";
import { SalesTrendChart } from "@/components/dashboard/sales-trend-chart";
import { TopProductsChart } from "@/components/dashboard/top-products-chart";

export const metadata: Metadata = { title: "لوحة التحكم" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getRequiredSession();

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

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent session={session} />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-[400px] w-full rounded-xl" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-[300px] w-full rounded-xl" />
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    </div>
  );
}

async function DashboardContent({ session }: { session: any }) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  // Fetch all dashboard stats in parallel
  const [
    salesStats,
    monthInvoices,
    monthPayments,
    productsData,
    thirtyDayInvoices,
    recentInvoices,
    recentPayments,
    topProductItems,
  ] = await Promise.all([
    getSalesStats(),
    // 1. Total Sales Revenue (Current Month)
    prisma.invoice.aggregate({
      where: { invoiceDate: { gte: startOfMonth }, status: { not: "DRAFT" }, isLegacy: false },
      _sum: { total: true },
    }),
    // 2. Total Cash Collected (Current Month)
    prisma.payment.aggregate({
      where: { paidAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    // 3. Products for low stock
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, reorderLevel: true, stockItems: { select: { quantity: true } } }
    }),
    // 4. Sales Trend (Last 30 days)
    prisma.invoice.findMany({
      where: { invoiceDate: { gte: thirtyDaysAgo }, status: { not: "DRAFT" }, isLegacy: false },
      select: { invoiceDate: true, total: true }
    }),
    // 5. Recent Invoices
    prisma.invoice.findMany({
      take: 5,
      orderBy: { invoiceDate: "desc" },
      include: { pharmacy: { select: { name: true } } }
    }),
    // 6. Recent Payments
    prisma.payment.findMany({
      take: 5,
      orderBy: { paidAt: "desc" },
      include: { pharmacy: { select: { name: true } } }
    }),
    // 7. Top Products
    prisma.invoiceItem.groupBy({
      by: ['productId'],
      where: { invoice: { invoiceDate: { gte: startOfMonth }, status: { not: "DRAFT" } } },
      _sum: { lineTotal: true, quantity: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 5,
    }),
  ]);

  const topProductsWithDetails = await prisma.product.findMany({
    where: { id: { in: topProductItems.map(p => p.productId) } },
    select: { id: true, name: true }
  });

  const topProductsData = topProductItems.map(item => ({
    name: topProductsWithDetails.find(p => p.id === item.productId)?.name || 'Unknown',
    revenue: Number(item._sum.lineTotal),
    quantity: Number(item._sum.quantity)
  }));

  const salesMonthTotal = Number(monthInvoices._sum.total || 0);
  const cashCollectedMonth = Number(monthPayments._sum.amount || 0);
  const totalReceivables = Number(salesStats.totalReceivables || 0);

  // Calculate low stock products
  const lowStockAlerts = productsData
    .map(p => ({
      id: p.id,
      name: p.name,
      stock: p.stockItems.reduce((sum, item) => sum + Number(item.quantity), 0),
      reorderLevel: p.reorderLevel
    }))
    .filter(p => p.stock <= p.reorderLevel);
  const lowStockCount = lowStockAlerts.length;
  const topLowStock = lowStockAlerts.slice(0, 5);

  // Group 30-day sales
  const salesByDay = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    salesByDay.set(d.toISOString().split('T')[0], 0);
  }
  
  thirtyDayInvoices.forEach(inv => {
    const dStr = inv.invoiceDate.toISOString().split('T')[0];
    if (salesByDay.has(dStr)) {
      salesByDay.set(dStr, salesByDay.get(dStr)! + Number(inv.total));
    }
  });

  const salesTrendData = Array.from(salesByDay.entries()).map(([date, total]) => ({ date, total }));

  // Combined Recent Activity
  const combinedActivity = [
    ...recentInvoices.map(inv => ({
      id: `inv-${inv.id}`,
      type: 'INVOICE' as const,
      date: inv.invoiceDate,
      clientName: inv.pharmacy.name,
      amount: Number(inv.total),
      desc: 'إصدار فاتورة'
    })),
    ...recentPayments.map(pay => ({
      id: `pay-${pay.id}`,
      type: 'PAYMENT' as const,
      date: pay.paidAt,
      clientName: pay.pharmacy.name,
      amount: Number(pay.amount),
      desc: 'تحصيل دفعة'
    }))
  ]
  .sort((a, b) => b.date.getTime() - a.date.getTime())
  .slice(0, 5);

  return (
    <>
      {/* Top Row: KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sales Revenue (Month) */}
        <div className="stat-card card-enter-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">مبيعات الشهر</p>
              <p className="text-2xl font-bold mt-1.5 text-foreground tabular-nums">
                {formatCurrency(salesMonthTotal.toString())}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 text-emerald-500 font-medium">
                هذا الشهر
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Cash Collected (Month) */}
        <div className="stat-card card-enter-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">التحصيلات النقدية</p>
              <p className="text-2xl font-bold mt-1.5 text-foreground tabular-nums">
                {formatCurrency(cashCollectedMonth.toString())}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 text-emerald-500 font-medium">
                هذا الشهر
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Outstanding Debt */}
        <div className="stat-card card-enter-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">إجمالي ديون العملاء</p>
              <p className="text-2xl font-bold mt-1.5 text-foreground tabular-nums text-amber-500">
                {formatCurrency(totalReceivables.toString())}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                المديونية الحالية المتراكمة
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="stat-card card-enter-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">نواقص المخزون</p>
              <p className="text-2xl font-bold mt-1.5 text-foreground tabular-nums">
                {lowStockCount} <span className="text-sm font-normal text-muted-foreground">منتج</span>
              </p>
              <Link href="/dashboard/inventory/products" className="text-[11px] text-primary hover:underline mt-1 inline-flex items-center gap-1">
                تخطى حد إعادة الطلب <ArrowRight className="w-3 h-3 rotate-180" />
              </Link>
            </div>
            <div className="p-3 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 shrink-0">
              <AlertOctagon className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 section-card card-enter-2">
          <div className="section-card-header mb-0 border-b border-border/40 pb-4">
            <h2 className="section-card-title">
              <Activity className="w-4 h-4 text-primary" />
              مبيعات آخر 30 يوماً
            </h2>
          </div>
          <SalesTrendChart data={salesTrendData} />
        </div>

        <div className="lg:col-span-1 section-card card-enter-3">
          <div className="section-card-header mb-0 border-b border-border/40 pb-4">
            <h2 className="section-card-title">
              <Package className="w-4 h-4 text-primary" />
              الأصناف الأكثر مبيعاً
            </h2>
          </div>
          <TopProductsChart data={topProductsData} />
        </div>
      </div>

      {/* Bottom Row: Activity & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 section-card card-enter-3">
          <div className="section-card-header">
            <h2 className="section-card-title">
              <Clock className="w-4 h-4 text-primary" />
              أحدث الحركات
            </h2>
          </div>
          {combinedActivity.length === 0 ? (
             <div className="empty-state py-8">
              <FileText className="empty-state-icon" />
              <p className="empty-state-title">لا توجد حركات مسجلة</p>
            </div>
          ) : (
            <div className="space-y-1">
              {combinedActivity.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-full",
                      activity.type === 'INVOICE' ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"
                    )}>
                      {activity.type === 'INVOICE' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{activity.clientName}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{activity.desc} • {formatDate(activity.date)}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className={cn(
                      "font-bold text-sm tabular-nums",
                      activity.type === 'INVOICE' ? "text-foreground" : "text-emerald-600 dark:text-emerald-400"
                    )}>
                      {activity.type === 'INVOICE' ? "+" : ""}{formatCurrency(activity.amount.toString())}
                    </p>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-md mt-1 inline-block",
                      activity.type === 'INVOICE' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    )}>
                      {activity.type === 'INVOICE' ? "فاتورة" : "سداد"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1 section-card card-enter-4">
          <div className="section-card-header">
            <h2 className="section-card-title text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
              تنبيهات النواقص
            </h2>
          </div>
          {topLowStock.length === 0 ? (
            <div className="py-8 text-center rounded-xl bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30">
              <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
              <p className="text-xs font-semibold text-green-700 dark:text-green-400">المخزون آمن</p>
              <p className="text-[11px] text-green-600/70 mt-1">جميع الأصناف فوق حد إعادة الطلب</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topLowStock.map((prod) => (
                <div key={prod.id} className="flex items-center justify-between p-2.5 rounded-lg border border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/20">
                  <div>
                    <p className="font-semibold text-xs text-foreground">{prod.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">حد إعادة الطلب: {prod.reorderLevel}</p>
                  </div>
                  <div className="text-left">
                    <span className="inline-block px-2 py-1 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 font-bold text-xs tabular-nums">
                      {prod.stock}
                    </span>
                  </div>
                </div>
              ))}
              {lowStockCount > 5 && (
                <Link href="/dashboard/inventory/products" className="block text-center text-xs text-primary hover:underline mt-4 pt-2 border-t border-border/40">
                  عرض جميع النواقص ({lowStockCount})
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
