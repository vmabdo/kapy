import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  Building2,
  HandCoins,
  ReceiptText,
  Store,
  User,
  Users,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import {
  getDebtsReportData,
  getDebtsReportGovernorates,
  isDebtEntityTypeFilter,
  type DebtEntityTypeFilter,
} from "@/queries/reports";
import { DebtsFilters } from "./debts-filters";

export const metadata: Metadata = {
  title: "مديونيات الصيدليات والشركات",
};

export const dynamic = "force-dynamic";

interface DebtsReportPageProps {
  searchParams: {
    governorateId?: string;
    entityType?: string;
    q?: string;
    onlyDebt?: string;
  };
}

const ENTITY_LABELS: Record<string, string> = {
  PHARMACY: "صيدلية",
  EXTERNAL_WAREHOUSE: "شركة / مستودع",
};

export default async function DebtsReportPage({
  searchParams,
}: DebtsReportPageProps) {
  const governorateId = searchParams.governorateId?.trim() || "";
  const entityType: DebtEntityTypeFilter = isDebtEntityTypeFilter(
    searchParams.entityType
  )
    ? searchParams.entityType
    : "ALL";
  const search = searchParams.q?.trim() || "";
  // Defaults to true: the report focuses on active debtors unless explicitly disabled.
  const onlyDebt = searchParams.onlyDebt !== "0";

  const [governorates, data] = await Promise.all([
    getDebtsReportGovernorates(),
    getDebtsReportData({ governorateId, entityType, search, onlyDebt }),
  ]);

  const selectedGovernorate = governorates.find(
    (governorate) => governorate.id === governorateId
  );
  const hasActiveFilters =
    Boolean(governorateId) || entityType !== "ALL" || Boolean(search) || !onlyDebt;

  return (
    <div dir="rtl" className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground print:hidden">
        <Link
          href="/dashboard/reports"
          className="transition-colors hover:text-foreground"
        >
          التقارير
        </Link>
        <ArrowRight className="h-3.5 w-3.5 rotate-180" />
        <span className="font-medium text-foreground">
          مديونيات الصيدليات والشركات
        </span>
      </nav>

      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <HandCoins className="h-6 w-6 text-red-500" />
            مديونيات الصيدليات والشركات
          </h1>
          <p className="page-subtitle">
            جميع المستحقات المفتوحة من الفواتير الآجلة والمديونيات السابقة
            {selectedGovernorate && (
              <span className="mr-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                محافظة: {selectedGovernorate.name}
              </span>
            )}
            {search && (
              <span className="mr-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                بحث: {search}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Link
            href="/dashboard/pharmacies"
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Building2 className="h-4 w-4" />
            إدارة الصيدليات
          </Link>
          <Link
            href="/dashboard/companies"
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Store className="h-4 w-4" />
            إدارة الشركات
          </Link>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="stat-card card-enter-1 border-red-200/70 dark:border-red-900/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                إجمالي المديونيات الكلي
              </p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                {formatCurrency(data.summary.totalDebt)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {data.totals.clientCount} عميل في نطاق الفلترة
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <HandCoins className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="stat-card card-enter-2 border-blue-200/70 dark:border-blue-900/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                مديونيات الصيدليات
              </p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {formatCurrency(data.summary.pharmaciesDebt)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                إجمالي المستحقات على الصيدليات
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="stat-card card-enter-3 border-purple-200/70 dark:border-purple-900/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-purple-600 dark:text-purple-400">
                مديونيات الشركات
              </p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400">
                {formatCurrency(data.summary.companiesDebt)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                الشركات والمستودعات الخارجية
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Store className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="stat-card card-enter-4 border-amber-200/70 dark:border-amber-900/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                عدد العملاء المدينين
              </p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {data.summary.debtorsCount}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                عميل لديه رصيد مستحق أكبر من صفر
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Suspense fallback={null}>
        <DebtsFilters governorates={governorates} />
      </Suspense>

      {/* Data table */}
      <div className="section-card">
        <div className="section-card-header">
          <h2 className="section-card-title">
            <ReceiptText className="h-4 w-4 text-primary" />
            تفاصيل مديونيات العملاء
          </h2>
          <span className="text-xs text-muted-foreground">
            {data.rows.length} عميل · {data.totals.unpaidInvoicesCount} فاتورة مفتوحة
          </span>
        </div>

        {data.rows.length === 0 ? (
          <div className="empty-state">
            <HandCoins className="empty-state-icon" />
            <p className="empty-state-title">
              {hasActiveFilters
                ? "لا توجد مديونيات مطابقة للفلاتر الحالية"
                : "لا توجد مديونيات مستحقة حالياً"}
            </p>
            <p className="empty-state-desc">
              {hasActiveFilters
                ? "جرّب تغيير المحافظة أو نوع العميل أو مسح فلتر البحث."
                : "جميع حسابات الصيدليات والشركات مسددة بالكامل."}
            </p>
          </div>
        ) : (
          <div className="data-table-wrapper print:overflow-visible">
            <table className="data-table min-w-[1080px]">
              <thead className="data-table-header">
                <tr>
                  <th className="text-right">اسم العميل</th>
                  <th className="text-center">النوع</th>
                  <th className="text-right">المحافظة</th>
                  <th className="text-right">المندوب المسؤول</th>
                  <th className="text-center">مديونية فواتير آجلة</th>
                  <th className="text-center">مديونية سابقة</th>
                  <th className="text-center">
                    إجمالي المديونية المستحقة
                  </th>
                  <th className="text-center">الفواتير المفتوحة</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const profileHref =
                    row.clientType === "PHARMACY"
                      ? `/dashboard/pharmacies/${row.id}`
                      : `/dashboard/companies/${row.id}`;

                  const usage = row.creditUsagePct;
                  const usageTone =
                    usage === null
                      ? "bg-muted"
                      : usage >= 90
                      ? "bg-red-500"
                      : usage >= 70
                      ? "bg-amber-500"
                      : "bg-emerald-500";

                  return (
                    <tr key={row.id} className="data-table-row">
                      <td className="data-table-cell">
                        <Link
                          href={profileHref}
                          className="font-medium transition-colors hover:text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                        {!row.isActive && (
                          <span className="mr-2 inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                            غير نشط
                          </span>
                        )}
                      </td>

                      <td className="data-table-cell text-center">
                        <span
                          className={cn(
                            "status-badge",
                            row.clientType === "PHARMACY"
                              ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-400"
                              : "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800/50 dark:bg-purple-950/30 dark:text-purple-400"
                          )}
                        >
                          {ENTITY_LABELS[row.clientType] ?? row.clientType}
                        </span>
                      </td>

                      <td className="data-table-cell text-sm text-muted-foreground">
                        {row.governorate}
                      </td>

                      <td className="data-table-cell">
                        {row.salesRep ? (
                          <span className="flex items-center gap-1.5 text-sm">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            {row.salesRep}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            غير معين
                          </span>
                        )}
                      </td>

                      <td className="data-table-cell text-center">
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            row.standardDebt > 0
                              ? "text-foreground"
                              : "text-muted-foreground/60"
                          )}
                        >
                          {row.standardDebt > 0
                            ? formatCurrency(row.standardDebt)
                            : "—"}
                        </span>
                      </td>

                      <td className="data-table-cell text-center">
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            row.legacyDebt > 0
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground/60"
                          )}
                        >
                          {row.legacyDebt > 0
                            ? formatCurrency(row.legacyDebt)
                            : "—"}
                        </span>
                      </td>

                      <td className="data-table-cell text-center">
                        <span
                          className={cn(
                            "font-bold tabular-nums",
                            row.totalDebt > 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground/60"
                          )}
                        >
                          {formatCurrency(row.totalDebt)}
                        </span>
                        {row.creditLimit !== null && usage !== null ? (
                          <div className="mt-1.5 flex items-center justify-center gap-1.5">
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn("h-full rounded-full", usageTone)}
                                style={{ width: `${Math.min(100, Math.max(0, usage))}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                "text-[10px] tabular-nums",
                                usage >= 90
                                  ? "font-semibold text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                              )}
                            >
                              {Math.round(usage)}% من الحد
                            </span>
                          </div>
                        ) : (
                          <p className="mt-1 text-[10px] text-muted-foreground/70">
                            حد ائتماني غير محدد
                          </p>
                        )}
                      </td>

                      <td className="data-table-cell text-center">
                        {row.unpaidInvoicesCount > 0 ? (
                          <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                            {row.unpaidInvoicesCount}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">
                            0
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40">
                  <td
                    colSpan={4}
                    className="px-5 py-4 text-left text-sm font-bold"
                  >
                    الإجمالي للعرض الحالي
                  </td>
                  <td className="px-5 py-4 text-center text-sm font-bold tabular-nums">
                    {formatCurrency(data.totals.standardDebt)}
                  </td>
                  <td className="px-5 py-4 text-center text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {formatCurrency(data.totals.legacyDebt)}
                  </td>
                  <td className="px-5 py-4 text-center text-sm font-extrabold tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(data.totals.totalDebt)}
                  </td>
                  <td className="px-5 py-4 text-center text-sm font-bold tabular-nums">
                    {data.totals.unpaidInvoicesCount}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
