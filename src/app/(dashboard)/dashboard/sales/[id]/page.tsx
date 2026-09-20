import { notFound } from "next/navigation";
import Link from "next/link";
import { getInvoiceById } from "@/queries/sales";
import { PaymentForm } from "@/components/sales/payment-form";
import { PrintButton } from "./print-button";
import { FileText, ArrowRight, Printer, CheckCircle2, AlertTriangle, Building2, User } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { InvoiceStatus, InvoiceType } from "@prisma/client";
import type { Metadata } from "next";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const inv = await getInvoiceById(params.id);
  return { title: inv ? `فاتورة ${inv.invoiceNumber}` : "تفاصيل الفاتورة" };
}

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<InvoiceStatus, { label: string; class: string }> = {
  DRAFT: { label: "مسودة", class: "bg-muted text-muted-foreground" },
  CONFIRMED: { label: "مؤكدة", class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  PARTIALLY_PAID: { label: "سداد جزئي", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  PAID: { label: "مسددة بالكامل", class: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  OVERDUE: { label: "متأخرة", class: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  CANCELLED: { label: "ملغاة", class: "bg-muted text-muted-foreground line-through" },
};

export default async function InvoiceDetailPage({ params }: Props) {
  const invoice = await getInvoiceById(params.id);
  if (!invoice) notFound();

  const statusInfo = STATUS_LABELS[invoice.status];

  return (
    <div className="max-w-5xl mx-auto print:max-w-full">
      {/* Non-printable Navigation */}
      <div className="print:hidden">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
          <Link href="/dashboard/sales" className="hover:text-foreground transition-colors">المبيعات والفواتير</Link>
          <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          <span className="text-foreground font-medium">فاتورة {invoice.invoiceNumber}</span>
        </nav>

        <div className="page-header mb-6">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              تفاصيل الفاتورة
              <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full mr-3", statusInfo.class)}>
                {statusInfo.label}
              </span>
            </h1>
            <p className="page-subtitle font-mono mt-1"># {invoice.invoiceNumber}</p>
          </div>

          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Invoice Document (Printable) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl p-8 print:border-none print:shadow-none print:p-0">
            {/* Print Header */}
            <div className="flex justify-between items-start mb-8 pb-6 border-b border-border/50">
              <div>
                <h2 className="text-2xl font-bold text-primary mb-1">Kapy Pharma</h2>
                <p className="text-sm text-muted-foreground">شركة كابي فارما للتوزيع الدوائي</p>
                <p className="text-sm text-muted-foreground">سوهاج، مصر</p>
              </div>
              <div className="text-left">
                <h2 className="text-xl font-bold text-foreground mb-1">فاتورة مبيعات</h2>
                <p className="text-sm text-muted-foreground font-mono">رقم: {invoice.invoiceNumber}</p>
                <p className="text-sm text-muted-foreground">التاريخ: {formatDate(invoice.invoiceDate)}</p>
                <p className="text-sm font-medium mt-2">
                  النوع: {invoice.type === "CASH" ? "نقدي" : "آجل"}
                </p>
              </div>
            </div>

            {/* Entities */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-semibold">العميل (الصيدلية)</p>
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">{invoice.pharmacy.name}</p>
                    <p className="text-sm text-muted-foreground">{invoice.pharmacy.governorate.name}</p>
                    {invoice.pharmacy.address && <p className="text-sm text-muted-foreground mt-1">{invoice.pharmacy.address}</p>}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-semibold">مندوب المبيعات</p>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">{invoice.salesRep.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{invoice.salesRep.employeeCode}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-8 overflow-hidden rounded-xl border border-border/50 print:border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/50">
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">المنتج</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">الكمية</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">سعر الوحدة</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{item.product.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-center">{item.quantity} {item.product.unit}</td>
                      <td className="px-4 py-3 text-center">{formatCurrency(item.unitPrice.toString())}</td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">{formatCurrency(item.lineTotal.toString())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-8">
              <div className="w-full sm:w-1/2 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">الإجمالي قبل الخصم:</span>
                  <span className="font-medium text-foreground">{formatCurrency(invoice.total.toString())}</span>
                </div>
                <div className="flex justify-between items-center text-sm pb-3 border-b border-border/50">
                  <span className="text-muted-foreground">الخصم/الضريبة:</span>
                  <span className="font-medium text-foreground">0.00 ج.م</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-foreground">الصافي:</span>
                  <span className="text-xl font-bold text-primary">{formatCurrency(invoice.total.toString())}</span>
                </div>
                
                {invoice.type === "CREDIT" && (
                  <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-amber-800 dark:text-amber-300 font-medium">المدفوع:</span>
                      <span className="text-green-600 font-medium">{formatCurrency(invoice.paidAmount.toString())}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-amber-800 dark:text-amber-300 font-bold">المتبقي:</span>
                      <span className="text-red-600 font-bold">{formatCurrency(invoice.remainingAmount.toString())}</span>
                    </div>
                    {invoice.dueDate && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 text-center pt-2 border-t border-amber-200 dark:border-amber-800/40">
                        تاريخ الاستحقاق: {formatDate(invoice.dueDate)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="mb-8">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-semibold">ملاحظات</p>
                <p className="text-sm text-foreground bg-muted/30 p-3 rounded-lg border border-border/50">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Payments & Actions (Non-printable) */}
        <div className="space-y-6 print:hidden">
          
          {/* Payment Form (Only if remaining balance > 0) */}
          <PaymentForm invoiceId={invoice.id} remainingAmount={Number(invoice.remainingAmount)} />
          
          {/* Payment History */}
          {invoice.payments.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-semibold text-sm mb-4">سجل المدفوعات</h2>
              <div className="space-y-3">
                {invoice.payments.map((payment) => (
                  <div key={payment.id} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg border border-border/50">
                    <div>
                      <p className="font-semibold text-green-600">{formatCurrency(payment.amount.toString())}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(payment.paidAt)}</p>
                    </div>
                    {payment.referenceNo && (
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground max-w-[100px] truncate">
                        {payment.referenceNo}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fully Paid Indicator */}
          {Number(invoice.remainingAmount) === 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 rounded-xl p-5 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="font-semibold text-green-700 dark:text-green-400">هذه الفاتورة مسددة بالكامل</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

