import type { Metadata } from "next";
import Link from "next/link";
import { getStockMovements } from "@/queries/inventory";
import { Package, ArrowLeftRight, ArrowRight, Plus, ArrowUp, ArrowDown, RotateCcw, Settings2 } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { StockMovementType } from "@prisma/client";

export const metadata: Metadata = { title: "حركات المخزون" };
export const dynamic = "force-dynamic";

const MOVEMENT_LABELS: Record<StockMovementType, { label: string; color: string; icon: React.ReactNode }> = {
  INBOUND:         { label: "وارد", color: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400", icon: <ArrowDown className="w-3 h-3" /> },
  OUTBOUND:        { label: "صادر", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400", icon: <ArrowUp className="w-3 h-3" /> },
  RETURN_INBOUND:  { label: "مرتجع وارد", color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400", icon: <RotateCcw className="w-3 h-3" /> },
  RETURN_OUTBOUND: { label: "مرتجع صادر", color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400", icon: <RotateCcw className="w-3 h-3" /> },
  ADJUSTMENT:      { label: "تسوية", color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400", icon: <Settings2 className="w-3 h-3" /> },
};

export default async function MovementsPage() {
  const movements = await getStockMovements({ take: 100 });

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/inventory" className="hover:text-foreground transition-colors">المخازن</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">حركات المخزون</span>
      </nav>

      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-primary" />
            سجل حركات المخزون
          </h1>
          <p className="page-subtitle">سجل غير قابل للتعديل لجميع حركات المخزون</p>
        </div>
        <Link
          href="/dashboard/inventory/movements/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          حركة جديدة
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
        {movements.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">لا توجد حركات مخزون بعد</p>
            <Link href="/dashboard/inventory/movements/new" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" /> سجل أول حركة
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">النوع</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">المصدر/الوجهة</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">المنتجات</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">إجمالي الوحدات</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">المرجع</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => {
                  const typeInfo = MOVEMENT_LABELS[movement.movementType];
                  const totalUnits = movement.items.reduce((s, i) => s + i.quantity, 0);
                  const fromLabel = movement.supplier?.name ?? movement.sourceWarehouse?.name ?? movement.salesRep?.name ?? "—";
                  const toLabel = movement.targetWarehouse?.name ?? movement.salesRep?.name ?? "—";

                  return (
                    <tr key={movement.id} className="data-table-row">
                      <td className="px-5 py-3">
                        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full", typeInfo.color)}>
                          {typeInfo.icon}
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{fromLabel}</span>
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
                            <span key={item.id} className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                              {item.product.name}
                            </span>
                          ))}
                          {movement.items.length > 2 && (
                            <span className="text-xs text-muted-foreground">+{movement.items.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">{totalUnits}</td>
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
