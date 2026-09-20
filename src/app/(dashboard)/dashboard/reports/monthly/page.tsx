import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ArrowRight, CalendarRange, TrendingUp, BarChart3, Target } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { PrintButton } from "../../sales/[id]/print-button";

export const metadata: Metadata = { title: "التقرير الشهري" };
export const dynamic = "force-dynamic";

export default async function MonthlyReportPage() {
  const now = new Date();
  
  // Current Month bounds
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  
  // Previous Month bounds
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [currentInvoices, prevInvoices, targetPeriods] = await Promise.all([
    // Current Month Invoices
    prisma.invoice.findMany({
      where: { invoiceDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }, status: { not: "DRAFT" } },
      select: { total: true, type: true },
    }),
    // Previous Month Invoices
    prisma.invoice.findMany({
      where: { invoiceDate: { gte: startOfPrevMonth, lte: endOfPrevMonth }, status: { not: "DRAFT" } },
      select: { total: true },
    }),
    // Current Month Targets
    prisma.pharmacyTargetPeriod.findMany({
      where: { periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 },
      include: { pharmacy: { select: { name: true } } },
      orderBy: { achieved: "desc" },
    }),
  ]);

  // Sales Calculations
  const currentTotalSales = currentInvoices.reduce((s: number, i: any) => s + Number(i.total), 0);
  const currentCashSales = currentInvoices.filter((i: any) => i.type === "CASH").reduce((s: number, i: any) => s + Number(i.total), 0);
  const currentCreditSales = currentInvoices.filter((i: any) => i.type === "CREDIT").reduce((s: number, i: any) => s + Number(i.total), 0);
  
  const prevTotalSales = prevInvoices.reduce((s: number, i: any) => s + Number(i.total), 0);
  
  // Growth calculation
  let growthPercentage = 0;
  if (prevTotalSales > 0) {
    growthPercentage = ((currentTotalSales - prevTotalSales) / prevTotalSales) * 100;
  } else if (currentTotalSales > 0) {
    growthPercentage = 100; // From 0 to something
  }

  // Target Calculations
  const totalTargetAmount = targetPeriods.reduce((s: number, t: any) => s + Number(t.target), 0);
  const totalAchievedAmount = targetPeriods.reduce((s: number, t: any) => s + Number(t.achieved), 0);
  const overallTargetPercentage = totalTargetAmount > 0 ? Math.round((totalAchievedAmount / totalTargetAmount) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto print:max-w-full">
      <div className="print:hidden">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
          <Link href="/dashboard/reports" className="hover:text-foreground transition-colors">التقارير</Link>
          <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          <span className="text-foreground font-medium">التقرير الشهري</span>
        </nav>
        
        <div className="page-header mb-6">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <CalendarRange className="w-6 h-6 text-primary" />
              تقرير الأداء الشهري
            </h1>
            <p className="page-subtitle">عن شهر {startOfCurrentMonth.toLocaleString('ar-EG', { month: 'long', year: 'numeric' })}</p>
          </div>
          <PrintButton />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-8 print:border-none print:shadow-none print:p-0">
        
        <div className="hidden print:flex justify-between items-start mb-8 pb-6 border-b border-border/50">
          <div>
            <h2 className="text-2xl font-bold text-black mb-1">Kapy Pharma</h2>
            <p className="text-sm text-gray-600">التقرير الشهري الشامل</p>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold">عن شهر: {startOfCurrentMonth.toLocaleString('ar-EG', { month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          <div className="p-5 rounded-xl border border-border bg-gradient-to-br from-primary/5 to-cyan-500/5">
            <p className="text-sm text-muted-foreground font-medium mb-1">إجمالي المبيعات (الشهر الحالي)</p>
            <p className="text-3xl font-bold text-primary mb-2">{formatCurrency(currentTotalSales.toString())}</p>
            <div className="flex items-center gap-2 text-sm">
              <span className={cn(
                "flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md",
                growthPercentage >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              )}>
                <TrendingUp className={cn("w-3.5 h-3.5", growthPercentage < 0 && "rotate-180")} />
                {Math.abs(growthPercentage).toFixed(1)}%
              </span>
              <span className="text-muted-foreground text-xs">مقارنة بالشهر السابق ({formatCurrency(prevTotalSales.toString())})</span>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-border bg-card flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-muted-foreground font-medium">مبيعات نقدية</p>
              <p className="font-bold text-green-600">{formatCurrency(currentCashSales.toString())}</p>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mb-4">
              <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${currentTotalSales ? (currentCashSales / currentTotalSales) * 100 : 0}%` }} />
            </div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-muted-foreground font-medium">مبيعات آجلة</p>
              <p className="font-bold text-blue-600">{formatCurrency(currentCreditSales.toString())}</p>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${currentTotalSales ? (currentCreditSales / currentTotalSales) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="p-5 rounded-xl border border-border bg-card flex flex-col justify-center items-center text-center">
            <Target className="w-8 h-8 text-amber-500 mb-2" />
            <p className="text-sm text-muted-foreground font-medium mb-1">إجمالي تحقيق أهداف السوق</p>
            <p className="text-3xl font-bold text-foreground mb-1">{overallTargetPercentage}%</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(totalAchievedAmount.toString())} من أصل {formatCurrency(totalTargetAmount.toString())}
            </p>
          </div>

        </div>

        {/* Pharmacy Targets Breakdown */}
        <div>
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            تحقيق الأهداف حسب الصيدلية (للشهر الحالي)
          </h3>
          {targetPeriods.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">لم يتم إعداد أهداف بيعية للصيدليات هذا الشهر.</p>
          ) : (
            <div className="space-y-4">
              {targetPeriods.map((tp: any) => {
                const percentage = tp.target > 0 ? Math.min(100, Math.round((tp.achieved / tp.target) * 100)) : 0;
                const isComplete = percentage >= 100;
                
                return (
                  <div key={tp.id} className="p-4 border border-border/60 rounded-xl bg-card">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-bold text-foreground">{tp.pharmacy.name}</p>
                      <p className="text-sm font-medium">
                        {formatCurrency(tp.achieved.toString())} / <span className="text-muted-foreground">{formatCurrency(tp.target.toString())}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", isComplete ? "bg-green-500" : "bg-primary")}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className={cn("text-xs font-bold w-10 text-right", isComplete ? "text-green-600" : "text-muted-foreground")}>
                        {percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}


