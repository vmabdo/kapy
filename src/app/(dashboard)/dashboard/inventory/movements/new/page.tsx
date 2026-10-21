import type { Metadata } from "next";
import { getAllWarehouses, getAllProducts, getAllSuppliers } from "@/queries/inventory";
import { StockMovementForm } from "@/components/inventory/stock-movement-form";
import { resolveProductCost } from "@/lib/costing";
import { ArrowRight, ArrowLeftRight } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "حركة مخزون جديدة" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: { warehouseId?: string };
}

export default async function NewStockMovementPage({ searchParams }: Props) {
  const [warehouses, productsRaw, suppliers] = await Promise.all([
    getAllWarehouses(),
    getAllProducts(),
    getAllSuppliers(),
  ]);

  const products = productsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    unit: p.unit,
    costPrice: resolveProductCost(p),
  }));

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/inventory" className="hover:text-foreground transition-colors">المخازن</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">حركة مخزون جديدة</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-primary" />
            تسجيل حركة مخزون
          </h1>
          <p className="page-subtitle">
            استلام بضاعة من مورد، تحويل بين المخازن، أو إجراء مخزني خاص
          </p>
        </div>
      </div>

      <StockMovementForm
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, type: w.type }))}
        products={products}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        defaultWarehouseId={searchParams.warehouseId}
      />
    </div>
  );
}
