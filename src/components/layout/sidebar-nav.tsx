"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { UserRole } from "@prisma/client";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Building2,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  Pill,
  Users,
  FileText,
} from "lucide-react";

// ─── Navigation item definition ──────────────────────────────
interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  allowedRoles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "لوحة التحكم",
    href: "/dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    label: "المخازن",
    href: "/dashboard/inventory",
    icon: <Package className="w-4 h-4" />,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.WAREHOUSE_MANAGER,
      UserRole.SALES_MANAGER,
    ],
  },
  {
    label: "المبيعات والفواتير",
    href: "/dashboard/sales",
    icon: <ShoppingCart className="w-4 h-4" />,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.SALES_REP,
    ],
  },
  {
    label: "المناديب",
    href: "/dashboard/sales-reps",
    icon: <Users className="w-4 h-4" />,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
    ],
  },
  {
    label: "الصيدليات",
    href: "/dashboard/pharmacies",
    icon: <Building2 className="w-4 h-4" />,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.ACCOUNTANT,
    ],
  },
  {
    label: "الشركات والمخازن",
    href: "/dashboard/companies",
    icon: <Building2 className="w-4 h-4" />,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.ACCOUNTANT,
    ],
  },
  {
    label: "الخزينة",
    href: "/dashboard/treasury",
    icon: <Wallet className="w-4 h-4" />,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT],
  },
  {
    label: "التقارير",
    href: "/dashboard/reports",
    icon: <BarChart3 className="w-4 h-4" />,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.ACCOUNTANT,
    ],
  },
  {
    label: "القوائم المالية",
    href: "/dashboard/financial-statements",
    icon: <FileText className="w-4 h-4" />,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.ACCOUNTANT,
    ],
  },
  {
    label: "الإعدادات",
    href: "/dashboard/settings",
    icon: <Settings className="w-4 h-4" />,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
];

// ─── Role badge map ───────────────────────────────────────────
const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "مدير النظام",
  ADMIN: "مدير",
  WAREHOUSE_MANAGER: "مدير مخزن",
  SALES_MANAGER: "مدير مبيعات",
  ACCOUNTANT: "محاسب",
  SALES_REP: "مندوب مبيعات",
  VIEWER: "مشاهد",
};

// ─── Helper: get initials from name ──────────────────────────
function getInitials(name: string | null | undefined): string {
  if (!name) return "K";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────
interface SidebarNavProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role: UserRole;
  };
}

export function SidebarNav({ user }: SidebarNavProps) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.allowedRoles || item.allowedRoles.includes(user.role)
  );

  return (
    <aside
      className="w-64 min-h-screen bg-sidebar flex flex-col border-l border-sidebar-border shrink-0"
      style={{ boxShadow: "var(--shadow-sidebar)" }}
    >
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/35 shrink-0">
          <Pill className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-bold text-[0.875rem] leading-tight tracking-wide">
            Kapy Pharma
          </p>
          <p className="text-sidebar-foreground/40 text-[10px] leading-tight mt-0.5">
            نظام إدارة الموارد
          </p>
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <nav className="flex-1 py-4 px-2.5 overflow-y-auto" aria-label="القائمة الرئيسية">
        {/* Section label */}
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30 select-none">
          القائمة
        </p>

        <div className="space-y-0.5">
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : item.href === "/dashboard/sales"
                ? pathname.startsWith("/dashboard/sales") && !pathname.startsWith("/dashboard/sales-reps")
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("nav-item", isActive && "active")}
                aria-current={isActive ? "page" : undefined}
              >
                {/* Icon wrapper */}
                <span
                  className={cn(
                    "w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0",
                    isActive
                      ? "bg-sidebar-primary/20 text-sidebar-primary"
                      : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/70"
                  )}
                >
                  {item.icon}
                </span>

                <span className="flex-1">{item.label}</span>

                {/* Active chevron */}
                {isActive && (
                  <ChevronLeft className="w-3.5 h-3.5 mr-auto text-sidebar-primary/50 shrink-0" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── User profile & logout ─────────────────────────────── */}
      <div className="p-2.5 pt-2 border-t border-sidebar-border shrink-0">
        {/* User card */}
        <div className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl mb-1.5 bg-sidebar-accent/50">
          {/* Initials avatar — feels personalized, no icon fallback */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/40 to-cyan-500/40 border border-white/10 flex items-center justify-center shrink-0">
            <span className="text-white text-[11px] font-bold leading-none select-none">
              {getInitials(user.name)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sidebar-foreground text-[0.8125rem] font-semibold truncate leading-tight">
              {user.name ?? "المستخدم"}
            </p>
            <p className="text-sidebar-foreground/40 text-[10px] truncate leading-tight mt-0.5">
              {ROLE_LABELS[user.role]}
            </p>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl",
            "text-red-400/70 hover:bg-red-500/10 hover:text-red-400",
            "transition-all duration-150 text-[0.8125rem] font-medium"
          )}
          id="sidebar-logout-btn"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
