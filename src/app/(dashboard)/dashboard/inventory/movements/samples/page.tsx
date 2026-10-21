import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllProducts,
  getAllWarehouses,
  getStockLevels,
} from "@/queries/inventory";
import { getAllSalesReps } from "@/queries/sales";
import { SamplesDispatchForm } from "@/components/inventory/samples-dispatch-form";
import { ArrowRight, Gift } from "lucide-react";
import { resolveProductCost } from "@/lib/costing";

export const metadata: Metadata = { title: "صرف عينات / دعاية مجانية" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: { warehouseId?: string };
}

export default async function SamplesDispatchPage({ searchParams }: Props) {
  const [warehouses, productsRaw, salesRepsRaw, stockLevelsRaw] =
    await Promise.all([
      getAllWarehouses(),
      getAllProducts(),
      getAllSalesReps(),
      getStockLevels(),
    ]);

  const products = productsRaw.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    costPrice: resolveProductCost(product),
  }));

  const salesReps = salesRepsRaw.map((rep) => ({
    id: rep.id,
    name: rep.name,
    employeeCode: rep.employeeCode,
  }));

  const stockLevels = stockLevelsRaw.map((level) => ({
    warehouseId: level.warehouseId,
    productId: level.productId,
    quantity: Number(level.quantity),
    reservedQty: Number(level.reservedQty),
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
        <span className="text-foreground font-medium">صرف عينات</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Gift className="w-6 h-6 text-pink-500" />
            صرف عينات / دعاية مجانية
          </h1>
          <p className="page-subtitle">
            صرف عينات طبية للمناديب وتحميل قيمتها كمصروف تسويق — بدون تأثير على
            الخزينة أو أهداف المبيعات
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-pink-500/20 bg-pink-500/5 px-4 py-2 text-xs font-semibold text-pink-700 dark:text-pink-400">
          مصروف تسويق غير نقدي
        </div>
      </div>

      <SamplesDispatchForm
        warehouses={warehouses.map((warehouse) => ({
          id: warehouse.id,
          name: warehouse.name,
          type: warehouse.type,
        }))}
        products={products}
        salesReps={salesReps}
        stockLevels={stockLevels}
        defaultWarehouseId={searchParams.warehouseId}
      />
    </div>
  );
}
