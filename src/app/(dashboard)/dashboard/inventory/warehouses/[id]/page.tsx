import { notFound } from "next/navigation";
import Link from "next/link";
import { getWarehouseById } from "@/queries/inventory";
import { ArrowRight, Warehouse, Package, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Metadata } from "next";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const wh = await getWarehouseById(params.id);
  return { title: wh?.name ?? "مخزن" };
}

export const dynamic = "force-dynamic";

export default async function WarehouseDetailPage({ params }: Props) {
  const warehouse = await getWarehouseById(params.id);
  if (!warehouse) notFound();

  const totalUnits = warehouse.stockItems.reduce((s, i) => s + i.quantity, 0);
  const lowStockItems = warehouse.stockItems.filter(
    (item) => item.quantity <= item.product.reorderLevel && item.product.reorderLevel > 0
  );

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/inventory" className="hover:text-foreground transition-colors">
          المخازن
        </Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">{warehouse.name}</span>
      </nav>

      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Warehouse className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="page-title">{warehouse.name}</h1>
            <p className="page-subtitle">
              {warehouse.governorate.name} ·{" "}
              <span className={cn(
                "font-medium",
                warehouse.isActive ? "text-green-600" : "text-red-500"
              )}>
                {warehouse.isActive ? "نشط" : "غير نشط"}
              </span>
            </p>
          </div>
        </div>
        <Link
          href={`/dashboard/inventory/movements/new?warehouseId=${warehouse.id}`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4" />
          حركة مخزون
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">إجمالي الوحدات</p>
          <p className="text-2xl font-bold mt-1">{totalUnits.toLocaleString("ar-EG")}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">عدد المنتجات</p>
          <p className="text-2xl font-bold mt-1">{warehouse.stockItems.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">تنبيهات المخزون</p>
          <p className={cn("text-2xl font-bold mt-1", lowStockItems.length > 0 ? "text-amber-500" : "text-green-600")}>
            {lowStockItems.length}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">النوع</p>
          <p className="text-lg font-bold mt-1">
            {warehouse.type === "MAIN" ? "🏭 رئيسي" : "🏪 فرعي"}
          </p>
        </div>
      </div>

      {/* Low Stock Warning */}
      {lowStockItems.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {lowStockItems.length} منتج يحتاج إعادة طلب
            </p>
            <ul className="mt-1 space-y-0.5">
              {lowStockItems.map((item) => (
                <li key={item.id} className="text-xs text-amber-700 dark:text-amber-400">
                  • {item.product.name} — متبقي: {item.quantity} (الحد الأدنى: {item.product.reorderLevel})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Stock Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-primary" />
            المنتجات والمخزون ({warehouse.stockItems.length})
          </h2>
        </div>

        {warehouse.stockItems.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p>لا توجد منتجات في هذا المخزن بعد</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">المنتج</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">الفئة</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">الوحدة</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">الكمية</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">محجوز</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">الحد الأدنى</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {warehouse.stockItems.map((item) => {
                  const isLow = item.quantity <= item.product.reorderLevel && item.product.reorderLevel > 0;
                  const available = item.quantity - item.reservedQty;
                  return (
                    <tr key={item.id} className="data-table-row">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-foreground">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.product.category.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.product.unit}</td>
                      <td className="px-4 py-3 text-center font-semibold">{item.quantity}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{item.reservedQty}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{item.product.reorderLevel}</td>
                      <td className="px-4 py-3 text-center">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" />
                            منخفض
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            جيد
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Footer */}
      {warehouse.address && (
        <p className="text-xs text-muted-foreground mt-4">
          📍 {warehouse.address}
        </p>
      )}
    </div>
  );
}
