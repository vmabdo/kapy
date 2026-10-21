import type { Metadata } from "next";
import Link from "next/link";
import { getStockMovements } from "@/queries/inventory";
import { getInventoryFinancialSummary } from "@/queries/stock-financials";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ClipboardCheck,
  Gift,
  Package,
  PackagePlus,
  Plus,
  RotateCcw,
  Settings2,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { StockMovementType } from "@prisma/client";
import { resolveMovementItemValue } from "@/lib/costing";

export const metadata: Metadata = { title: "حركات المخزون" };
export const dynamic = "force-dynamic";

const MOVEMENT_LABELS: Record<
  StockMovementType,
  { label: string; color: string; icon: React.ReactNode }
> = {
  INBOUND: {
    label: "وارد",
    color:
      "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
    icon: <ArrowDown className="w-3 h-3" />,
  },
  OUTBOUND: {
    label: "صادر",
    color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <ArrowUp className="w-3 h-3" />,
  },
  RETURN_INBOUND: {
    label: "مرتجع وارد",
    color:
      "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
    icon: <RotateCcw className="w-3 h-3" />,
  },
  RETURN_OUTBOUND: {
    label: "مرتجع صادر (قديم)",
    color:
      "text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400",
    icon: <RotateCcw className="w-3 h-3" />,
  },
  ADJUSTMENT: {
    label: "تسوية قديمة",
    color:
      "text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400",
    icon: <Settings2 className="w-3 h-3" />,
  },
  OPENING_BALANCE: {
    label: "رصيد افتتاحي",
    color:
      "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: <PackagePlus className="w-3 h-3" />,
  },
  ADJUSTMENT_IN: {
    label: "زيادة جرد",
    color:
      "text-teal-600 bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400",
    icon: <TrendingUp className="w-3 h-3" />,
  },
  ADJUSTMENT_OUT: {
    label: "نقص جرد",
    color: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
    icon: <TrendingDown className="w-3 h-3" />,
  },
  SAMPLES_DISPATCH: {
    label: "عينات ودعاية",
    color:
      "text-pink-600 bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400",
    icon: <Gift className="w-3 h-3" />,
  },
};

const KPI_CARDS = [
  {
    key: "inventory",
    label: "قيمة المخزون الحالي",
    icon: Package,
    tone: "text-blue-500 bg-blue-500/10",
  },
  {
    key: "opening",
    label: "الأرصدة الافتتاحية",
    icon: PackagePlus,
    tone: "text-emerald-500 bg-emerald-500/10",
  },
  {
    key: "purchases",
    label: "المشتريات الفعلية",
    icon: ShoppingCart,
    tone: "text-cyan-500 bg-cyan-500/10",
  },
  {
    key: "shortage",
    label: "خسائر العجز والتوالف",
    icon: TrendingDown,
    tone: "text-red-500 bg-red-500/10",
  },
  {
    key: "surplus",
    label: "فائض فروق الجرد",
    icon: TrendingUp,
    tone: "text-teal-500 bg-teal-500/10",
  },
  {
    key: "samples",
    label: "عينات ودعاية مجانية",
    icon: Gift,
    tone: "text-pink-500 bg-pink-500/10",
  },
] as const;

export default async function MovementsPage() {
  const [movements, financials] = await Promise.all([
    getStockMovements({ take: 100 }),
    getInventoryFinancialSummary(),
  ]);

  const kpiValues: Record<(typeof KPI_CARDS)[number]["key"], number> = {
    inventory: financials.inventoryValue,
    opening: financials.openingStockValue,
    purchases: financials.purchasesValue,
    shortage: financials.shortageValue,
    surplus: financials.surplusValue,
    samples: financials.samplesValue,
  };

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link
          href="/dashboard/inventory"
          className="hover:text-foreground transition-colors"
        >
          المخازن
        </Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">حركات المخزون</span>
      </nav>

      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-primary" />
            سجل حركات المخزون
          </h1>
          <p className="page-subtitle">
            سجل غير قابل للتعديل لجميع حركات المخزون — الأرصدة الافتتاحية
            وفروق الجرد وصرف العينات لا تؤثر على الخزينة النقدية
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/inventory/movements/opening-balance"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-500/10 transition-colors"
          >
            <PackagePlus className="w-4 h-4" />
            إدخال رصيد افتتاحي للمخزن
          </Link>
          <Link
            href="/dashboard/inventory/movements/correction"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-sm font-medium hover:bg-amber-500/10 transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" />
            تصحيح أعداد (فروق الجرد)
          </Link>
          <Link
            href="/dashboard/inventory/movements/samples"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-pink-500/30 bg-pink-500/5 text-pink-700 dark:text-pink-400 text-sm font-medium hover:bg-pink-500/10 transition-colors"
          >
            <Gift className="w-4 h-4" />
            صرف عينات / دعاية
          </Link>
          <Link
            href="/dashboard/inventory/movements/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            حركة جديدة
          </Link>
        </div>
      </div>

      {/* Financial snapshot */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mt-6">
        {KPI_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="bg-card border border-border rounded-xl p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {card.label}
                </p>
                <span
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    card.tone
                  )}
                >
                  <Icon className="w-4 h-4" />
                </span>
              </div>
              <p className="text-lg font-extrabold font-mono text-foreground mt-2">
                {formatCurrency(kpiValues[card.key])}
              </p>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
        {movements.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">لا توجد حركات مخزون بعد</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm">
              <Link
                href="/dashboard/inventory/movements/opening-balance"
                className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
              >
                <PackagePlus className="w-3.5 h-3.5" /> إدخال رصيد افتتاحي
              </Link>
              <Link
                href="/dashboard/inventory/movements/samples"
                className="inline-flex items-center gap-1 text-pink-600 hover:underline"
              >
                <Gift className="w-3.5 h-3.5" /> صرف عينات / دعاية
              </Link>
              <Link
                href="/dashboard/inventory/movements/new"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> سجل أول حركة
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">
                    النوع
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    المصدر/الوجهة
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    المنتجات
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                    إجمالي الوحدات
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    القيمة المالية
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    المرجع
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    التاريخ
                  </th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => {
                  const typeInfo = MOVEMENT_LABELS[movement.movementType];
                  const totalUnits = movement.items.reduce(
                    (sum, item) => sum + Number(item.quantity),
                    0
                  );
                  const financialValue =
                    movement.totalCost !== null &&
                    movement.totalCost !== undefined
                      ? Number(movement.totalCost)
                      : movement.items.reduce(
                          (sum, item) =>
                            sum + resolveMovementItemValue(item),
                          0
                        );
                  const fromLabel =
                    movement.supplier?.name ??
                    movement.sourceWarehouse?.name ??
                    movement.salesRep?.name ??
                    "—";
                  const toLabel =
                    movement.targetWarehouse?.name ??
                    movement.salesRep?.name ??
                    "—";

                  return (
                    <tr key={movement.id} className="data-table-row">
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap",
                            typeInfo.color
                          )}
                        >
                          {typeInfo.icon}
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {fromLabel}
                          </span>
                          {toLabel !== "—" && (
                            <>
                              <ArrowRight className="w-3 h-3 rotate-180 shrink-0" />
                              <span>{toLabel}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {movement.items.slice(0, 2).map((item) => (
                            <span
                              key={item.id}
                              className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
                            >
                              {item.product.name}
                            </span>
                          ))}
                          {movement.items.length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{movement.items.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {totalUnits}
                      </td>
                      <td className="px-4 py-3 text-left font-mono text-xs font-semibold whitespace-nowrap">
                        {formatCurrency(financialValue)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {movement.referenceNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(movement.movedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
