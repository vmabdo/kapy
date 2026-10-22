import type { Metadata } from "next";
import Link from "next/link";
import { getInvoices, getSalesStats, getSalesRepOptions } from "@/queries/sales";
import { prisma } from "@/lib/prisma";
import {
  getZonedDayRange,
  parseDateInputToZonedStart,
} from "@/lib/datetime";
import { ShoppingCart, Plus } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ClientType,
  InvoiceStatus,
  InvoiceType,
  UserRole,
} from "@prisma/client";
import { getRequiredSession } from "@/lib/auth-utils";
import { InvoicesList } from "@/components/sales/invoices-list";

export const metadata: Metadata = { title: "المبيعات والفواتير" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    status?: string;
    type?: string;
    repId?: string;
    clientId?: string;
    from?: string;
    to?: string;
  };
}

export default async function SalesPage({ searchParams }: PageProps) {
  const session = await getRequiredSession();
  const isSalesRep = session.user.role === UserRole.SALES_REP;
  // Sales reps may only see their own invoices. A rep without a linked
  // SalesRep profile gets an impossible ID so no company-wide rows leak.
  const forcedSalesRepId = isSalesRep
    ? session.user.salesRepId ?? "__unassigned_sales_rep__"
    : undefined;

  const fromDate = searchParams.from
    ? parseDateInputToZonedStart(searchParams.from)
    : null;
  const toDateStart = searchParams.to
    ? parseDateInputToZonedStart(searchParams.to)
    : null;
  const toExclusive = toDateStart
    ? getZonedDayRange(toDateStart).endExclusive
    : undefined;

  // Parse filters from URL search params. Free-text search is handled entirely
  // on the client so typing never triggers a server roundtrip.
  const filters = {
    status: Object.values(InvoiceStatus).includes(searchParams.status as InvoiceStatus)
      ? (searchParams.status as InvoiceStatus)
      : undefined,
    type: Object.values(InvoiceType).includes(searchParams.type as InvoiceType)
      ? (searchParams.type as InvoiceType)
      : undefined,
    salesRepId:
      forcedSalesRepId ?? (searchParams.repId || undefined),
    pharmacyId: searchParams.clientId || undefined,
    from: fromDate ?? undefined,
    to: toExclusive,
    take: 100,
  };

  const [invoices, stats, salesReps, clients] = await Promise.all([
    getInvoices(filters),
    getSalesStats(forcedSalesRepId),
    getSalesRepOptions(),
    prisma.pharmacy.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const visibleSalesReps = forcedSalesRepId
    ? salesReps.filter((rep) => rep.id === forcedSalesRepId)
    : salesReps;

  const overdueCount = invoices.filter((i) => i.status === InvoiceStatus.OVERDUE).length;

  const invoiceRows = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    type: invoice.type,
    isLegacy: invoice.isLegacy,
    pharmacyName: invoice.pharmacy.name,
    // External companies/warehouses are stored as Pharmacy clients.
    companyName:
      invoice.pharmacy.clientType === ClientType.EXTERNAL_WAREHOUSE
        ? invoice.pharmacy.name
        : null,
    governorateName: invoice.pharmacy.governorate.name,
    salesRepName: invoice.salesRep?.name ?? null,
    total: Number(invoice.total),
    remainingAmount: Number(invoice.remainingAmount),
    invoiceDateLabel: formatDate(invoice.invoiceDate),
  }));

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" />
            إدارة المبيعات والفواتير
          </h1>
          <p className="page-subtitle">متابعة الفواتير النقدية والآجلة والتحصيلات</p>
        </div>
        <div className="flex gap-2">
          {!isSalesRep && (
            <Link prefetch={false}
              href="/dashboard/sales-reps"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              المناديب
            </Link>
          )}
          <Link prefetch={false}
            href="/dashboard/sales/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            فاتورة جديدة
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">مبيعات اليوم (المؤكدة)</p>
          <p className="text-2xl font-bold mt-1 text-green-600">
            {formatCurrency(stats.todayTotal.toString())}
          </p>
          <p className="text-xs text-muted-foreground mt-1">من {stats.todayCount} فاتورة</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">إجمالي مبيعات الشهر</p>
          <p className="text-2xl font-bold mt-1 text-foreground">
            {formatCurrency(stats.monthTotal.toString())}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">إجمالي الديون (الآجل المستحق)</p>
          <p className="text-2xl font-bold mt-1 text-amber-500">
            {formatCurrency(stats.totalReceivables.toString())}
          </p>
        </div>
        <div className="stat-card border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">فواتير متأخرة الدفع</p>
          <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">
            {overdueCount}
          </p>
        </div>
      </div>

      {/* Invoice Table with instant client-side search */}
      <InvoicesList
        invoices={invoiceRows}
        salesReps={visibleSalesReps.map((rep) => ({ id: rep.id, name: rep.name }))}
        clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        currentFilters={{
          status: searchParams.status,
          type: searchParams.type,
          repId: forcedSalesRepId ?? searchParams.repId,
          clientId: searchParams.clientId,
          from: searchParams.from,
          to: searchParams.to,
        }}
      />
    </div>
  );
}
