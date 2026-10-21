import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllProducts,
  getAllWarehouses,
  getStockLevels,
} from "@/queries/inventory";
import { OpeningBalanceForm } from "@/components/inventory/opening-balance-form";
import { ArrowRight, PackagePlus } from "lucide-react";
import { resolveProductCost } from "@/lib/costing";

export const metadata: Metadata = { title: "الرصيد الافتتاحي للمخزن" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: { warehouseId?: string };
}

export default async function OpeningBalancePage({ searchParams }: Props) {
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
    costPrice: resolveProductCost(product),
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
        <span className="text-foreground font-medium">رصيد افتتاحي</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <PackagePlus className="w-6 h-6 text-emerald-600" />
            إدخال رصيد افتتاحي للمخزن
          </h1>
          <p className="page-subtitle">
            تسجيل الكميات الفعلية الحالية وتقييمها كرأس مال مخزني افتتاحي — بدون
            تأثير على الخزينة أو مديونية الموردين
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          بضاعة أول المدة
        </div>
      </div>

      <OpeningBalanceForm
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
