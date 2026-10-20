"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, MapPin, RotateCcw, Search, Tags, X } from "lucide-react";
import { cn } from "@/lib/utils";

type EntityFilter = "ALL" | "PHARMACY" | "EXTERNAL_WAREHOUSE";

const ENTITY_OPTIONS: { value: EntityFilter; label: string }[] = [
  { value: "ALL", label: "الكل" },
  { value: "PHARMACY", label: "الصيدليات فقط" },
  { value: "EXTERNAL_WAREHOUSE", label: "الشركات فقط" },
];

interface DebtsFiltersProps {
  governorates: { id: string; name: string }[];
}

export function DebtsFilters({ governorates }: DebtsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const governorateId = searchParams.get("governorateId") ?? "";
  const rawEntityType = searchParams.get("entityType");
  const entityType: EntityFilter = ENTITY_OPTIONS.some(
    (option) => option.value === rawEntityType
  )
    ? (rawEntityType as EntityFilter)
    : "ALL";
  const onlyDebt = searchParams.get("onlyDebt") !== "0";
  const urlQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(urlQuery);

  // Keep the input in sync when the URL changes externally (reset / back / forward).
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const queryString = params.toString();

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams]
  );

  // Debounce name search so we don't hit the server on every keystroke.
  useEffect(() => {
    const nextQuery = query.trim();
    if (nextQuery === urlQuery) return;

    const timer = setTimeout(() => {
      updateParams((params) => {
        if (nextQuery) params.set("q", nextQuery);
        else params.delete("q");
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [query, urlQuery, updateParams]);

  const handleGovernorateChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value;
    updateParams((params) => {
      if (value) params.set("governorateId", value);
      else params.delete("governorateId");
    });
  };

  const handleEntityTypeChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value;
    updateParams((params) => {
      if (value && value !== "ALL") params.set("entityType", value);
      else params.delete("entityType");
    });
  };

  const toggleOnlyDebt = () => {
    updateParams((params) => {
      if (onlyDebt) params.set("onlyDebt", "0");
      else params.delete("onlyDebt");
    });
  };

  const resetFilters = () => {
    setQuery("");
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  const hasActiveFilters =
    Boolean(governorateId) || entityType !== "ALL" || Boolean(urlQuery) || !onlyDebt;

  return (
    <div className="section-card p-4 print:hidden">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Governorate */}
          <div className="space-y-1.5">
            <label
              htmlFor="debts-governorate"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
            >
              <MapPin className="h-3 w-3" />
              المحافظة
            </label>
            <select
              id="debts-governorate"
              value={governorateId}
              onChange={handleGovernorateChange}
              className="form-input h-[38px] py-0"
            >
              <option value="">كل المحافظات</option>
              {governorates.map((governorate) => (
                <option key={governorate.id} value={governorate.id}>
                  {governorate.name}
                </option>
              ))}
            </select>
          </div>

          {/* Entity type */}
          <div className="space-y-1.5">
            <label
              htmlFor="debts-entity-type"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
            >
              <Tags className="h-3 w-3" />
              نوع العميل
            </label>
            <select
              id="debts-entity-type"
              value={entityType}
              onChange={handleEntityTypeChange}
              className="form-input h-[38px] py-0"
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="space-y-1.5 sm:col-span-2">
            <label
              htmlFor="debts-search"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
            >
              <Search className="h-3 w-3" />
              بحث بالاسم
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="debts-search"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث باسم الصيدلية أو الشركة..."
                className="form-input pr-9 pl-9"
                dir="rtl"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="مسح البحث"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:pb-0.5">
          <button
            type="button"
            role="switch"
            aria-checked={onlyDebt}
            onClick={toggleOnlyDebt}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
              onlyDebt
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-400"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            <span
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                onlyDebt ? "bg-amber-500" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                  onlyDebt ? "right-0.5" : "right-[18px]"
                )}
              />
            </span>
            إظهار المديونيات فقط
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              إعادة ضبط
            </button>
          )}

          {isPending && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              جارٍ التحديث
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
