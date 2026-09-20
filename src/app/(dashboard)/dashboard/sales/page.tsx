import type { Metadata } from "next";
import Link from "next/link";
import { getInvoices, getSalesStats } from "@/queries/sales";
import { ShoppingCart, Plus, Filter, FileText, ArrowRight, TrendingUp, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { InvoiceStatus, InvoiceType } from "@prisma/client";

export const metadata: Metadata = { title: "المبيعات والفواتير" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<InvoiceStatus, { label: string; class: string }> = {
  DRAFT: { label: "مسودة", class: "bg-muted text-muted-foreground" },
  CONFIRMED: { label: "مؤكدة", class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  PARTIALLY_PAID: { label: "سداد جزئي", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  PAID: { label: "مسددة", class: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  OVERDUE: { label: "متأخرة", class: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  CANCELLED: { label: "ملغاة", class: "bg-muted text-muted-foreground line-through" },
};

const TYPE_LABELS: Record<InvoiceType, string> = {
  CASH: "نقدي",
  CREDIT: "آجل",
};

export default async function SalesPage() {
  const [invoices, stats] = await Promise.all([
    getInvoices({ take: 50 }),
    getSalesStats(),
  ]);

  const overdueCount = invoices.filter((i) => i.status === InvoiceStatus.OVERDUE).length;

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
          <Link
            href="/dashboard/sales/reps"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            المندوبين
          </Link>
          <Link
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

      {/* Invoice Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 border-b border-border/60">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-primary" />
            أحدث الفواتير
          </h2>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors">
            <Filter className="w-3.5 h-3.5" />
            تصفية
          </button>
        </div>

        {invoices.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">لا توجد فواتير بعد</p>
            <Link href="/dashboard/sales/new" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" /> أنشئ فاتورة جديدة
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">رقم الفاتورة</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">الصيدلية / المندوب</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">النوع</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">الإجمالي</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">المتبقي</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">تاريخ الإصدار</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const statusInfo = STATUS_LABELS[invoice.status];
                  return (
                    <tr key={invoice.id} className="data-table-row">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/sales/${invoice.id}`} className="font-medium font-mono text-primary hover:underline">
                          {invoice.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{invoice.pharmacy.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          {invoice.pharmacy.governorate.name}
                          <ArrowRight className="w-2.5 h-2.5 rotate-180" />
                          المندوب: {invoice.salesRep.name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-full border",
                          invoice.type === InvoiceType.CASH
                            ? "border-green-200 text-green-700 bg-green-50 dark:border-green-900/50 dark:text-green-400 dark:bg-green-900/10"
                            : "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-900/50 dark:text-blue-400 dark:bg-blue-900/10"
                        )}>
                          {TYPE_LABELS[invoice.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">
                        {formatCurrency(invoice.total.toString())}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-amber-600">
                        {Number(invoice.remainingAmount) > 0 ? formatCurrency(invoice.remainingAmount.toString()) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", statusInfo.class)}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(invoice.invoiceDate)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link href={`/dashboard/sales/${invoice.id}`} className="text-xs text-primary hover:underline">
                          عرض
                        </Link>
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
