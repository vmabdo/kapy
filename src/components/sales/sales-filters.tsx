"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { Filter, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoiceStatus, InvoiceType } from "@prisma/client";

interface Props {
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

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: InvoiceStatus.CONFIRMED, label: "مؤكدة" },
  { value: InvoiceStatus.PARTIALLY_PAID, label: "سداد جزئي" },
  { value: InvoiceStatus.PAID, label: "مسددة" },
  { value: InvoiceStatus.OVERDUE, label: "متأخرة" },
  { value: InvoiceStatus.CANCELLED, label: "ملغاة" },
  { value: InvoiceStatus.DRAFT, label: "مسودة" },
];

const TYPE_OPTIONS: { value: InvoiceType; label: string }[] = [
  { value: InvoiceType.CASH, label: "نقدي" },
  { value: InvoiceType.CREDIT, label: "آجل" },
];

export function SalesFilters({ salesReps, clients, currentFilters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Local state — mirrors the URL params
  const [filters, setFilters] = useState({
    status: currentFilters.status ?? "",
    type: currentFilters.type ?? "",
    repId: currentFilters.repId ?? "",
    clientId: currentFilters.clientId ?? "",
    from: currentFilters.from ?? "",
    to: currentFilters.to ?? "",
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyles({
        top: rect.bottom + window.scrollY + 8, // 8px spacing
        left: rect.left + window.scrollX,
      });
    }
  }, [isOpen]);

  const isFiltered = Object.values(currentFilters).some(Boolean);
  const activeCount = Object.values(currentFilters).filter(Boolean).length;

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.type) params.set("type", filters.type);
    if (filters.repId) params.set("repId", filters.repId);
    if (filters.clientId) params.set("clientId", filters.clientId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setIsOpen(false);
  }, [filters, pathname, router]);

  const clearFilters = () => {
    setFilters({ status: "", type: "", repId: "", clientId: "", from: "", to: "" });
    router.push(pathname);
    setIsOpen(false);
  };

  const inputClass =
    "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="relative">
      {/* Trigger button */}
      <div className="flex gap-2">
        {isFiltered && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            إزالة المرشحات
          </button>
        )}
        <button
          ref={triggerRef}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
            isOpen || isFiltered
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted"
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          تصفية
          {activeCount > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {activeCount}
            </span>
          )}
          <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
        </button>
      </div>

      {/* Dropdown panel - Portaled to document body */}
      {isOpen && mounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setIsOpen(false)}
          />
          {/* Panel */}
          <div
            className="absolute z-50 w-80 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4"
            dir="rtl"
            style={dropdownStyles}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">خيارات التصفية</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">حالة الفاتورة</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className={inputClass}
              >
                <option value="">الكل</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">نوع الفاتورة</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
                className={inputClass}
              >
                <option value="">الكل</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Sales Rep */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">مندوب المبيعات</label>
              <select
                value={filters.repId}
                onChange={(e) => setFilters((f) => ({ ...f, repId: e.target.value }))}
                className={inputClass}
              >
                <option value="">جميع المناديب</option>
                {salesReps.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Client */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">العميل</label>
              <select
                value={filters.clientId}
                onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value }))}
                className={inputClass}
              >
                <option value="">جميع العملاء</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">نطاق التاريخ</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">من</label>
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">إلى</label>
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={clearFilters}
                className="flex-1 px-4 py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted transition-colors"
              >
                مسح الكل
              </button>
              <button
                onClick={applyFilters}
                className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                تطبيق
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
