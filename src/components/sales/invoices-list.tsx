"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Plus, Search, X } from "lucide-react";
import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { SalesFilters } from "@/components/sales/sales-filters";
import { SearchInput } from "@/components/ui/search-input";
import { normalizeSearchText } from "@/lib/search";
import { cn, formatCurrency } from "@/lib/utils";

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

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  type: InvoiceType;
  isLegacy: boolean;
  pharmacyName: string;
  /**
   * External warehouses/companies are stored in the `Pharmacy` table with
   * `clientType = EXTERNAL_WAREHOUSE`, so their invoice client is a company.
   */
  companyName: string | null;
  governorateName: string;
  salesRepName: string | null;
  total: number;
  remainingAmount: number;
  /** Pre-formatted on the server so SSR and hydration render identical text. */
  invoiceDateLabel: string;
}

interface Props {
  invoices: InvoiceListItem[];
  salesReps: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  currentFilters: {
    status?: string;
    type?: string;
    repId?: string;
    clientId?: string;
    from?: string;
    to?: string;
  };
}

export function InvoicesList({
  invoices,
  salesReps,
  clients,
  currentFilters,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedQuery = normalizeSearchText(searchTerm);

  // Normalize each record once per dataset, not on every keystroke.
  const searchableInvoices = useMemo(
    () =>
      invoices.map((invoice) => ({
        invoice,
        haystack: normalizeSearchText(
          `${invoice.invoiceNumber} ${invoice.pharmacyName} ${invoice.companyName ?? ""}`
        ),
      })),
    [invoices]
  );

  const filteredInvoices = useMemo(() => {
    if (!normalizedQuery) return invoices;

    return searchableInvoices
      .filter(({ haystack }) => haystack.includes(normalizedQuery))
      .map(({ invoice }) => invoice);
  }, [invoices, searchableInvoices, normalizedQuery]);

  const hasActiveFilters = Object.values(currentFilters).some(Boolean);

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 border-b border-border/60">
        <h2 className="font-semibold flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-primary" />
          الفواتير
          <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {filteredInvoices.length} من {invoices.length}
          </span>
          {hasActiveFilters && (
            <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              مصفاة
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="بحث برقم الفاتورة أو اسم الصيدلية/الشركة..."
            ariaLabel="بحث في الفواتير"
            className="sm:max-w-sm"
          />
          <SalesFilters
            salesReps={salesReps}
            clients={clients}
            currentFilters={currentFilters}
          />
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="p-12 flex flex-col items-center justify-center text-center bg-muted/10 border border-dashed border-border/60 rounded-xl m-4">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-muted-foreground opacity-50" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">
            {hasActiveFilters
              ? "لا توجد فواتير تطابق المرشحات"
              : "لا توجد فواتير مسجلة"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {hasActiveFilters
              ? "حاول تغيير أو إزالة المرشحات للوصول لنتائج أفضل."
              : "لم يتم تسجيل أي فواتير مبيعات في النظام حتى الآن."}
          </p>
          {hasActiveFilters ? (
            <Link
              prefetch={false}
              href="/dashboard/sales"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" /> إزالة المرشحات
            </Link>
          ) : (
            <Link
              prefetch={false}
              href="/dashboard/sales/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> أنشئ فاتورة جديدة
            </Link>
          )}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="p-12 flex flex-col items-center justify-center text-center bg-muted/10 border border-dashed border-border/60 rounded-xl m-4">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground opacity-50" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">
            لا توجد نتائج مطابقة للبحث
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            جرّب رقم فاتورة أو اسم صيدلية/شركة آخر، أو امسح البحث لعرض كل
            الفواتير.
          </p>
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            مسح البحث
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60">
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">رقم الفاتورة</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">العميل / المندوب</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">النوع</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">الإجمالي</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">المتبقي</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">تاريخ الإصدار</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => {
                const statusInfo = STATUS_LABELS[invoice.status];
                return (
                  <tr key={invoice.id} className="data-table-row">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          prefetch={false}
                          href={`/dashboard/sales/${invoice.id}`}
                          className="font-medium font-mono text-primary hover:underline"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                        {invoice.isLegacy && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/70 dark:border-amber-700/60">
                            مديونية سابقة
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{invoice.pharmacyName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        {invoice.governorateName}
                        <ArrowRight className="w-2.5 h-2.5 rotate-180" />
                        المندوب: {invoice.salesRepName ?? "غير محدد / مديونية عامة"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-full border",
                          invoice.isLegacy
                            ? "border-amber-300 text-amber-800 bg-amber-50 dark:border-amber-800/50 dark:text-amber-300 dark:bg-amber-900/20"
                            : invoice.type === InvoiceType.CASH
                            ? "border-green-200 text-green-700 bg-green-50 dark:border-green-900/50 dark:text-green-400 dark:bg-green-900/10"
                            : "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-900/50 dark:text-blue-400 dark:bg-blue-900/10"
                        )}
                      >
                        {invoice.isLegacy ? "مديونية سابقة" : TYPE_LABELS[invoice.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-foreground">
                      {formatCurrency(invoice.total)}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-amber-600">
                      {invoice.remainingAmount > 0
                        ? formatCurrency(invoice.remainingAmount)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", statusInfo.class)}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {invoice.invoiceDateLabel}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        prefetch={false}
                        href={`/dashboard/sales/${invoice.id}`}
                        className="text-xs text-primary hover:underline"
                      >
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
  );
}
