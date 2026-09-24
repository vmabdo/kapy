import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ArrowRight, Printer, CalendarDays, TrendingUp, TrendingDown, FileText, Undo2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PrintButton } from "../../sales/[id]/print-button";

export const metadata: Metadata = { title: "التقرير اليومي" };
export const dynamic = "force-dynamic";

export default async function DailyReportPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Fetch today's data in parallel
  const [invoices, payments, treasuryOut, returnsList] = await Promise.all([
    // Today's invoices
    prisma.invoice.findMany({
      where: { invoiceDate: { gte: today, lt: tomorrow } },
      include: { 
        pharmacy: { select: { id: true, name: true } }, 
        salesRep: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true } }
          }
        }
      },
      orderBy: { invoiceDate: "desc" },
    }),
    // Today's payments (collections)
    prisma.payment.findMany({
      where: { paidAt: { gte: today, lt: tomorrow } },
      include: { invoice: { include: { pharmacy: { select: { name: true } } } } },
      orderBy: { paidAt: "desc" },
    }),
    // Today's treasury expenses
    prisma.transaction.findMany({
      where: { type: "CASH_OUT", createdAt: { gte: today, lt: tomorrow } },
      orderBy: { createdAt: "desc" },
    }),
    // Today's returns
    prisma.return.findMany({
      where: { returnDate: { gte: today, lt: tomorrow } },
      include: { pharmacy: { select: { name: true } }, items: { include: { product: { select: { name: true } } } } },
      orderBy: { returnDate: "desc" },
    }),
  ]);

  // Aggregate stats
  const cashSales = invoices.filter((i: any) => i.type === "CASH").reduce((s: number, i: any) => s + Number(i.total), 0);
  const creditSales = invoices.filter((i: any) => i.type === "CREDIT").reduce((s: number, i: any) => s + Number(i.total), 0);
  const totalCollections = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalExpenses = treasuryOut.reduce((s: number, t: any) => s + Number(t.amount), 0);
  
  // Net Cash Flow for today (Cash Sales + Collections from previous credits) - Expenses
  // Actually, Cash Sales might be recorded as paid immediately, but let's assume they aren't fully integrated into Payments yet for this basic report, 
  // or if they are, we just count them. Let's just sum cashSales + totalCollections - totalExpenses for net cash indicator.
  // We'll show them separately for clarity.
  // Group invoices by pharmacy
  const pharmacyInvoices = invoices.reduce((acc: any, inv: any) => {
    if (!acc[inv.pharmacy.id]) {
      acc[inv.pharmacy.id] = {
        pharmacyName: inv.pharmacy.name,
        invoices: [],
        totalValue: 0
      };
    }
    acc[inv.pharmacy.id].invoices.push(inv);
    acc[inv.pharmacy.id].totalValue += Number(inv.total);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto print:max-w-full">
      {/* Non-printable Navigation */}
      <div className="print:hidden">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
          <Link href="/dashboard/reports" className="hover:text-foreground transition-colors">التقارير</Link>
          <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          <span className="text-foreground font-medium">التقرير اليومي</span>
        </nav>
        
        <div className="page-header mb-6">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-primary" />
              تقرير يومية الخزينة والمبيعات
            </h1>
            <p className="page-subtitle">عن يوم {formatDate(today)}</p>
          </div>
          <PrintButton />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-8 print:border-none print:shadow-none print:p-0">
        
        {/* Print Header */}
        <div className="hidden print:flex justify-between items-start mb-8 pb-6 border-b border-border/50">
          <div>
            <h2 className="text-2xl font-bold text-black mb-1">Kapy Pharma</h2>
            <p className="text-sm text-gray-600">التقرير اليومي الشامل (تقفيل الوردية)</p>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold">عن يوم: {formatDate(today)}</p>
            <p className="text-xs text-gray-500 mt-1">تاريخ الطباعة: {formatDate(new Date())}</p>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <p className="text-xs text-muted-foreground font-medium mb-1">المبيعات النقدية</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(cashSales.toString())}</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <p className="text-xs text-muted-foreground font-medium mb-1">المبيعات الآجلة</p>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(creditSales.toString())}</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <p className="text-xs text-muted-foreground font-medium mb-1">التحصيلات النقدية (دفعات آجلة)</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalCollections.toString())}</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-red-50/50 dark:bg-red-900/10">
            <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">المنصرف والمصروفات</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalExpenses.toString())}</p>
          </div>
        </div>

        {/* Sales Table - Detailed by Pharmacy */}
        <div className="mb-8">
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            تفصيل مبيعات الصيدليات اليوم
          </h3>
          {Object.keys(pharmacyInvoices).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">لم يتم إصدار أي فواتير اليوم.</p>
          ) : (
            <div className="space-y-6">
              {Object.values(pharmacyInvoices).map((pharmacyData: any, idx: number) => (
                <div key={idx} className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
                  <div className="bg-muted/40 px-5 py-3 flex justify-between items-center border-b border-border">
                    <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                      {pharmacyData.pharmacyName}
                    </h4>
                    <div className="text-left">
                      <span className="text-xs text-muted-foreground ml-2">الإجمالي:</span>
                      <span className="font-bold text-primary">{formatCurrency(pharmacyData.totalValue.toString())}</span>
                    </div>
                  </div>
                  <div className="p-5">
                    {pharmacyData.invoices.map((inv: any, iIdx: number) => (
                      <div key={inv.id} className={iIdx !== pharmacyData.invoices.length - 1 ? "mb-6 pb-6 border-b border-border/50" : ""}>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">رقم الفاتورة: <strong className="text-foreground font-mono">{inv.invoiceNumber}</strong></span>
                          <span className="flex items-center gap-1">المندوب: <strong className="text-foreground">{inv.salesRep.name}</strong></span>
                          <span className="flex items-center gap-1">النوع: <strong className="text-foreground">{inv.type === "CASH" ? "نقدي" : "آجل"}</strong></span>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-border/60">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-muted/20 text-muted-foreground border-b border-border/60">
                                <th className="px-4 py-2 text-right font-medium">اسم المنتج</th>
                                <th className="px-4 py-2 text-center font-medium w-24">الكمية</th>
                                <th className="px-4 py-2 text-center font-medium w-32">سعر الوحدة</th>
                                <th className="px-4 py-2 text-left font-medium w-32">القيمة الإجمالية</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              {inv.items.map((item: any) => (
                                <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                                  <td className="px-4 py-2 font-medium">{item.product.name}</td>
                                  <td className="px-4 py-2 text-center text-primary font-bold">{item.quantity}</td>
                                  <td className="px-4 py-2 text-center">{formatCurrency(item.unitPrice.toString())}</td>
                                  <td className="px-4 py-2 text-left font-bold">{formatCurrency(item.lineTotal.toString())}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Collections Table */}
        <div className="mb-8">
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            التحصيلات النقدية اليوم ({payments.length})
          </h3>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">لا توجد تحصيلات مسجلة اليوم.</p>
          ) : (
            <table className="w-full text-sm border-collapse border border-border">
              <thead>
                <tr className="bg-muted/40">
                  <th className="border border-border px-3 py-2 text-right">رقم الفاتورة</th>
                  <th className="border border-border px-3 py-2 text-right">العميل (الصيدلية)</th>
                  <th className="border border-border px-3 py-2 text-right">المرجع</th>
                  <th className="border border-border px-3 py-2 text-left">المبلغ المحصل</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="border border-border px-3 py-2 font-mono">{p.invoice.invoiceNumber}</td>
                    <td className="border border-border px-3 py-2">{p.invoice.pharmacy.name}</td>
                    <td className="border border-border px-3 py-2">{p.referenceNo || "—"}</td>
                    <td className="border border-border px-3 py-2 text-left font-semibold text-green-600">{formatCurrency(p.amount.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Expenses Table */}
        <div className="mb-8">
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-600" />
            المصروفات والمنصرف اليوم ({treasuryOut.length})
          </h3>
          {treasuryOut.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">لا توجد مصروفات مسجلة اليوم.</p>
          ) : (
            <table className="w-full text-sm border-collapse border border-border">
              <thead>
                <tr className="bg-muted/40">
                  <th className="border border-border px-3 py-2 text-right">التصنيف</th>
                  <th className="border border-border px-3 py-2 text-right">البيان</th>
                  <th className="border border-border px-3 py-2 text-right">المرجع</th>
                  <th className="border border-border px-3 py-2 text-left">المبلغ المنصرف</th>
                </tr>
              </thead>
              <tbody>
                {treasuryOut.map((t: any) => (
                  <tr key={t.id}>
                    <td className="border border-border px-3 py-2">{t.category}</td>
                    <td className="border border-border px-3 py-2">{t.description || "—"}</td>
                    <td className="border border-border px-3 py-2">{t.referenceNo || "—"}</td>
                    <td className="border border-border px-3 py-2 text-left font-semibold text-red-600">{formatCurrency(t.amount.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Returns Table */}
        <div className="mb-8">
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-red-500" />
            حركة المرتجعات اليوم ({returnsList.length})
          </h3>
          {returnsList.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">لم يتم تسجيل أي مرتجعات اليوم.</p>
          ) : (
            <table className="w-full text-sm border-collapse border border-border">
              <thead>
                <tr className="bg-muted/40">
                  <th className="border border-border px-3 py-2 text-right">رقم المرتجع</th>
                  <th className="border border-border px-3 py-2 text-right">العميل</th>
                  <th className="border border-border px-3 py-2 text-right">المنتجات</th>
                  <th className="border border-border px-3 py-2 text-left">القيمة الإجمالية</th>
                </tr>
              </thead>
              <tbody>
                {returnsList.map((ret: any) => (
                  <tr key={ret.id}>
                    <td className="border border-border px-3 py-2 font-mono">{ret.returnNumber}</td>
                    <td className="border border-border px-3 py-2">{ret.pharmacy.name}</td>
                    <td className="border border-border px-3 py-2">
                      {ret.items.map((i: any) => (
                        <div key={i.id} className="text-xs text-muted-foreground">
                          {i.quantity}x {i.product.name}
                        </div>
                      ))}
                    </td>
                    <td className="border border-border px-3 py-2 text-left font-semibold text-red-600">{formatCurrency(ret.totalAmount.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}


