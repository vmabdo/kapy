"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useState, useEffect } from "react";

export function SalesSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [query, setQuery] = useState(searchParams.get("query") || "");

  // Debounce the search input
  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set("query", query);
      } else {
        params.delete("query");
      }
      // Only push if different to avoid infinite loops
      if (params.get("query") !== searchParams.get("query")) {
        router.push(`${pathname}?${params.toString()}`);
      }
    }, 300); // 300ms delay

    return () => clearTimeout(timeout);
  }, [query, pathname, router, searchParams]);

  return (
    <div className="relative w-full max-w-sm">
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        <Search className="w-4 h-4 text-muted-foreground" />
      </div>
      <input
        type="text"
        placeholder="ابحث برقم الفاتورة، اسم العميل، أو المندوب..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full h-10 pl-3 pr-10 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        dir="rtl"
      />
    </div>
  );
}
