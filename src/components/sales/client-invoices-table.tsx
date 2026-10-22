"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, FileText, Search, X } from "lucide-react";
import { InvoiceType } from "@prisma/client";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  getZonedDateKeysForLastDays,
  getZonedDayRange,
  getZonedMonthRange,
  getZonedYearMonth,
  parseDateInputToZonedStart,
} from "@/lib/datetime";
import type { ClientInvoiceRow } from "@/lib/invoice-rows";

type DatePreset = "all" | "today" | "last7" | "month" | "custom";

const PRESETS: { value: Exclude<DatePreset, "custom">; label: string }[] = [
  { value: "all", label: "كل الفواتير" },
  { value: "today", label: "اليوم" },
  { value: "last7", label: "آخر 7 أيام" },
  { value: "month", label: "هذا الشهر" },
];

const TYPE_LABELS: Record<InvoiceType, string> = {
  CASH: "نقدي",
  CREDIT: "آجل",
};

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all";

/**
 * Local date filtering uses explicit Africa/Cairo boundaries so results do not
 * change with the browser's or server's timezone.
 */
function parseInputDate(value: string, endExclusive = false): Date | null {
  if (!value) return null;
  const start = parseDateInputToZonedStart(value);
  if (!start) return null;
  return endExclusive ? getZonedDayRange(start).endExclusive : start;
}

function getDateRange(preset: DatePreset, fromDate: string, toDate: string) {
  if (preset === "all") return { from: null, to: null };

  const now = new Date();
  const today = getZonedDayRange(now);

  if (preset === "today") {
    return { from: today.start, to: today.endExclusive };
  }

  if (preset === "last7") {
    const firstKey = getZonedDateKeysForLastDays(7, now)[0];
    const from = parseDateInputToZonedStart(firstKey);
    return { from, to: today.endExclusive };
  }

  if (preset === "month") {
    const currentPeriod = getZonedYearMonth(now);
    const range = getZonedMonthRange(currentPeriod.year, currentPeriod.month);
    return { from: range.start, to: range.endExclusive };
  }

  return {
    from: parseInputDate(fromDate),
    to: parseInputDate(toDate, true),
  };
}

interface Props {
  invoices: ClientInvoiceRow[];
}

