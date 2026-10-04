import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BookOpen, ArrowRight, Building2, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LedgerTable, type LedgerEntry } from "./ledger-table";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const client = await prisma.pharmacy.findUnique({
    where: { id: params.id },
    select: { name: true },
  });
  return { title: client ? `كشف حساب — ${client.name}` : "كشف الحساب" };
}

export const dynamic = "force-dynamic";

export default async function StatementPage({ params }: Props) {
  const clientId = params.id;

  // Fetch client info
  const client = await prisma.pharmacy.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      ownerName: true,
      phone: true,
      address: true,
      clientType: true,
      currentBalance: true,
      creditLimit: true,
      governorate: { select: { name: true } },
    },
  });

  if (!client) notFound();

  // Determine backlink based on client type
  const backHref =
    client.clientType === "PHARMACY"
      ? `/dashboard/pharmacies/${clientId}`
      : `/dashboard/companies/${clientId}`;
  const backLabel =
    client.clientType === "PHARMACY" ? "تفاصيل الصيدلية" : "تفاصيل الشركة";

  return (
    <div dir="rtl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href={backHref} className="hover:text-foreground transition-colors">
          {backLabel}
        </Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">كشف الحساب</span>
      </nav>

      {/* Page Header */}
      <div className="page-header mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h1 className="page-title">كشف حساب — {client.name}</h1>
            <p className="page-subtitle flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" />
              {client.governorate.name}
              {client.ownerName && <span>· {client.ownerName}</span>}
              {client.phone && <span>· {client.phone}</span>}
            </p>
          </div>
        </div>

        {/* Current Balance Badge */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
            <Wallet className="w-4 h-4 text-amber-600" />
            <div className="text-right">
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">الرصيد الحالي (مديونية)</p>
              <p className="font-bold text-amber-700 dark:text-amber-300 text-sm">
                {formatCurrency(client.currentBalance.toString())}
              </p>
            </div>
          </div>
          {client.creditLimit && (
            <p className="text-[10px] text-muted-foreground">
              الحد الائتماني: {formatCurrency(client.creditLimit.toString())}
            </p>
          )}
        </div>
      </div>

      <Suspense fallback={<StatementSkeleton />}>
        <StatementContent clientId={clientId} clientName={client.name} clientBalance={client.currentBalance.toString()} />
      </Suspense>
    </div>
  );
}

function StatementSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
      <Skeleton className="h-[500px] w-full" />
    </div>
  );
}

async function StatementContent({ clientId, clientName, clientBalance }: { clientId: string, clientName: string, clientBalance: string }) {
  // Fetch ALL transactions for this client in parallel
  const [invoices, payments, returns] = await Promise.all([
    prisma.invoice.findMany({
      where: { pharmacyId: clientId, status: { not: "CANCELLED" } },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        type: true,
        total: true,
        createdAt: true,
        items: {
          select: { quantity: true, product: { select: { name: true } } },
          take: 3,
        },
      },
      orderBy: { invoiceDate: "asc" },
    }),

    prisma.payment.findMany({
      where: { pharmacyId: clientId },
      select: {
        id: true,
        amount: true,
        paidAt: true,
        method: true,
        referenceNo: true,
        notes: true,
        invoice: { select: { invoiceNumber: true } },
        paymentItems: {
          select: {
            paidQuantity: true,
            product: { select: { name: true } },
          },
          take: 3,
        },
      },
      orderBy: { paidAt: "asc" },
    }),

    prisma.return.findMany({
      where: { pharmacyId: clientId },
      select: {
        id: true,
        returnNumber: true,
        returnDate: true,
        totalAmount: true,
        createdAt: true,
        items: {
          select: { quantity: true, product: { select: { name: true } } },
          take: 3,
        },
      },
      orderBy: { returnDate: "asc" },
    }),
  ]);

  // Build a unified ledger entry list
  const entries: LedgerEntry[] = [];

  for (const inv of invoices) {
    const productSummary = inv.items
      .map((i) => `${Number(i.quantity)} × ${i.product.name}`)
      .join("، ");
    entries.push({
      id: inv.id,
      date: inv.invoiceDate,
      type: "INVOICE",
      reference: `فاتورة ${inv.invoiceNumber}`,
      description: productSummary || `${inv.type === "CASH" ? "نقدي" : "آجل"}`,
      debit: Number(inv.total),
      credit: 0,
    });
  }

  for (const pay of payments) {
    const METHOD_LABEL: Record<string, string> = {
      CASH: "نقدي",
      BANK_TRANSFER: "تحويل بنكي",
      CHECK: "شيك",
    };
    const itemSummary = pay.paymentItems
      .map((pi) => `${Number(pi.paidQuantity)} × ${pi.product.name}`)
      .join("، ");

    const description =
      itemSummary
        ? `سداد بكميات: ${itemSummary}`
        : pay.notes
        ? pay.notes
        : pay.referenceNo
        ? `مرجع: ${pay.referenceNo}`
        : `${METHOD_LABEL[pay.method] ?? pay.method} — مقابل ${pay.invoice.invoiceNumber}`;

    entries.push({
      id: pay.id,
      date: pay.paidAt,
      type: "PAYMENT",
      reference: `دفعة — ${pay.invoice.invoiceNumber}`,
      description,
      debit: 0,
      credit: Number(pay.amount),
    });
  }

  for (const ret of returns) {
    const productSummary = ret.items
      .map((i) => `${Number(i.quantity)} × ${i.product.name}`)
      .join("، ");
    entries.push({
      id: ret.id,
      date: ret.returnDate,
      type: "RETURN",
      reference: `مرتجع ${ret.returnNumber}`,
      description: productSummary,
      debit: 0,
      credit: Number(ret.totalAmount),
    });
  }

  // Sort chronologically
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalDebitAll = entries.reduce((s, e) => s + e.debit, 0);
  const totalCreditAll = entries.reduce((s, e) => s + e.credit, 0);

  return (
    <>
      {/* Quick Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">إجمالي الفواتير</p>
          <p className="font-bold text-foreground">{invoices.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">إجمالي المبيعات</p>
          <p className="font-bold text-blue-600">{formatCurrency(totalDebitAll)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">إجمالي التحصيلات والمرتجعات</p>
          <p className="font-bold text-green-600">{formatCurrency(totalCreditAll)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">الرصيد المديونية</p>
          <p className="font-bold text-amber-600">{formatCurrency(clientBalance)}</p>
        </div>
      </div>

      {/* Main Ledger — Client Component with filters */}
      <LedgerTable
        entries={entries}
        clientName={clientName}
        openingBalance={0}
      />
    </>
  );
}
