import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllProducts,
  getAllWarehouses,
  getStockLevels,
} from "@/queries/inventory";
import { StockCorrectionForm } from "@/components/inventory/stock-correction-form";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { resolveProductCost } from "@/lib/costing";

export const metadata: Metadata = { title: "تصحيح أعداد المخزن" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: { warehouseId?: string };
}

export default async function StockCorrectionPage({ searchParams }: Props) {
  const [warehouses, productsRaw, stockLevelsRaw] = await Promise.all([
    getAllWarehouses(),
    getAllProducts(),
    getStockLevels(),
  ]);

  const products = productsRaw.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    unitCost: resolveProductCost(product),
  }));

  const stockLevels = stockLevelsRaw.map((level) => ({
    warehouseId: level.warehouseId,
    productId: level.productId,
    quantity: Number(level.quantity),
  }));

  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link
          href="/dashboard/inventory"
          className="hover:text-foreground transition-colors"
        >
          المخازن
        </Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <Link
          href="/dashboard/inventory/movements"
          className="hover:text-foreground transition-colors"
        >
          حركات المخزون
        </Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">فروق الجرد</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-amber-600" />
            تصحيح أعداد المخزن (فروق الجرد)
          </h1>
          <p className="page-subtitle">
            تسجيل نقص أو زيادة بعد الجرد الفعلي، مع حساب التأثير المالي تلقائياً
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
          عجز / فائض جرد
        </div>
      </div>

      <StockCorrectionForm
        warehouses={warehouses.map((warehouse) => ({
          id: warehouse.id,
          name: warehouse.name,
          type: warehouse.type,
        }))}
        products={products}
        stockLevels={stockLevels}
        defaultWarehouseId={searchParams.warehouseId}
      />
    </div>
  );
}
