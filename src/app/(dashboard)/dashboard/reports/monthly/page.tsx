import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ArrowRight, CalendarRange, TrendingUp, BarChart3, Target, Undo2, Award, Package, MapPin, Users } from "lucide-react";
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

  const [currentInvoicesSimple, prevInvoices, targetPeriods, currentInvoicesDetails, returnsList] = await Promise.all([
    // Current Month Invoices (Simple for KPIs)
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
    // Current Month Invoices with details for Top Pharmacies
    prisma.invoice.findMany({
      where: { invoiceDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }, status: { not: "DRAFT" } },
      include: { 
        pharmacy: { include: { governorate: true } }, 
        salesRep: { select: { id: true, name: true, monthlyTarget: true } },
        items: { select: { quantity: true } }, 
        payments: { select: { amount: true } } 
      },
    }),
    // Returns for the month
    prisma.return.findMany({
      where: { returnDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
      include: { 
        pharmacy: { include: { governorate: true } }, 
        invoice: { select: { salesRepId: true } },
        items: { include: { product: { select: { name: true, sku: true } } } } 
      },
      orderBy: { returnDate: "desc" },
    })
  ]);

  // Sales Calculations
  const currentTotalSales = currentInvoicesSimple.reduce((s: number, i: any) => s + Number(i.total), 0);
  const currentCashSales = currentInvoicesSimple.filter((i: any) => i.type === "CASH").reduce((s: number, i: any) => s + Number(i.total), 0);
  const currentCreditSales = currentInvoicesSimple.filter((i: any) => i.type === "CREDIT").reduce((s: number, i: any) => s + Number(i.total), 0);
  
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

  // Top Pharmacies Calculation
  const pharmacyStats = currentInvoicesDetails.reduce((acc: any, inv: any) => {
    if (!acc[inv.pharmacyId]) {
      acc[inv.pharmacyId] = { name: inv.pharmacy.name, totalQuantity: 0, totalPaid: 0 };
    }
    acc[inv.pharmacyId].totalQuantity += inv.items.reduce((s: number, i: any) => s + i.quantity, 0);
    acc[inv.pharmacyId].totalPaid += inv.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
    return acc;
  }, {});

  // Subtract returned quantities
  returnsList.forEach((ret: any) => {
    if (pharmacyStats[ret.pharmacyId]) {
       pharmacyStats[ret.pharmacyId].totalQuantity -= ret.items.reduce((s: number, i: any) => s + i.quantity, 0);
    }
  });
  
  const pharmaciesArray = Object.values(pharmacyStats);
  const topByQuantity = [...pharmaciesArray].sort((a: any, b: any) => b.totalQuantity - a.totalQuantity).slice(0, 10);
  const topByCollection = [...pharmaciesArray].sort((a: any, b: any) => b.totalPaid - a.totalPaid).slice(0, 10);

  // --- Governorate Performance Calculation ---
  const govStats: Record<string, any> = {};
  
  currentInvoicesDetails.forEach((inv: any) => {
    const govId = inv.pharmacy.governorate.id;
    if (!govStats[govId]) {
      govStats[govId] = {
        name: inv.pharmacy.governorate.name,
        totalSales: 0,
        totalCollections: 0,
        totalReturns: 0
      };
    }
    govStats[govId].totalSales += Number(inv.total);
    govStats[govId].totalCollections += inv.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  });

  returnsList.forEach((ret: any) => {
    const govId = ret.pharmacy.governorate.id;
    if (!govStats[govId]) {
      govStats[govId] = {
        name: ret.pharmacy.governorate.name,
        totalSales: 0,
        totalCollections: 0,
        totalReturns: 0
      };
    }
    govStats[govId].totalReturns += Number(ret.totalAmount);
  });
  const governoratesPerformance = Object.values(govStats).sort((a: any, b: any) => b.totalSales - a.totalSales);

  // --- Sales Team Performance Calculation ---
  const repStats: Record<string, any> = {};
  
  currentInvoicesDetails.forEach((inv: any) => {
    const repId = inv.salesRep.id;
    if (!repStats[repId]) {
      repStats[repId] = {
        name: inv.salesRep.name,
        invoicesCount: 0,
        totalSales: 0,
        totalCollections: 0,
        totalReturns: 0,
        target: Number(inv.salesRep.monthlyTarget) || 0
      };
    }
    repStats[repId].invoicesCount += 1;
    repStats[repId].totalSales += Number(inv.total);
    repStats[repId].totalCollections += inv.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  });
  
  returnsList.forEach((ret: any) => {
    const repId = ret.invoice?.salesRepId;
    if (repId && repStats[repId]) {
      repStats[repId].totalReturns += Number(ret.totalAmount);
    }
  });

  const salesTeamPerformance = Object.values(repStats).sort((a: any, b: any) => b.totalSales - a.totalSales);

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

        {/* Top Pharmacies Breakdown */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* By Quantity */}
          <div>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              أعلى الصيدليات في السحب
            </h3>
            {topByQuantity.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">لا توجد مبيعات مسجلة هذا الشهر.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60">
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">اسم الصيدلية</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">الكمية المسحوبة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {topByQuantity.map((client: any, idx: number) => (
                      <tr key={idx} className="bg-card">
                        <td className="px-4 py-3 font-bold text-foreground">
                          {idx + 1}. {client.name}
                        </td>
                        <td className="px-4 py-3 text-center text-primary font-bold">{client.totalQuantity} وحدة</td>
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
              <p className="text-sm text-muted-foreground italic">لا توجد تحصيلات مسجلة هذا الشهر.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60">
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">اسم الصيدلية</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">المبالغ المُحصّلة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {topByCollection.map((client: any, idx: number) => (
                      <tr key={idx} className="bg-card">
                        <td className="px-4 py-3 font-bold text-foreground">
                          {idx + 1}. {client.name}
                        </td>
                        <td className="px-4 py-3 text-center text-green-600 font-bold">{formatCurrency(client.totalPaid.toString())}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Governorate Performance */}
        <div className="mt-8">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-500" />
            أداء المحافظات (الشهر الحالي)
          </h3>
          {governoratesPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">لا توجد بيانات متاحة للمحافظات هذا الشهر.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">اسم المحافظة</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">إجمالي المبيعات</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">التحصيلات</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">المرتجعات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {governoratesPerformance.map((gov: any, idx: number) => (
                    <tr key={idx} className="bg-card hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 font-bold text-foreground">{gov.name}</td>
                      <td className="px-4 py-3 text-center text-primary font-semibold">{formatCurrency(gov.totalSales.toString())}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-semibold">{formatCurrency(gov.totalCollections.toString())}</td>
                      <td className="px-4 py-3 text-center text-red-500 font-semibold">{formatCurrency(gov.totalReturns.toString())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sales Team Performance */}
        <div className="mt-8">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            أداء فريق المبيعات (الشهر الحالي)
          </h3>
          {salesTeamPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">لا توجد بيانات متاحة لفريق المبيعات هذا الشهر.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">اسم المندوب</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">عدد الفواتير</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">قيمة المبيعات</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">التحصيلات النقدية</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">المرتجعات</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">تحقيق التارجت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {salesTeamPerformance.map((rep: any, idx: number) => {
                    const netSales = rep.totalSales - rep.totalReturns;
                    const achievement = rep.target > 0 ? Math.round((netSales / rep.target) * 100) : 0;
                    return (
                      <tr key={idx} className="bg-card hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 font-bold text-foreground">{rep.name}</td>
                        <td className="px-4 py-3 text-center font-medium">{rep.invoicesCount}</td>
                        <td className="px-4 py-3 text-center text-primary font-semibold">{formatCurrency(rep.totalSales.toString())}</td>
                        <td className="px-4 py-3 text-center text-green-600 font-semibold">{formatCurrency(rep.totalCollections.toString())}</td>
                        <td className="px-4 py-3 text-center text-red-500 font-semibold">{formatCurrency(rep.totalReturns.toString())}</td>
                        <td className="px-4 py-3 text-center">
                          {rep.target > 0 ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className={cn("text-xs font-bold", achievement >= 100 ? "text-green-600" : "text-amber-500")}>
                                {achievement}%
                              </span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className={cn("h-full rounded-full", achievement >= 100 ? "bg-green-500" : "bg-amber-500")}
                                  style={{ width: `${Math.min(100, achievement)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">لا يوجد</span>
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
            حركة المرتجعات (الشهر الحالي)
          </h3>
          {returnsList.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">لم يتم تسجيل أي مرتجعات هذا الشهر.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">العميل</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">المنتجات</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">القيمة الإجمالية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {returnsList.map((ret: any) => (
                    <tr key={ret.id} className="bg-card">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{ret.returnDate.toLocaleDateString("ar-EG")}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{ret.pharmacy.name}</td>
                      <td className="px-4 py-3 text-xs">
                        {ret.items.map((i: any) => (
                          <div key={i.id} className="mb-1 text-muted-foreground">
                            {i.quantity}x {i.product.name}
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
    </div>
  );
}


