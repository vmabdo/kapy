import type { Metadata } from "next";
import Link from "next/link";
import {
  Package,
  PackagePlus,
  Plus,
  Warehouse,
  ArrowLeftRight,
  AlertTriangle,
  Gift,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getAllWarehouses, getLowStockItems } from "@/queries/inventory";
import { getInventoryFinancialSummary } from "@/queries/stock-financials";
import { WarehouseType } from "@prisma/client";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { getZonedMonthRange, getZonedYearMonth } from "@/lib/datetime";
import { SupplierDialog } from "@/components/inventory/supplier-dialog";

export const metadata: Metadata = { title: "إدارة المخازن" };

// Force dynamic rendering so data is always fresh
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const currentPeriod = getZonedYearMonth(new Date());
  const { start: startOfMonth, endExclusive: endOfMonth } =
    getZonedMonthRange(currentPeriod.year, currentPeriod.month);

  const [warehouses, lowStockItems, inventoryFinancials] = await Promise.all([
    getAllWarehouses(),
    getLowStockItems(),
    getInventoryFinancialSummary({ from: startOfMonth, to: endOfMonth }),
  ]);

  const mainWarehouse = warehouses.find((w) => w.type === WarehouseType.MAIN);
  const subWarehouses = warehouses.filter((w) => w.type === WarehouseType.SUB);
  const netAdjustment =
    inventoryFinancials.surplusValue - inventoryFinancials.shortageValue;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            إدارة المخازن والمخزون
          </h1>
          <p className="page-subtitle">
            {warehouses.length} مخزن نشط — {lowStockItems.length > 0 && (
              <span className="text-amber-600 font-medium">{lowStockItems.length} منتج يحتاج إعادة طلب</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SupplierDialog />
          <Link
            href="/dashboard/inventory/movements/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
            حركة مخزون
          </Link>
          <Link
            href="/dashboard/inventory/warehouses/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            مخزن جديد
          </Link>
        </div>
      </div>

      {/* Inventory financial snapshot */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground">
              قيمة المخزون الحالي
            </p>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-500 shrink-0">
              <Package className="w-4 h-4" />
            </span>
          </div>
          <p className="text-lg font-extrabold font-mono text-foreground mt-2">
            {formatCurrency(inventoryFinancials.inventoryValue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            أصول مخزنية بسعر التكلفة
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground">
              رأس المال المخزني الافتتاحي
            </p>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
              <PackagePlus className="w-4 h-4" />
            </span>
          </div>
          <p className="text-lg font-extrabold font-mono text-foreground mt-2">
            {formatCurrency(inventoryFinancials.openingStockValue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            بضاعة أول المدة — بدون تأثير نقدي
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground">
              مشتريات الشهر
            </p>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-500/10 text-cyan-500 shrink-0">
              <ShoppingCart className="w-4 h-4" />
            </span>
          </div>
          <p className="text-lg font-extrabold font-mono text-foreground mt-2">
            {formatCurrency(inventoryFinancials.purchasesValue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            الوارد الفعلي من الموردين هذا الشهر
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground">
              عينات ودعاية هذا الشهر
            </p>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-pink-500/10 text-pink-500 shrink-0">
              <Gift className="w-4 h-4" />
            </span>
          </div>
          <p className="text-lg font-extrabold font-mono text-pink-600 mt-2">
            {formatCurrency(inventoryFinancials.samplesValue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            مصروف تسويق غير نقدي — لا يمس الخزينة
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground">
              صافي فروق الجرد هذا الشهر
            </p>
            <span
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                netAdjustment >= 0
                  ? "bg-teal-500/10 text-teal-500"
                  : "bg-red-500/10 text-red-500"
              )}
            >
              {netAdjustment >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
            </span>
          </div>
          <p
            className={cn(
              "text-lg font-extrabold font-mono mt-2",
              netAdjustment >= 0 ? "text-teal-600" : "text-red-500"
            )}
          >
            {formatCurrency(netAdjustment)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            زيادة {formatCurrency(inventoryFinancials.surplusValue)} / نقص{" "}
            {formatCurrency(inventoryFinancials.shortageValue)}
          </p>
        </div>
      </div>

      {/* Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              تنبيه: {lowStockItems.length} منتج وصل لمستوى إعادة الطلب
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {lowStockItems.slice(0, 5).map((item) => (
                <span
                  key={item.id}
                  className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-md"
                >
                  {item.product.name} ({Number(item.quantity).toFixed(2)} متبقي)
                </span>
              ))}
              {lowStockItems.length > 5 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  و {lowStockItems.length - 5} أخرى...
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-muted/50 rounded-xl w-fit">
        {[
          { label: "نظرة عامة", href: "/dashboard/inventory", active: true },
          { label: "المنتجات", href: "/dashboard/inventory/products" },
          { label: "حركات المخزون", href: "/dashboard/inventory/movements" },
          { label: "الموردون", href: "/dashboard/inventory/suppliers" },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150",
              tab.active
                ? "bg-white dark:bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Main Warehouse */}
      {mainWarehouse && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Warehouse className="w-4 h-4" />
            المخزن الرئيسي
          </h2>
          <WarehouseCard warehouse={mainWarehouse} isMain />
        </div>
      )}

      {/* Sub Warehouses */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Warehouse className="w-4 h-4" />
          المخازن الفرعية ({subWarehouses.length})
        </h2>
        {subWarehouses.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
            <Warehouse className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">لا توجد مخازن فرعية بعد</p>
            <Link
              href="/dashboard/inventory/warehouses/new"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              إضافة مخزن فرعي
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {subWarehouses.map((wh) => (
              <WarehouseCard key={wh.id} warehouse={wh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Inline Warehouse Card ─────────────────────────────────── */
type WarehouseData = Awaited<ReturnType<typeof getAllWarehouses>>[number];

function WarehouseCard({
  warehouse,
  isMain = false,
}: {
  warehouse: WarehouseData;
  isMain?: boolean;
}) {
  const totalProducts = warehouse._count.stockItems;
  const totalUnits = warehouse.stockItems.reduce((s, i) => s + Number(i.quantity), 0);
  const manager = warehouse.managers[0];

  return (
    <Link
      href={`/dashboard/inventory/warehouses/${warehouse.id}`}
      className={cn(
        "group block rounded-xl border p-5 hover:shadow-md transition-all duration-200",
        isMain
          ? "bg-gradient-to-br from-primary/5 to-cyan-500/5 border-primary/20 hover:border-primary/40"
          : "bg-card border-border hover:border-primary/20"
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              isMain
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors"
            )}
          >
            <Warehouse className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">{warehouse.name}</p>
            <p className="text-xs text-muted-foreground">{warehouse.governorate.name}</p>
          </div>
        </div>
        <span
          className={cn(
            "text-[10px] font-semibold px-2 py-0.5 rounded-full",
            isMain
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isMain ? "رئيسي" : "فرعي"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-background/60 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">عدد المنتجات</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{totalProducts}</p>
        </div>
        <div className="bg-background/60 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">إجمالي الوحدات</p>
          <p className="text-xl font-bold text-foreground mt-0.5">
            {formatNumber(totalUnits)}
          </p>
        </div>
      </div>

      {manager && (
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          مدير المخزن: {manager.name}
        </p>
      )}
    </Link>
  );
}
