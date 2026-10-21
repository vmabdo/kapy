"use client";

import { useState, useMemo } from "react";
import { formatCurrency, formatShortDate } from "@/lib/utils";
import { FileText, CreditCard, Undo2, Search, TrendingDown, TrendingUp, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { roundCurrency, type LedgerEntry } from "@/lib/client-ledger";

export type { LedgerEntry } from "@/lib/client-ledger";

type FilterType = "ALL" | "INVOICE" | "PAYMENT" | "RETURN";

const LEDGER_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatLedgerTimestamp(value: Date) {
  const date = new Date(value);
  return `${formatShortDate(date)} · ${LEDGER_TIME_FORMATTER.format(date)}`;
}

function parseLocalDate(value: string, endOfDay = false): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
}

interface Props {
  entries: LedgerEntry[];
  clientName: string;
  openingBalance: number;
}

const TYPE_META = {
  INVOICE: { label: "فاتورة مبيعات", icon: FileText, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40" },
  PAYMENT: { label: "دفعة نقدية", icon: CreditCard, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40" },
  RETURN: { label: "مرتجع", icon: Undo2, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40" },
};

export function LedgerTable({ entries, clientName, openingBalance }: Props) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("ALL");

  // Filter by the full ledger timestamp (createdAt), not by the document date.
  // This keeps ordering, filtering and the running balance perfectly aligned.
  const dateFiltered = useMemo(() => {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate, true);

    return entries.filter((e) => {
      const d = new Date(e.occurredAt);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [entries, startDate, endDate]);

  // Balance carried into the selected period. Without a start date this is the
  // all-time opening balance; with one, add every entry that happened earlier.
  const openingForPeriod = useMemo(() => {
    const start = parseLocalDate(startDate);
    if (!start) return roundCurrency(openingBalance);

    const movementBeforePeriod = entries.reduce((sum, e) => {
      return new Date(e.occurredAt) < start
        ? sum + e.debit - e.credit
        : sum;
    }, 0);

    return roundCurrency(openingBalance + movementBeforePeriod);
  }, [entries, openingBalance, startDate]);

  // Filter by type
  const filtered = useMemo(() => {
    if (filterType === "ALL") return dateFiltered;
    return dateFiltered.filter((e) => e.type === filterType);
  }, [dateFiltered, filterType]);

  // Compute running balance using ALL date-filtered entries (regardless of type filter)
  const withBalance = useMemo(() => {
    let balance = openingForPeriod;
    const balanceMap = new Map<string, number>();
    for (const e of dateFiltered) {
      balance = roundCurrency(balance + e.debit - e.credit);
      balanceMap.set(e.id, balance);
    }
    return balanceMap;
  }, [dateFiltered, openingForPeriod]);

  // Summary stats from date-filtered entries
  const totalDebit = roundCurrency(dateFiltered.reduce((s, e) => s + e.debit, 0));
  const totalCredit = roundCurrency(dateFiltered.reduce((s, e) => s + e.credit, 0));
  const closingBalance = roundCurrency(openingForPeriod + totalDebit - totalCredit);

  const inputClass =
    "px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all";

  return (
    <div className="space-y-6" dir="rtl">
      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">فلاتر البحث</p>
        <div className="flex flex-wrap gap-4 items-end">
          {/* Date Range */}
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">من تاريخ</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <span className="text-muted-foreground pb-2 text-sm">إلى</span>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">إلى تاريخ</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Type Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">نوع المعاملة</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FilterType)}
              className={inputClass}
            >
              <option value="ALL">الكل</option>
              <option value="INVOICE">فواتير مديونية</option>
              <option value="PAYMENT">مدفوعات / تحصيلات</option>
              <option value="RETURN">مرتجعات</option>
            </select>
          </div>

          {/* Clear */}
          {(startDate || endDate || filterType !== "ALL") && (
            <button
              onClick={() => { setStartDate(""); setEndDate(""); setFilterType("ALL"); }}
              className="text-xs text-muted-foreground hover:text-foreground underline pb-2 transition-colors"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-200 dark:border-blue-800/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-blue-600" />
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">إجمالي المدين (فواتير قبل المرتجعات)</p>
          </div>
          <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(totalDebit)}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-200 dark:border-green-800/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <p className="text-xs font-semibold text-green-700 dark:text-green-400">إجمالي الدائن (مدفوعات ومرتجعات)</p>
          </div>
          <p className="text-xl font-bold text-green-700 dark:text-green-300">{formatCurrency(totalCredit)}</p>
        </div>
        <div className={cn(
          "rounded-xl p-4 border",
          closingBalance > 0
            ? "bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-200 dark:border-amber-800/40"
            : "bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-200 dark:border-emerald-800/40"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Scale className={cn("w-4 h-4", closingBalance > 0 ? "text-amber-600" : "text-emerald-600")} />
            <p className={cn("text-xs font-semibold", closingBalance > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>الرصيد الختامي</p>
          </div>
          <p className={cn("text-xl font-bold", closingBalance > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300")}>
            {formatCurrency(Math.abs(closingBalance))}
            {closingBalance > 0 && <span className="text-xs font-normal mr-1">(مدين)</span>}
            {closingBalance < 0 && <span className="text-xs font-normal mr-1">(دائن)</span>}
            {closingBalance === 0 && <span className="text-xs font-normal mr-1">(مسوّى)</span>}
          </p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            كشف الحساب التفصيلي
            {filterType !== "ALL" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {filterType === "INVOICE" ? "فواتير فقط" : filterType === "PAYMENT" ? "مدفوعات فقط" : "مرتجعات فقط"}
              </span>
            )}
          </h2>
          <span className="text-xs text-muted-foreground">{filtered.length} معاملة</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد معاملات تطابق الفلاتر المحددة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">#</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">التاريخ</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">نوع المعاملة</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">البيان / المرجع</th>
                  <th className="text-center px-4 py-3 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">مدين ↑</th>
                  <th className="text-center px-4 py-3 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">دائن ↓</th>
                  <th className="text-center px-4 py-3 font-semibold text-foreground whitespace-nowrap">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {/* Opening balance row */}
                <tr className="bg-muted/20">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground" colSpan={2}>
                    رصيد افتتاحي {startDate ? `(قبل ${formatShortDate(parseLocalDate(startDate) ?? new Date(startDate))})` : "(قبل أول معاملة)"}
                  </td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-center" />
                  <td className="px-4 py-2.5 text-center" />
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn("font-semibold text-sm", openingForPeriod > 0 ? "text-amber-600" : openingForPeriod < 0 ? "text-green-600" : "text-muted-foreground")}>
                      {formatCurrency(Math.abs(openingForPeriod))}
                      {openingForPeriod > 0 && <span className="text-[10px] mr-1">م</span>}
                      {openingForPeriod < 0 && <span className="text-[10px] mr-1">دا</span>}
                    </span>
                  </td>
                </tr>

                {filtered.map((entry, idx) => {
                  const meta = TYPE_META[entry.type];
                  const Icon = meta.icon;
                  const runningBalance = withBalance.get(entry.id) ?? 0;

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-muted/20 transition-colors group"
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs text-foreground" suppressHydrationWarning>
                          {formatLedgerTimestamp(entry.occurredAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border", meta.bg, meta.color)}>
                          <Icon className="w-3 h-3" />
                          {entry.isCashRefund ? "مرتجع نقدي" : meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground text-xs">{entry.reference}</p>
                        {entry.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[240px] truncate">{entry.description}</p>
                        )}
                        {entry.memoAmount ? (
                          <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 mt-0.5">
                            قيمة رد نقدي: {formatCurrency(entry.memoAmount)} — لا يؤثر على الرصيد
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {entry.debit > 0 ? (
                          <span className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(entry.debit)}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {entry.credit > 0 ? (
                          <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(entry.credit)}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "font-bold text-sm",
                          runningBalance > 0 ? "text-amber-600 dark:text-amber-400" :
                          runningBalance < 0 ? "text-green-600 dark:text-green-400" :
                          "text-muted-foreground"
                        )}>
                          {formatCurrency(Math.abs(runningBalance))}
                          {runningBalance > 0 && <span className="text-[10px] font-normal mr-1 text-amber-500">م</span>}
                          {runningBalance < 0 && <span className="text-[10px] font-normal mr-1 text-green-500">دا</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* Closing balance */}
                <tr className="bg-gradient-to-r from-primary/5 to-transparent border-t-2 border-primary/20">
                  <td colSpan={4} className="px-4 py-3 font-bold text-sm text-foreground">الرصيد الختامي</td>
                  <td className="px-4 py-3 text-center font-bold text-blue-600 dark:text-blue-400">{formatCurrency(totalDebit)}</td>
                  <td className="px-4 py-3 text-center font-bold text-green-600 dark:text-green-400">{formatCurrency(totalCredit)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "font-bold text-base",
                      closingBalance > 0 ? "text-amber-600 dark:text-amber-400" :
                      closingBalance < 0 ? "text-green-600 dark:text-green-400" :
                      "text-emerald-600"
                    )}>
                      {formatCurrency(Math.abs(closingBalance))}
                      <span className="text-xs font-normal mr-1">
                        {closingBalance > 0 ? "(مدين)" : closingBalance < 0 ? "(دائن)" : "(مسوّى ✓)"}
                      </span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          <span><strong>مدين (م)</strong> = يزيد المديونية (فاتورة جديدة)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span><strong>دائن (دا)</strong> = يقلل المديونية (دفعة أو مرتجع يخصم من الحساب)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          <span><strong>مرتجع نقدي</strong> = معلومة فقط، لأن قيمته رُدت نقداً ولم تؤثر على المديونية</span>
        </div>
      </div>
    </div>
  );
}
