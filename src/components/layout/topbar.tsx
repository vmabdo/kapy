"use client";

import { Bell, Search, Sun, Moon, CheckCheck, AlertTriangle, TrendingUp, Package, Clock } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

type AlertItem = {
  id: string;
  type: "PHARMACY_TARGET_REACHED" | "REP_TARGET_REACHED" | "INVOICE_OVERDUE" | "LOW_STOCK";
  title: string;
  message: string;
  triggeredAt: string;
  status: string;
};

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

const ALERT_ICONS: Record<AlertItem["type"], React.ReactNode> = {
  PHARMACY_TARGET_REACHED: <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />,
  REP_TARGET_REACHED: <TrendingUp className="w-3.5 h-3.5 text-blue-500" />,
  INVOICE_OVERDUE: <Clock className="w-3.5 h-3.5 text-red-500" />,
  LOW_STOCK: <Package className="w-3.5 h-3.5 text-amber-500" />,
};

function getInitials(name: string | null | undefined): string {
  if (!name) return "K";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TopBar({ user }: TopBarProps) {
  const [isDark, setIsDark] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

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

  // ── Fetch alerts ───────────────────────────────────────────
  const fetchAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
        setAlertCount(data.count ?? 0);
      }
    } catch {
      // fail silently
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  // Fetch on mount + every 60s
  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // ── Mark all as read ───────────────────────────────────────
  const markAllRead = async () => {
    setMarkingRead(true);
    try {
      await fetch("/api/alerts", { method: "PATCH" });
      setAlerts([]);
      setAlertCount(0);
      setShowNotifs(false);
    } catch {
      // fail silently
    } finally {
      setMarkingRead(false);
    }
  };

  // Close popover on outside click
  useEffect(() => {
    if (!showNotifs) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#notifications-popover") && !target.closest("#topbar-notifications-btn")) {
        setShowNotifs(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifs]);

  return (
    <header className="h-16 bg-card/90 backdrop-blur-md border-b border-border/60 flex items-center gap-4 px-5 lg:px-7 shrink-0 sticky top-0 z-30">

      {/* ── Search ─────────────────────────────────────────── */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="بحث سريع في النظام..."
          id="topbar-search"
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

        {/* Notifications button */}
        <button
          id="topbar-notifications-btn"
          onClick={() => {
            setShowNotifs((v) => !v);
            if (!showNotifs) fetchAlerts();
          }}
          className={cn(
            "relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150",
            showNotifs
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-label="التنبيهات"
        >
          <Bell className="w-4 h-4" />
          {alertCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 ring-2 ring-card">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </button>

        {/* ── Notifications Popover ─────────────────────────── */}
        {showNotifs && (
          <div
            id="notifications-popover"
            className={cn(
              "absolute top-12 left-0 w-80 bg-card border border-border rounded-2xl shadow-lg z-50 overflow-hidden",
              "animate-scale-in"
            )}
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                التنبيهات
                {alertCount > 0 && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">
                    {alertCount}
                  </span>
                )}
              </h3>
              {alerts.length > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={markingRead}
                  className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {markingRead ? "جارٍ..." : "تعليم الكل كمقروء"}
                </button>
              )}
            </div>

            {/* Alert list */}
            <div className="max-h-80 overflow-y-auto">
              {loadingAlerts ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-14 rounded-xl" />
                  ))}
                </div>
              ) : alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Bell className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm font-medium">لا توجد تنبيهات جديدة</p>
                  <p className="text-xs mt-0.5 text-muted-foreground/70">كل شيء يسير على ما يرام</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 p-1.5 rounded-lg bg-muted shrink-0">
                          {ALERT_ICONS[alert.type]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground leading-tight truncate">
                            {alert.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                            {alert.message}
                          </p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                            {formatDate(new Date(alert.triggeredAt))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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
