"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Phone, Search, ShieldAlert, UserCheck, Users } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { normalizeSearchText } from "@/lib/search";
import { formatCurrency } from "@/lib/utils";

export interface SalesRepListItem {
  id: string;
  name: string;
  phone: string | null;
  employeeCode: string;
  hasSystemAccount: boolean;
  monthlyTarget: number;
  assignedPharmaciesCount: number;
  invoicesCount: number;
  achievement: number;
  netSalary: number;
}

interface Props {
  reps: SalesRepListItem[];
  /** Base path for a rep's details page. Defaults to the sidebar's active route. */
  detailHrefBase?: string;
}

export function SalesRepsList({
  reps,
  detailHrefBase = "/dashboard/sales-reps",
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedQuery = normalizeSearchText(searchTerm);
  const compactQuery = normalizedQuery.replace(/[\s\-()]/g, "");

  // Normalize each record once per dataset, not on every keystroke.
  const searchableReps = useMemo(
    () =>
      reps.map((rep) => ({
        rep,
        name: normalizeSearchText(rep.name),
        phone: (rep.phone ?? "").replace(/[\s\-()]/g, ""),
      })),
    [reps]
  );

  const filteredReps = useMemo(() => {
    if (!normalizedQuery) return reps;

    return searchableReps
      .filter(
        ({ name, phone }) =>
          name.includes(normalizedQuery) ||
          (compactQuery !== "" && phone.includes(compactQuery))
      )
      .map(({ rep }) => rep);
  }, [reps, searchableReps, normalizedQuery, compactQuery]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm flex items-center gap-1.5">
            <Users className="w-4 h-4 text-primary" />
            قائمة المناديب
          </h2>
          <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {filteredReps.length} من {reps.length}
          </span>
        </div>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="بحث عن مندوب بالاسم أو الهاتف..."
          ariaLabel="بحث في مندوبي المبيعات"
          className="sm:max-w-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reps.length === 0 ? (
          <div className="col-span-full empty-state">
            <Users className="empty-state-icon" />
            <p className="empty-state-title">لا يوجد مندوبين مسجلين بعد</p>
            <p className="empty-state-desc">أضف أول مندوب مبيعات لبدء إدارة فريقك</p>
          </div>
        ) : filteredReps.length === 0 ? (
          <div className="col-span-full empty-state">
            <Search className="empty-state-icon" />
            <p className="empty-state-title">لا توجد نتائج مطابقة للبحث</p>
            <p className="empty-state-desc mb-3">جرّب البحث باسم آخر أو رقم هاتف مختلف.</p>
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
            >
              مسح البحث
            </button>
          </div>
        ) : (
          filteredReps.map((rep) => {
            const achievement = rep.achievement;
            const achievementColor =
              achievement >= 100
                ? "bg-emerald-500"
                : achievement >= 70
                ? "bg-blue-500"
                : achievement >= 40
                ? "bg-amber-500"
                : "bg-red-500";

            return (
              <Link
                prefetch={false}
                key={rep.id}
                href={`${detailHrefBase}/${rep.id}`}
                className="block section-card hover:border-primary/30 transition-all group"
              >
                <div className="p-5">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                        {rep.name[0]}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground leading-tight">{rep.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{rep.employeeCode}</p>
                      </div>
                    </div>
                    {rep.hasSystemAccount ? (
                      <span
                        className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 p-1.5 rounded-md shrink-0"
                        title="يمتلك حساب نظام"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 p-1.5 rounded-md shrink-0">
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  {/* Phone */}
                  {rep.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-3">
                      <Phone className="w-3 h-3" />
                      {rep.phone}
                    </p>
                  )}

                  {/* Target progress */}
                  {rep.monthlyTarget > 0 && (
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[11px] text-muted-foreground">إنجاز الهدف الشهري</span>
                        <span className="text-[11px] font-bold tabular-nums">{Math.round(achievement)}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${achievementColor}`}
                          style={{ width: `${achievement}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">الصيدليات</p>
                      <p className="font-bold text-sm">{rep.assignedPharmaciesCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">الفواتير</p>
                      <p className="font-bold text-sm">{rep.invoicesCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">صافي الراتب</p>
                      <p className="font-bold text-sm text-primary tabular-nums">
                        {formatCurrency(rep.netSalary)}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
