import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAllSalesReps } from "@/queries/sales";
import { getAllProducts } from "@/queries/inventory";
import { InvoiceForm } from "@/components/sales/invoice-form";
import { getRequiredSession } from "@/lib/auth-utils";
import { UserRole } from "@prisma/client";
import { FileText, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "إصدار فاتورة جديدة" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage({ searchParams }: { searchParams: { clientId?: string } }) {
  const session = await getRequiredSession();
  const isSalesRep = session.user.role === UserRole.SALES_REP;

  const [clients, salesReps, products, subWarehouses] = await Promise.all([
    prisma.pharmacy.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        clientType: true,
        governorateId: true,
        address: true,
        currentBalance: true,
        creditLimit: true,
        governorate: { select: { id: true, name: true } },
      },
    }),
    getAllSalesReps(),
    getAllProducts(),
    // Invoices are fulfilled from the SUB warehouse in the client's governorate.
    // Fetching them lets the product combobox show accurate per-governorate stock.
    prisma.warehouse.findMany({
      where: { type: "SUB", isActive: true },
      select: { id: true, governorateId: true },
    }),
  ]);

  const visibleSalesReps = isSalesRep
    ? salesReps.filter((rep) => rep.id === session.user.salesRepId)
    : salesReps;

  const warehouseGovernorate = new Map(
    subWarehouses.map((warehouse) => [warehouse.id, warehouse.governorateId])
  );

  const productOptions = products.map((product) => {
    const stockByGovernorate: Record<string, number> = {};
    let totalStock = 0;

    for (const stockItem of product.stockItems) {
      const available = Math.max(
        0,
        Number(stockItem.quantity) - Number(stockItem.reservedQty)
      );
      const governorateId = warehouseGovernorate.get(stockItem.warehouseId);
      if (!governorateId) continue;

      totalStock += available;
      stockByGovernorate[governorateId] =
        (stockByGovernorate[governorateId] ?? 0) + available;
    }

    return {
      id: product.id,
      name: product.name,
      nameEn: product.nameEn,
      sku: product.sku,
      unit: product.unit,
      sellingPrice: Number(product.sellingPrice),
      stockByGovernorate,
      totalStock,
    };
  });

  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/sales" className="hover:text-foreground transition-colors">المبيعات والفواتير</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">فاتورة جديدة</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            إصدار فاتورة مبيعات
          </h1>
          <p className="page-subtitle">إنشاء فاتورة نقدية أو آجلة لصيدلية أو مستودع خارجي</p>
        </div>
      </div>

      <InvoiceForm
        pharmacies={clients.map(c => ({
          id: c.id,
          name: c.name,
          clientType: c.clientType,
          governorateId: c.governorateId,
          address: c.address,
          currentBalance: Number(c.currentBalance),
          creditLimit: c.creditLimit === null ? null : Number(c.creditLimit),
          governorate: c.governorate,
        }))}
        salesReps={visibleSalesReps}
        products={productOptions}
        initialClientId={searchParams.clientId}
        allowLegacy={!isSalesRep}
      />
    </div>
  );
}

