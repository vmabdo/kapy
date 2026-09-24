"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

interface PeriodPickerProps {
  year: number;
  month: number;
}

export function PeriodPicker({ year, month }: PeriodPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = useCallback((newYear: number, newMonth: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(newYear));
    params.set("month", String(newMonth));
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const prevMonth = () => {
    if (month === 1) navigate(year - 1, 12);
    else navigate(year, month - 1);
  };

  const nextMonth = () => {
    if (month === 12) navigate(year + 1, 1);
    else navigate(year, month + 1);
  };

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const isCurrentPeriod = year === currentYear && month === currentMonth;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 bg-muted/40 border border-border rounded-xl p-1">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="الشهر السابق"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 min-w-[160px] justify-center">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">
            {MONTHS_AR[month - 1]} {year}
          </span>
        </div>

        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="الشهر التالي"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {!isCurrentPeriod && (
        <button
          onClick={() => navigate(currentYear, currentMonth)}
          className="px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors border border-primary/20"
        >
          الشهر الحالي
        </button>
      )}
    </div>
  );
}
