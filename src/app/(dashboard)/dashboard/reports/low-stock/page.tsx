import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AlertTriangle, ArrowRight, Package, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "تقرير نواقص المخزون" };
export const dynamic = "force-dynamic";

export default async function LowStockReportPage() {
  // Get settings for threshold
  const settings = await prisma.appSettings.findFirst();
  const globalThreshold = settings?.lowStockThreshold ?? 10;

  // Find all stock items where quantity <= product.reorderLevel (or global threshold if reorderLevel = 0)
  const lowStockItems = await prisma.stockItem.findMany({
    where: {
      product: { isActive: true },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          reorderLevel: true,
          category: { select: { name: true } },
        },
      },
      warehouse: {
        select: { id: true, name: true, type: true },
      },
    },
    orderBy: { quantity: "asc" },
  });

  // Filter: items below their effective threshold
  const filtered = lowStockItems.filter((item) => {
    const threshold = item.product.reorderLevel > 0 ? item.product.reorderLevel : globalThreshold;
    return item.quantity <= threshold;
  });

  // Categorize severity
  const categorized = filtered.map((item) => {
    const threshold = item.product.reorderLevel > 0 ? item.product.reorderLevel : globalThreshold;
    const pct = threshold > 0 ? (item.quantity / threshold) * 100 : 0;
    const severity: "critical" | "warning" | "caution" =
      item.quantity === 0 ? "critical" : pct <= 30 ? "warning" : "caution";
    return { ...item, threshold, pct, severity };
  });

  const criticalCount = categorized.filter((i) => i.severity === "critical").length;
  const warningCount = categorized.filter((i) => i.severity === "warning").length;
  const cautionCount = categorized.filter((i) => i.severity === "caution").length;

  return (
    <div dir="rtl" className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/reports" className="hover:text-foreground transition-colors">
          التقارير
        </Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">نواقص المخزون</span>
      </nav>

      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            تقرير نواقص المخزون
          </h1>
          <p className="page-subtitle">
            منتجات وصلت إلى مستوى إعادة الطلب — الحد الافتراضي العالمي: {globalThreshold} وحدة
          </p>
        </div>
        <Link
          href="/dashboard/inventory"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          <Package className="w-4 h-4" />
          إدارة المخزون
        </Link>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="stat-card card-enter-1">
          <p className="text-xs text-muted-foreground font-medium">إجمالي النواقص</p>
          <p className="text-2xl font-bold mt-1.5 tabular-nums">{filtered.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">منتج يحتاج اهتماماً</p>
        </div>
        <div className="stat-card card-enter-2 border-red-200 dark:border-red-800/50">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">نفاذ تام</p>
          <p className="text-2xl font-bold mt-1.5 text-red-600 tabular-nums">{criticalCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">كمية = 0</p>
        </div>
        <div className="stat-card card-enter-3 border-amber-200 dark:border-amber-800/50">
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">تحذير حرج</p>
          <p className="text-2xl font-bold mt-1.5 text-amber-600 tabular-nums">{warningCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">أقل من 30% من الحد</p>
        </div>
        <div className="stat-card card-enter-4 border-yellow-200 dark:border-yellow-800/50">
          <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">تنبيه</p>
          <p className="text-2xl font-bold mt-1.5 text-yellow-600 tabular-nums">{cautionCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">قريب من الحد</p>
        </div>
      </div>

      {/* Table */}
      <div className="section-card">
        <div className="section-card-header">
          <h2 className="section-card-title">
            <BarChart3 className="w-4 h-4 text-primary" />
            قائمة المنتجات الناقصة
          </h2>
          <span className="text-xs text-muted-foreground">{filtered.length} منتج</span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <Package className="empty-state-icon" />
            <p className="empty-state-title">لا توجد نواقص في المخزون</p>
            <p className="empty-state-desc">جميع المنتجات فوق مستوى الحد الأدنى لإعادة الطلب</p>
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead className="data-table-header">
                <tr>
                  <th className="text-right">المنتج</th>
                  <th className="text-right">الفئة</th>
                  <th className="text-right">المخزن</th>
                  <th className="text-center">الكمية الحالية</th>
                  <th className="text-center">حد إعادة الطلب</th>
                  <th className="text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {categorized.map((item) => (
                  <tr key={item.id} className="data-table-row">
                    <td className="data-table-cell">
                      <Link
                        href={`/dashboard/inventory/products/${item.product.id}`}
                        className="font-medium hover:text-primary hover:underline transition-colors"
                      >
                        {item.product.name}
                      </Link>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{item.product.sku}</p>
                    </td>
                    <td className="data-table-cell text-sm text-muted-foreground">
                      {item.product.category.name}
                    </td>
                    <td className="data-table-cell text-sm">
                      <span className="flex items-center gap-1.5">
                        {item.warehouse.name}
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full font-semibold",
                          item.warehouse.type === "MAIN"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {item.warehouse.type === "MAIN" ? "رئيسي" : "فرعي"}
                        </span>
                      </span>
                    </td>
                    <td className="data-table-cell text-center">
                      <span className={cn(
                        "font-bold text-lg tabular-nums",
                        item.severity === "critical" ? "text-red-600" :
                        item.severity === "warning" ? "text-amber-600" : "text-yellow-600"
                      )}>
                        {item.quantity}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">{item.product.unit}</span>
                    </td>
                    <td className="data-table-cell text-center text-sm text-muted-foreground tabular-nums">
                      {item.threshold}
                    </td>
                    <td className="data-table-cell text-center">
                      <span className={cn(
                        "status-badge",
                        item.severity === "critical"
                          ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800/50"
                          : item.severity === "warning"
                          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50"
                          : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800/50"
                      )}>
                        {item.severity === "critical" ? "نفاذ تام" :
                         item.severity === "warning" ? "حرج" : "تنبيه"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
