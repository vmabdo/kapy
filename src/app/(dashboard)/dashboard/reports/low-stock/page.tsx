import type { Metadata } from "next";
import Link from "next/link";
import { getLowStockItems } from "@/queries/inventory";
import { getSystemSettings } from "@/queries/settings";
import { AlertTriangle, ArrowRight, Package, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "تقرير نواقص المخزون" };
export const dynamic = "force-dynamic";

export default async function LowStockReportPage() {
  // Get settings for threshold
  const settings = await getSystemSettings();
  const globalThreshold = settings?.lowStockThreshold ?? 10;

  // The database sums quantity across every warehouse, compares that total
  // with the product's reorder level (or the global fallback), and only returns
  // low-stock products — never the whole stock table.
  const filtered = await getLowStockItems({
    fallbackThreshold: globalThreshold,
  });

  // Categorize severity
  const categorized = filtered.map((item) => {
    const qty = Number(item.quantity);
    const pct = item.threshold > 0 ? (qty / item.threshold) * 100 : 0;
    const severity: "critical" | "warning" | "caution" =
      qty === 0 ? "critical" : pct <= 30 ? "warning" : "caution";
    return { ...item, pct, severity };
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
            منتجات إجمالي مخزونها وصل إلى مستوى إعادة الطلب — الحد الافتراضي العالمي: {globalThreshold} وحدة
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
                  <th className="text-center">أماكن التخزين</th>
                  <th className="text-center">إجمالي الكمية</th>
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
                    <td className="data-table-cell text-center text-sm text-muted-foreground">
                      {item.warehouseCount > 0
                        ? `${item.warehouseCount} مخزن`
                        : "بدون رصيد"}
                    </td>
                    <td className="data-table-cell text-center">
                      <span className={cn(
                        "font-bold text-lg tabular-nums",
                        item.severity === "critical" ? "text-red-600" :
                        item.severity === "warning" ? "text-amber-600" : "text-yellow-600"
                      )}>
                        {Number(item.quantity).toFixed(3)}
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
