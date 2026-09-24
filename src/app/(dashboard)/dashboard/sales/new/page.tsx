import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAllSalesReps } from "@/queries/sales";
import { getAllProducts } from "@/queries/inventory";
import { InvoiceForm } from "@/components/sales/invoice-form";
import { FileText, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "إصدار فاتورة جديدة" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage({ searchParams }: { searchParams: { clientId?: string } }) {
  const [clients, salesReps, products] = await Promise.all([
    prisma.pharmacy.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    getAllSalesReps(),
    getAllProducts(),
  ]);

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
        pharmacies={clients.map(c => ({ id: c.id, name: c.name, clientType: c.clientType }))}
        salesReps={salesReps}
        products={products.map(p => ({ id: p.id, name: p.name, sku: p.sku, sellingPrice: Number(p.sellingPrice) }))}
        initialClientId={searchParams.clientId}
      />
    </div>
  );
}

