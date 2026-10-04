"use client";

import { Search, Sun, Moon } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────


interface TopBarProps {
  user: {
    name?: string | null;
    role: UserRole;
  };
}

// ─── Role display labels ─────────────────────────────────────
const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "مدير النظام",
  ADMIN: "مدير",
  WAREHOUSE_MANAGER: "مدير مخزن",
  SALES_MANAGER: "مدير مبيعات",
  ACCOUNTANT: "محاسب",
  SALES_REP: "مندوب مبيعات",
  VIEWER: "مشاهد",
};



function getInitials(name: string | null | undefined): string {
  if (!name) return "K";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TopBar({ user }: TopBarProps) {
  const [isDark, setIsDark] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("query") || "");

  // ── Debounced URL Search ───────────────────────────────────
  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set("query", query);
      } else {
        params.delete("query");
      }
      if (params.get("query") !== searchParams.get("query")) {
        router.push(`${pathname}?${params.toString()}`);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, pathname, router, searchParams]);

  // ── Theme toggle with localStorage persistence ─────────────
  useEffect(() => {
    const saved = localStorage.getItem("kapy-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark = saved ? saved === "dark" : prefersDark;
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("kapy-theme", next ? "dark" : "light");
  };


  return (
    <header className="h-16 bg-card/90 backdrop-blur-md border-b border-border/60 flex items-center gap-4 px-5 lg:px-7 shrink-0 sticky top-0 z-30 print:hidden">

      {/* ── Search ─────────────────────────────────────────── */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="بحث سريع في النظام..."
          id="topbar-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(
            "w-full pr-10 pl-4 py-2 text-sm rounded-xl",
            "bg-muted/60 border border-border/60",
            "focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 focus:bg-card",
            "placeholder:text-muted-foreground/60 transition-all duration-200"
          )}
        />
      </div>

      {/* ── Actions ────────────────────────────────────────── */}
      <div className="mr-auto flex items-center gap-1.5 relative">

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          id="topbar-theme-toggle"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150"
          aria-label={isDark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>


        {/* Divider */}
        <div className="w-px h-6 bg-border/80 mx-1.5" />

        {/* User info */}
        <div className="flex items-center gap-2.5 pl-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/80 to-accent/80 flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">
            {getInitials(user.name)}
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-sm font-semibold text-foreground leading-tight">
              {user.name ?? "المستخدم"}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
