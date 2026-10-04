import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  ArrowRight,
  CalendarRange,
  TrendingUp,
  BarChart3,
  Target,
  Undo2,
  Package,
  Users,
  MapPin,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PrintButton } from "../../sales/[id]/print-button";

export const metadata: Metadata = { title: "التقرير الشهري" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    year?: string;
    month?: string;
    governorateId?: string;
  }>;
}

export default async function MonthlyReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();

  const year = params.year ? parseInt(params.year) : now.getFullYear();
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1;
  const selectedGovernorateId = params.governorateId || "";

  // Compute date bounds for selected month
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  // Previous Month bounds
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const startOfPrevMonth = new Date(prevYear, prevMonth - 1, 1);
  const endOfPrevMonth = new Date(prevYear, prevMonth, 0, 23, 59, 59);

  // ── Fetch all governorates for filter ──
  const governorates = await prisma.governorate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // ── Build governorate pharmacy filter ──
  const pharmacyFilter = selectedGovernorateId
    ? { governorateId: selectedGovernorateId }
    : {};

  // Build month label
  const monthLabel = startOfMonth.toLocaleString("ar-EG", {
    month: "long",
    year: "numeric",
  });

  const selectedGovName =
    governorates.find((g) => g.id === selectedGovernorateId)?.name ?? "الكل";

  return (
    <div className="max-w-5xl mx-auto print:max-w-full">
      <div className="print:hidden">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
          <Link
            href="/dashboard/reports"
            className="hover:text-foreground transition-colors"
          >
            التقارير
          </Link>
          <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          <span className="text-foreground font-medium">التقرير الشهري</span>
        </nav>

        <div className="page-header mb-6">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <CalendarRange className="w-6 h-6 text-primary" />
              تقرير الأداء الشهري
            </h1>
            <p className="page-subtitle">
              عن شهر {monthLabel}
              {selectedGovernorateId && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
                  محافظة: {selectedGovName}
                </span>
              )}
            </p>
          </div>
          <PrintButton />
        </div>

        {/* ── Global Filters ── */}
        <form
          method="GET"
          className="bg-card border border-border rounded-xl p-4 mb-6 flex flex-wrap items-end gap-4"
        >
          {/* Year */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              السنة
            </label>
            <select
              name="year"
              defaultValue={year}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(
                (y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                )
              )}
            </select>
          </div>

          {/* Month */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              الشهر
            </label>
            <select
              name="month"
              defaultValue={month}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const label = new Date(2000, m - 1, 1).toLocaleString("ar-EG", {
                  month: "long",
                });
                return (
                  <option key={m} value={m}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Governorate */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              المحافظة
            </label>
            <select
              name="governorateId"
              defaultValue={selectedGovernorateId}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">الكل</option>
              {governorates.map((gov) => (
                <option key={gov.id} value={gov.id}>
                  {gov.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            تطبيق
          </button>

          {selectedGovernorateId && (
            <Link
              href="/dashboard/reports/monthly"
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors text-muted-foreground"
            >
              إعادة ضبط
            </Link>
          )}
        </form>
      </div>

      <Suspense fallback={<MonthlyReportSkeleton />}>
        <MonthlyReportContent 
          year={year} 
          month={month} 
          selectedGovernorateId={selectedGovernorateId}
          startOfMonth={startOfMonth}
          endOfMonth={endOfMonth}
          startOfPrevMonth={startOfPrevMonth}
          endOfPrevMonth={endOfPrevMonth}
          monthLabel={monthLabel}
          selectedGovName={selectedGovName}
        />
      </Suspense>
    </div>
  );
}

function MonthlyReportSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    </div>
  );
}

async function MonthlyReportContent({
  year,
  month,
  selectedGovernorateId,
  startOfMonth,
  endOfMonth,
  startOfPrevMonth,
  endOfPrevMonth,
  monthLabel,
  selectedGovName
}: {
  year: number;
  month: number;
  selectedGovernorateId: string;
  startOfMonth: Date;
  endOfMonth: Date;
  startOfPrevMonth: Date;
  endOfPrevMonth: Date;
  monthLabel: string;
  selectedGovName: string;
}) {
  const [currentInvoices, prevInvoices, targetPeriods, returnsList] =
    await Promise.all([
      // Current Month Invoices
      prisma.invoice.findMany({
        where: {
          invoiceDate: { gte: startOfMonth, lte: endOfMonth },
          status: { not: "DRAFT" },
          isLegacy: false,
          ...(selectedGovernorateId
            ? { pharmacy: { governorateId: selectedGovernorateId } }
            : {}),
        },
        include: {
          pharmacy: {
            select: { id: true, name: true, governorateId: true },
          },
          salesRep: { select: { id: true, name: true, monthlyTarget: true } },
          items: { select: { quantity: true } },
          payments: { select: { amount: true } },
        },
      }),
      // Previous Month Invoices
      prisma.invoice.findMany({
        where: {
          invoiceDate: { gte: startOfPrevMonth, lte: endOfPrevMonth },
          status: { not: "DRAFT" },
          isLegacy: false,
          ...(selectedGovernorateId
            ? { pharmacy: { governorateId: selectedGovernorateId } }
            : {}),
        },
        select: { total: true },
      }),
      // Current Month Pharmacy Targets
      prisma.pharmacyTargetPeriod.findMany({
        where: {
          periodYear: year,
          periodMonth: month,
          ...(selectedGovernorateId
            ? { pharmacy: { governorateId: selectedGovernorateId } }
            : {}),
        },
        include: {
          pharmacy: { select: { name: true, governorateId: true } },
        },
        orderBy: { achieved: "desc" },
      }),
      // Returns for the month
      prisma.return.findMany({
        where: {
          returnDate: { gte: startOfMonth, lte: endOfMonth },
          ...(selectedGovernorateId
            ? { pharmacy: { governorateId: selectedGovernorateId } }
            : {}),
        },
        include: {
          pharmacy: { select: { id: true, name: true } },
          invoice: { select: { salesRepId: true } },
          items: {
            include: { product: { select: { name: true, sku: true } } },
          },
        },
        orderBy: { returnDate: "desc" },
      }),
    ]);

  // ── Sales Calculations ──
  const currentTotalSales = currentInvoices.reduce(
    (s: number, i: any) => s + Number(i.total),
    0
  );
  const currentCashSales = currentInvoices
    .filter((i: any) => i.type === "CASH")
    .reduce((s: number, i: any) => s + Number(i.total), 0);
  const currentCreditSales = currentInvoices
    .filter((i: any) => i.type === "CREDIT")
    .reduce((s: number, i: any) => s + Number(i.total), 0);

  const prevTotalSales = prevInvoices.reduce(
    (s: number, i: any) => s + Number(i.total),
    0
  );

  let growthPercentage = 0;
  if (prevTotalSales > 0) {
    growthPercentage =
      ((currentTotalSales - prevTotalSales) / prevTotalSales) * 100;
  } else if (currentTotalSales > 0) {
    growthPercentage = 100;
  }

  // ── Target Calculations ──
  const totalTargetAmount = targetPeriods.reduce(
    (s: number, t: any) => s + Number(t.target),
    0
  );
  const totalAchievedAmount = targetPeriods.reduce(
    (s: number, t: any) => s + Number(t.achieved),
    0
  );
  const overallTargetPercentage =
    totalTargetAmount > 0
      ? Math.round((totalAchievedAmount / totalTargetAmount) * 100)
      : 0;

  // ── Top Pharmacies Calculation ──
  const pharmacyStats = currentInvoices.reduce((acc: any, inv: any) => {
    if (!acc[inv.pharmacyId]) {
      acc[inv.pharmacyId] = {
        name: inv.pharmacy.name,
        totalQuantity: 0,
        totalPaid: 0,
      };
    }
    acc[inv.pharmacyId].totalQuantity += inv.items.reduce(
      (s: number, i: any) => s + Number(i.quantity),
      0
    );
    acc[inv.pharmacyId].totalPaid += inv.payments.reduce(
      (s: number, p: any) => s + Number(p.amount),
      0
    );
    return acc;
  }, {});

  returnsList.forEach((ret: any) => {
    if (pharmacyStats[ret.pharmacyId]) {
      pharmacyStats[ret.pharmacyId].totalQuantity -= ret.items.reduce(
        (s: number, i: any) => s + Number(i.quantity),
        0
      );
    }
  });

  const pharmaciesArray = Object.values(pharmacyStats);
  const topByQuantity = [...pharmaciesArray]
    .sort((a: any, b: any) => b.totalQuantity - a.totalQuantity)
    .slice(0, 10);
  const topByCollection = [...pharmaciesArray]
    .sort((a: any, b: any) => b.totalPaid - a.totalPaid)
    .slice(0, 10);

  // ── Sales Team Performance Calculation ──
  const repStats: Record<string, any> = {};

  currentInvoices.forEach((inv: any) => {
    const repId = inv.salesRep.id;
    if (!repStats[repId]) {
      repStats[repId] = {
        name: inv.salesRep.name,
        invoicesCount: 0,
        totalSales: 0,
        totalCollections: 0,
        totalReturns: 0,
        target: Number(inv.salesRep.monthlyTarget) || 0,
      };
    }
    repStats[repId].invoicesCount += 1;
    repStats[repId].totalSales += Number(inv.total);
    repStats[repId].totalCollections += inv.payments.reduce(
      (s: number, p: any) => s + Number(p.amount),
      0
    );
  });

  returnsList.forEach((ret: any) => {
    const repId = ret.invoice?.salesRepId;
    if (repId && repStats[repId]) {
      repStats[repId].totalReturns += Number(ret.totalAmount);
    }
  });

  const salesTeamPerformance = Object.values(repStats).sort(
    (a: any, b: any) => b.totalSales - a.totalSales
  );

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-8 print:border print:border-gray-300 print:shadow-none print:p-0 print:rounded-none">
        <div className="hidden print:flex justify-between items-start mb-8 pb-6 border-b border-border/50">
          <div>
            <h2 className="text-2xl font-bold text-black mb-1">Kapy Pharma</h2>
            <p className="text-sm text-gray-600">التقرير الشهري الشامل</p>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold">عن شهر: {monthLabel}</p>
            {selectedGovernorateId && (
              <p className="text-sm text-gray-600">محافظة: {selectedGovName}</p>
            )}
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* KPI 1 — Total Sales */}
          <div className="p-5 rounded-xl border border-border bg-gradient-to-br from-primary/5 to-cyan-500/5 print:shadow-none print:border print:border-black/20 print:bg-transparent">
            <p className="text-sm text-muted-foreground font-medium mb-1">
              إجمالي المبيعات
            </p>
            <p className="text-3xl font-bold text-primary mb-2">
              {formatCurrency(currentTotalSales.toString())}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md",
                  growthPercentage >= 0
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                )}
              >
                <TrendingUp
                  className={cn(
                    "w-3.5 h-3.5",
                    growthPercentage < 0 && "rotate-180"
                  )}
                />
                {Math.abs(growthPercentage).toFixed(1)}%
              </span>
              <span className="text-muted-foreground text-xs">
                مقارنة بالشهر السابق ({formatCurrency(prevTotalSales.toString())})
              </span>
            </div>
          </div>

          {/* KPI 2 — Cash vs Credit split */}
          <div className="p-5 rounded-xl border border-border bg-card flex flex-col justify-center print:shadow-none print:border print:border-black/20">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-muted-foreground font-medium">
                مبيعات نقدية
              </p>
              <p className="font-bold text-green-600">
                {formatCurrency(currentCashSales.toString())}
              </p>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mb-4">
              <div
                className="bg-green-500 h-1.5 rounded-full"
                style={{
                  width: `${currentTotalSales ? (currentCashSales / currentTotalSales) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-muted-foreground font-medium">
                مبيعات آجلة
              </p>
              <p className="font-bold text-blue-600">
                {formatCurrency(currentCreditSales.toString())}
              </p>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full"
                style={{
                  width: `${currentTotalSales ? (currentCreditSales / currentTotalSales) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* KPI 3 — Target Achievement */}
          <div className="p-5 rounded-xl border border-border bg-card flex flex-col justify-center items-center text-center print:shadow-none print:border print:border-black/20">
            <Target className="w-8 h-8 text-amber-500 mb-2" />
            <p className="text-sm text-muted-foreground font-medium mb-1">
              إجمالي تحقيق أهداف السوق
            </p>
            <p className="text-3xl font-bold text-foreground mb-1">
              {overallTargetPercentage}%
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(totalAchievedAmount.toString())} من أصل{" "}
              {formatCurrency(totalTargetAmount.toString())}
            </p>
          </div>
        </div>

        {/* Pharmacy Targets Breakdown */}
        <div>
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            تحقيق الأهداف حسب الصيدلية
          </h3>
          {targetPeriods.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              لم يتم إعداد أهداف بيعية للصيدليات في هذا الشهر
              {selectedGovernorateId ? ` (محافظة: ${selectedGovName})` : ""}.
            </p>
          ) : (
            <div className="space-y-4">
              {targetPeriods.map((tp: any) => {
                const percentage =
                  tp.target > 0
                    ? Math.min(
                        100,
                        Math.round((tp.achieved / tp.target) * 100)
                      )
                    : 0;
                const isComplete = percentage >= 100;

                return (
                  <div
                    key={tp.id}
                    className="p-4 border border-border/60 rounded-xl bg-card"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-bold text-foreground">
                        {tp.pharmacy.name}
                      </p>
                      <p className="text-sm font-medium">
                        {formatCurrency(tp.achieved.toString())} /{" "}
                        <span className="text-muted-foreground">
                          {formatCurrency(tp.target.toString())}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            isComplete ? "bg-green-500" : "bg-primary"
                          )}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-xs font-bold w-10 text-right",
                          isComplete
                            ? "text-green-600"
                            : "text-muted-foreground"
                        )}
                      >
                        {percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Pharmacies Breakdown */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* By Quantity */}
          <div>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              أعلى الصيدليات في السحب
            </h3>
            {topByQuantity.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                لا توجد مبيعات مسجلة.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60">
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                        اسم الصيدلية
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        الكمية المسحوبة
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {topByQuantity.map((client: any, idx: number) => (
                      <tr
                        key={idx}
                        className="bg-card print:break-inside-avoid"
                      >
                        <td className="px-4 py-3 font-bold text-foreground">
                          {idx + 1}. {client.name}
                        </td>
                        <td className="px-4 py-3 text-center text-primary font-bold">
                          {Number(client.totalQuantity).toFixed(2)} وحدة
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* By Collection */}
          <div>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              أعلى الصيدليات في التحصيل
            </h3>
            {topByCollection.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                لا توجد تحصيلات مسجلة.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60">
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                        اسم الصيدلية
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        المبالغ المُحصّلة
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {topByCollection.map((client: any, idx: number) => (
                      <tr
                        key={idx}
                        className="bg-card print:break-inside-avoid"
                      >
                        <td className="px-4 py-3 font-bold text-foreground">
                          {idx + 1}. {client.name}
                        </td>
                        <td className="px-4 py-3 text-center text-green-600 font-bold">
                          {formatCurrency(client.totalPaid.toString())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sales Team Performance */}
        <div className="mt-8">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            أداء فريق المبيعات
          </h3>
          {salesTeamPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              لا توجد بيانات متاحة لفريق المبيعات.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      اسم المندوب
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                      عدد الفواتير
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                      قيمة المبيعات
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                      التحصيلات النقدية
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                      المرتجعات
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                      تحقيق التارجت
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {salesTeamPerformance.map((rep: any, idx: number) => {
                    const netSales = rep.totalSales - rep.totalReturns;
                    const achievement =
                      rep.target > 0
                        ? Math.round((netSales / rep.target) * 100)
                        : 0;
                    return (
                      <tr
                        key={idx}
                        className="bg-card hover:bg-muted/10 transition-colors print:break-inside-avoid"
                      >
                        <td className="px-4 py-3 font-bold text-foreground">
                          {rep.name}
                        </td>
                        <td className="px-4 py-3 text-center font-medium">
                          {rep.invoicesCount}
                        </td>
                        <td className="px-4 py-3 text-center text-primary font-semibold">
                          {formatCurrency(rep.totalSales.toString())}
                        </td>
                        <td className="px-4 py-3 text-center text-green-600 font-semibold">
                          {formatCurrency(rep.totalCollections.toString())}
                        </td>
                        <td className="px-4 py-3 text-center text-red-500 font-semibold">
                          {formatCurrency(rep.totalReturns.toString())}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {rep.target > 0 ? (
                            <div className="flex items-center justify-center gap-2">
                              <span
                                className={cn(
                                  "text-xs font-bold",
                                  achievement >= 100
                                    ? "text-green-600"
                                    : "text-amber-500"
                                )}
                              >
                                {achievement}%
                              </span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    achievement >= 100
                                      ? "bg-green-500"
                                      : "bg-amber-500"
                                  )}
                                  style={{
                                    width: `${Math.min(100, achievement)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              لا يوجد
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Returns Tracking */}
        <div className="mt-8">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-red-500" />
            حركة المرتجعات
          </h3>
          {returnsList.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              لم يتم تسجيل أي مرتجعات في هذا الشهر.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      التاريخ
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      العميل
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      المنتجات
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                      القيمة الإجمالية
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {returnsList.map((ret: any) => (
                    <tr
                      key={ret.id}
                      className="bg-card print:break-inside-avoid"
                    >
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {ret.returnDate.toLocaleDateString("ar-EG")}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {ret.pharmacy.name}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {ret.items.map((i: any) => (
                          <div
                            key={i.id}
                            className="mb-1 text-muted-foreground"
                          >
                            {Number(i.quantity).toFixed(2)}x {i.product.name}
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-center text-red-600 font-semibold">
                        {formatCurrency(ret.totalAmount.toString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
