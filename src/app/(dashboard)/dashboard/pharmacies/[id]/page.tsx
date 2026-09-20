import { notFound } from "next/navigation";
import Link from "next/link";
import { getPharmacyById } from "@/queries/pharmacies";
import { Building2, ArrowRight, FileText, Target, Wallet, User, Phone, MapPin } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { Metadata } from "next";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pharmacy = await getPharmacyById(params.id);
  return { title: pharmacy ? `صيدلية: ${pharmacy.name}` : "تفاصيل الصيدلية" };
}

export const dynamic = "force-dynamic";

export default async function PharmacyDetailPage({ params }: Props) {
  const pharmacy = await getPharmacyById(params.id);
  if (!pharmacy) notFound();

  const creditRatio = pharmacy.creditLimit ? Number(pharmacy.currentBalance) / Number(pharmacy.creditLimit) : 0;
  const isCreditCritical = creditRatio >= 0.9;

  const currentTarget = pharmacy.targetAttainments[0];
  const targetRatio = currentTarget && Number(currentTarget.target) > 0 ? Number(currentTarget.achieved) / Number(currentTarget.target) : 0;
  const targetPercentage = Math.min(100, Math.round(targetRatio * 100));

  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/pharmacies" className="hover:text-foreground transition-colors">الصيدليات والعملاء</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">{pharmacy.name}</span>
      </nav>

      <div className="page-header mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="page-title">{pharmacy.name}</h1>
            <p className="page-subtitle flex items-center gap-2">
              <span className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full",
                pharmacy.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
              )}>
                {pharmacy.isActive ? "نشط" : "غير نشط"}
              </span>
              <span>·</span>
              <span>{pharmacy.governorate.name}</span>
            </p>
          </div>
        </div>
        <Link
          href={`/dashboard/sales/new?pharmacyId=${pharmacy.id}`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <FileText className="w-4 h-4" />
          إصدار فاتورة
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Col */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Target & Credit Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Credit Progress */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">حالة المديونية</h3>
                </div>
              </div>
              <p className="text-2xl font-bold mb-1">{formatCurrency(pharmacy.currentBalance.toString())}</p>
              <p className="text-xs text-muted-foreground mb-4">
                من أصل {pharmacy.creditLimit ? formatCurrency(pharmacy.creditLimit.toString()) : "غير محدد"} (الحد الائتماني)
              </p>
              
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", isCreditCritical ? "bg-red-500" : "bg-primary")}
                  style={{ width: `${Math.min(100, creditRatio * 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[10px] font-medium">
                <span className="text-muted-foreground">0</span>
                <span className={cn(isCreditCritical ? "text-red-500 font-bold" : "text-muted-foreground")}>
                  {Math.round(creditRatio * 100)}% مستخدم
                </span>
              </div>
              
              {isCreditCritical && (
                <p className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded-lg border border-red-100 dark:border-red-900/20">
                  ⚠️ تنبيه: الصيدلية قريبة من تجاوز الحد الائتماني المسموح به. يرجى تحصيل الدفعات قبل إصدار فواتير آجلة جديدة.
                </p>
              )}
            </div>

            {/* Target Progress */}
            <div className="bg-gradient-to-br from-primary/5 to-cyan-500/5 border border-primary/20 rounded-xl p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">الهدف الشهري (الحالي)</h3>
                </div>
              </div>
              
              {currentTarget ? (
                <>
                  <p className="text-2xl font-bold mb-1 text-primary">{formatCurrency(currentTarget.achieved.toString())}</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    المستهدف: {formatCurrency(currentTarget.target.toString())}
                  </p>
                  
                  <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", targetPercentage >= 100 ? "bg-green-500" : "bg-primary")}
                      style={{ width: `${targetPercentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] font-medium">
                    <span className="text-muted-foreground">0%</span>
                    <span className={cn(targetPercentage >= 100 ? "text-green-600 font-bold" : "text-primary")}>
                      {targetPercentage}% {targetPercentage >= 100 && "🎉"}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">لا يوجد هدف مسجل لهذا الشهر</p>
              )}
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                الفواتير الأخيرة
              </h2>
            </div>
            {pharmacy.invoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد فواتير لهذه الصيدلية</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">الرقم</th>
                    <th className="text-center px-4 py-2 font-medium text-muted-foreground">النوع</th>
                    <th className="text-center px-4 py-2 font-medium text-muted-foreground">الإجمالي</th>
                    <th className="text-center px-4 py-2 font-medium text-muted-foreground">المتبقي</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pharmacy.invoices.map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/sales/${inv.id}`} className="font-medium font-mono text-primary hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded border", inv.type === "CASH" ? "text-green-700 bg-green-50 border-green-200" : "text-blue-700 bg-blue-50 border-blue-200")}>
                          {inv.type === "CASH" ? "نقدي" : "آجل"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">
                        {formatCurrency(inv.total.toString())}
                      </td>
                      <td className="px-4 py-3 text-center text-amber-600 font-medium">
                        {Number(inv.remainingAmount) > 0 ? formatCurrency(inv.remainingAmount.toString()) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(inv.invoiceDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="p-3 border-t border-border/60 bg-muted/20 text-center">
              <Link href="/dashboard/sales" className="text-xs text-primary hover:underline font-medium">
                عرض في سجل المبيعات
              </Link>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm mb-4">بيانات التواصل والتفاصيل</h2>
            
            <div className="space-y-4">
              {pharmacy.assignedReps.length > 0 && (
                <div className="flex gap-3">
                  <User className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">المندوب المسؤول</p>
                    <p className="text-sm font-medium">{pharmacy.assignedReps[0].salesRep.name}</p>
                  </div>
                </div>
              )}
              
              {pharmacy.phone && (
                <div className="flex gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">رقم الهاتف</p>
                    <p className="text-sm font-medium font-mono" dir="ltr">{pharmacy.phone}</p>
                  </div>
                </div>
              )}
              
              {pharmacy.address && (
                <div className="flex gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">العنوان التفصيلي</p>
                    <p className="text-sm font-medium">{pharmacy.address}</p>
                  </div>
                </div>
              )}
              
              {pharmacy.licenseNumber && (
                <div className="pt-4 border-t border-border/60 space-y-3">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">البيانات القانونية</p>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">رقم الترخيص:</span>
                    <span className="font-mono">{pharmacy.licenseNumber}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
