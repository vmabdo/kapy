"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";

export function DailyDatePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDate = searchParams.get("date") ?? "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      router.push(`/dashboard/reports/daily?date=${val}`);
    } else {
      router.push(`/dashboard/reports/daily`);
    }
  };

  return (
    <div className="flex items-center gap-3 print:hidden">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card">
        <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          id="daily-report-date"
          type="date"
          value={currentDate}
          onChange={handleChange}
          className="bg-transparent text-sm focus:outline-none text-foreground"
        />
      </div>
      {currentDate && (
        <button
          onClick={() => router.push("/dashboard/reports/daily")}
          className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
        >
          العودة لليوم الحالي
        </button>
      )}
    </div>
  );
}