export function ClientInvoicesTable({ invoices }: Props) {
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<DatePreset>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const isFiltered =
    search.trim() !== "" || preset !== "all" || fromDate !== "" || toDate !== "";

  const invalidCustomRange =
    preset === "custom" && fromDate !== "" && toDate !== "" && fromDate > toDate;

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const { from, to } = getDateRange(preset, fromDate, toDate);
    const fromTime = from?.getTime() ?? null;
    const toTime = to?.getTime() ?? null;

    return invoices.filter((invoice) => {
      if (query && !invoice.invoiceNumber.toLowerCase().includes(query)) {
        return false;
      }

      if (fromTime !== null || toTime !== null) {
        const time = new Date(invoice.invoiceDate).getTime();
        if (Number.isNaN(time)) return false;
        if (fromTime !== null && time < fromTime) return false;
        if (toTime !== null && time >= toTime) return false;
      }

      return true;
    });
  }, [invoices, search, preset, fromDate, toDate]);

  const totals = useMemo(
    () =>
      filteredInvoices.reduce(
        (acc, invoice) => ({
          total: acc.total + invoice.total,
          remaining: acc.remaining + invoice.remainingAmount,
        }),
        { total: 0, remaining: 0 }
      ),
    [filteredInvoices]
  );

  const resetFilters = () => {
    setSearch("");
    setPreset("all");
    setFromDate("");
    setToDate("");
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          سجل الفواتير
        </h2>
        <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {filteredInvoices.length} من {invoices.length}
        </span>
      </div>

      {invoices.length > 0 && (
        <div className="px-5 py-4 border-b border-border/60 space-y-4">
          {/* Search + quick presets */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                inputMode="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث برقم الفاتورة (مثال: INV-20261021-12-8)"
                aria-label="بحث برقم الفاتورة"
                className={cn(inputClass, "pr-9 pl-9")}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="مسح البحث"
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setPreset(option.value);
                    setFromDate("");
                    setToDate("");
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                    preset === option.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom range */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-40 space-y-1">
              <label
                htmlFor="client-invoice-from-date"
                className="text-[11px] font-medium text-muted-foreground flex items-center gap-1"
              >
                <CalendarDays className="w-3 h-3" />
                من تاريخ
              </label>
              <input
                id="client-invoice-from-date"
                type="date"
                value={fromDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setFromDate(value);
                  setPreset(value === "" && toDate === "" ? "all" : "custom");
                }}
                className={inputClass}
              />
            </div>

            <div className="w-full sm:w-40 space-y-1">
              <label
                htmlFor="client-invoice-to-date"
                className="text-[11px] font-medium text-muted-foreground flex items-center gap-1"
              >
                <CalendarDays className="w-3 h-3" />
                إلى تاريخ
              </label>
              <input
                id="client-invoice-to-date"
                type="date"
                value={toDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setToDate(value);
                  setPreset(value === "" && fromDate === "" ? "all" : "custom");
                }}
                className={inputClass}
              />
            </div>

            {isFiltered && (
              <button
                type="button"
                onClick={resetFilters}
                className="h-10 flex items-center gap-1.5 px-3 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                مسح الفلاتر
              </button>
            )}
          </div>

          {invalidCustomRange && (
            <p className="text-xs text-red-600 dark:text-red-400">
              تاريخ البداية يجب أن يكون قبل تاريخ النهاية.
            </p>
          )}

          {/* Filtered totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                عدد الفواتير المطابقة
              </p>
              <p className="text-lg font-bold text-foreground">
                {filteredInvoices.length}
              </p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                إجمالي الفواتير
              </p>
              <p className="text-lg font-bold text-primary">
                {formatCurrency(totals.total)}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                إجمالي المتبقي
              </p>
              <p className="text-lg font-bold text-amber-600">
                {formatCurrency(totals.remaining)}
              </p>
            </div>
          </div>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="p-10 flex flex-col items-center justify-center text-center bg-muted/10 m-4 border border-dashed border-border/60 rounded-xl">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
            <FileText className="w-6 h-6 text-muted-foreground opacity-50" />
          </div>
          <h3 className="text-sm font-bold text-foreground mb-1">
            لا توجد فواتير مسجلة
          </h3>
          <p className="text-xs text-muted-foreground">
            لم يتم إصدار أي فواتير لهذا العميل حتى الآن.
          </p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="p-10 flex flex-col items-center justify-center text-center">
          <Search className="w-8 h-8 text-muted-foreground opacity-30 mb-2" />
          <h3 className="text-sm font-bold text-foreground mb-1">
            لا توجد فواتير مطابقة
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            جرّب تعديل رقم الفاتورة أو نطاق التاريخ.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            مسح الفلاتر
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60">
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                  الرقم
                </th>
                <th className="text-center px-4 py-2 font-medium text-muted-foreground">
                  النوع
                </th>
                <th className="text-center px-4 py-2 font-medium text-muted-foreground">
                  الإجمالي
                </th>
                <th className="text-center px-4 py-2 font-medium text-muted-foreground">
                  المتبقي
                </th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                  التاريخ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      prefetch={false}
                      href={`/dashboard/sales/${invoice.id}`}
                      className="font-medium font-mono text-primary hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded border",
                        invoice.isLegacy
                          ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-900/50"
                          : invoice.type === InvoiceType.CASH
                          ? "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/10 dark:border-green-900/50"
                          : "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/10 dark:border-blue-900/50"
                      )}
                    >
                      {invoice.isLegacy
                        ? "مديونية سابقة"
                        : TYPE_LABELS[invoice.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-foreground">
                    {formatCurrency(invoice.total)}
                  </td>
                  <td className="px-4 py-3 text-center text-amber-600 font-medium">
                    {invoice.remainingAmount > 0
                      ? formatCurrency(invoice.remainingAmount)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(invoice.invoiceDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-3 border-t border-border/60 bg-muted/20 text-center">
        <Link
          href="/dashboard/sales"
          className="text-xs text-primary hover:underline font-medium"
        >
          عرض في سجل المبيعات
        </Link>
      </div>
    </div>
  );
}
