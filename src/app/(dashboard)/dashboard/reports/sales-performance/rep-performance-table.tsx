"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency, cn } from "@/lib/utils";
import { Users, Award, Search, X, Target } from "lucide-react";

interface RepStat {
  rep: {
    id: string;
    name: string;
    employeeCode: string;
    _count: { assignedPharmacies: number };
  };
  monthSales: number;
  totalSales: number;
  monthInvoiceCount: number;
  totalInvoiceCount: number;
  target: number;
  achievement: number;
  netSalary: number;
}

interface Props {
  sortedStats: RepStat[];
  monthLabel: string;
}

export function RepPerformanceTable({ sortedStats, monthLabel }: Props) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? sortedStats.filter((s) =>
        s.rep.name.toLowerCase().includes(query.toLowerCase()) ||
        s.rep.employeeCode.toLowerCase().includes(query.toLowerCase())
      )
    : sortedStats;

  return (
    <div className="section-card">
      <div className="section-card-header">
        <h2 className="section-card-title">
          <Award className="w-4 h-4 text-primary" />
          مقارنة أداء المناديب
        </h2>
        <span className="text-xs text-muted-foreground">{monthLabel}</span>
      </div>

      <div className="data-table-wrapper mb-8">
        <table className="data-table">
          <thead className="data-table-header">
            <tr>
              <th className="text-right w-8">#</th>
              <th className="text-right">المندوب</th>
              <th className="text-center">مبيعات الشهر</th>
              <th className="text-center">الهدف</th>
              <th className="text-center min-w-[160px]">نسبة الإنجاز</th>
              <th className="text-center">الفواتير</th>
              <th className="text-center">الصيدليات</th>
              <th className="text-center">صافي الراتب</th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((s, idx) => {
              const achievementColor =
                s.achievement >= 100 ? "bg-emerald-500" :
                s.achievement >= 70 ? "bg-blue-500" :
                s.achievement >= 40 ? "bg-amber-500" : "bg-red-500";

              return (
                <tr key={s.rep.id} className="data-table-row">
                  <td className="data-table-cell text-muted-foreground text-sm font-bold">
                    {idx + 1}
                  </td>
                  <td className="data-table-cell">
                    <Link
                      href={`/dashboard/sales/reps/${s.rep.id}`}
                      className="flex items-center gap-2.5 group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                        {s.rep.name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-sm group-hover:text-primary transition-colors">
                          {s.rep.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {s.rep.employeeCode}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="data-table-cell text-center font-semibold tabular-nums">
                    {formatCurrency(String(s.monthSales))}
                  </td>
                  <td className="data-table-cell text-center text-sm text-muted-foreground tabular-nums">
                    {s.target > 0 ? formatCurrency(String(s.target)) : "—"}
                  </td>
                  <td className="data-table-cell">
                    {s.target > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${achievementColor}`}
                            style={{ width: `${s.achievement}%` }}
                          />
                        </div>
                        <span className={cn(
                          "text-xs font-bold tabular-nums min-w-[38px] text-left",
                          s.achievement >= 100 ? "text-emerald-600" :
                          s.achievement >= 70 ? "text-blue-600" :
                          s.achievement >= 40 ? "text-amber-600" : "text-red-600"
                        )}>
                          {Math.round(s.achievement)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">لا هدف</span>
                    )}
                  </td>
                  <td className="data-table-cell text-center tabular-nums">
                    <div className="flex flex-col items-center">
                      <span className="font-semibold">{s.monthInvoiceCount}</span>
                      <span className="text-[10px] text-muted-foreground">هذا الشهر</span>
                    </div>
                  </td>
                  <td className="data-table-cell text-center tabular-nums">
                    {s.rep._count.assignedPharmacies}
                  </td>
                  <td className="data-table-cell text-center font-semibold text-primary tabular-nums">
                    {formatCurrency(String(s.netSalary))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Search Bar - Exactly above detail cards */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Target className="w-4 h-4" />
          تفاصيل أداء كل مندوب
        </h2>
        
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            id="rep-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم المندوب أو كوده..."
            className="w-full pr-9 pl-9 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all"
            dir="rtl"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state bg-card border border-border rounded-xl mt-4">
          <Users className="empty-state-icon" />
          <p className="empty-state-title">
            {query ? `لا نتائج لـ "${query}"` : "لا يوجد مناديب مسجلون"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const achievementColor =
              s.achievement >= 100 ? "bg-emerald-500" :
              s.achievement >= 70 ? "bg-blue-500" :
              s.achievement >= 40 ? "bg-amber-500" : "bg-red-500";

            return (
              <Link
                key={s.rep.id}
                href={`/dashboard/sales/reps/${s.rep.id}`}
                className="section-card p-5 hover:border-primary/30 transition-all group block"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold group-hover:bg-primary group-hover:text-white transition-colors">
                    {s.rep.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{s.rep.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{s.rep.employeeCode}</p>
                  </div>
                  {s.achievement >= 100 && (
                    <span className="mr-auto text-emerald-500" title="حقق الهدف!">
                      <Award className="w-4 h-4" />
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">مبيعات الشهر</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(String(s.monthSales))}</span>
                  </div>
                  {s.target > 0 && (
                    <>
                      <div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                          <span>الإنجاز</span>
                          <span className="font-bold">{Math.round(s.achievement)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${achievementColor}`}
                            style={{ width: `${s.achievement}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="flex gap-3 pt-2 border-t border-border/50">
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-muted-foreground">فواتير</p>
                      <p className="font-bold text-sm">{s.monthInvoiceCount}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-muted-foreground">صيدليات</p>
                      <p className="font-bold text-sm">{s.rep._count.assignedPharmacies}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-muted-foreground">الراتب</p>
                      <p className="font-bold text-sm text-primary tabular-nums">
                        {formatCurrency(String(s.netSalary))}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
