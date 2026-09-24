"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { TrendingUp, Scale, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

interface FinancialTabsProps {
  activeTab: string;
  year: number;
  month: number;
  children: React.ReactNode;
}

const TABS = [
  { value: "income", label: "قائمة الدخل", icon: TrendingUp, color: "text-emerald-500" },
  { value: "balance", label: "الميزانية العمومية", icon: Scale, color: "text-blue-500" },
  { value: "cash-flow", label: "التدفقات النقدية", icon: Waves, color: "text-purple-500" },
] as const;

export function FinancialTabs({ activeTab, year, month, children }: FinancialTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigateTab = useCallback((tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <Tabs.Root value={activeTab} onValueChange={navigateTab} className="w-full">
      <Tabs.List className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border w-fit mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;
          return (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "relative flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 select-none cursor-pointer",
                isActive
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive ? tab.color : "text-muted-foreground")} />
              {tab.label}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>

      {children}
    </Tabs.Root>
  );
}

export function FinancialTabContent({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Tabs.Content value={value} className="outline-none animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      {children}
    </Tabs.Content>
  );
}
