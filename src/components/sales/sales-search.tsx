"use client";

import { Loader2, Search, X } from "lucide-react";
import { useDebouncedSearchParam } from "@/hooks/use-debounced-search-param";

export function SalesSearch() {
  const { searchInput, setSearchInput, isPending } = useDebouncedSearchParam({
    delay: 350,
  });

  return (
    <div className="relative w-full max-w-sm">
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        {isPending ? (
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        ) : (
          <Search className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <input
        id="sales-search-input"
        type="text"
        inputMode="search"
        placeholder="ابحث برقم الفاتورة، اسم العميل، المندوب، أو الملاحظات..."
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        aria-label="بحث في الفواتير"
        className="w-full h-10 pl-9 pr-10 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        dir="rtl"
      />
      {searchInput && (
        <button
          type="button"
          onClick={() => setSearchInput("")}
          aria-label="مسح البحث"
          className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
