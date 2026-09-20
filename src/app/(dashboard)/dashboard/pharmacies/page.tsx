import type { Metadata } from "next";
import Link from "next/link";
import { getPharmacies, getPharmacyStats } from "@/queries/pharmacies";
import { Building2, Plus, Target, User } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { PharmacyRowActions } from "@/components/pharmacies/pharmacy-row-actions";

export const metadata: Metadata = { title: "إدارة الصيدليات والعملاء" };
export const dynamic = "force-dynamic";

export default async function PharmaciesPage() {
  const [pharmacies, stats] = await Promise.all([
    getPharmacies(),
    getPharmacyStats(),
  ]);

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            إدارة الصيدليات والعملاء
          </h1>
          <p className="page-subtitle">قاعدة بيانات الصيدليات، الديون، ومتابعة الأهداف البيعية</p>
        </div>
        <Link
          href="/dashboard/pharmacies/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          صيدلية جديدة
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">إجمالي الصيدليات</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{stats.totalPharmacies}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">إجمالي الديون (أرصدة الصيدليات)</p>
          <p className="text-2xl font-bold mt-1 text-amber-500">
            {formatCurrency(stats.totalCredit.toString())}
          </p>
        </div>
        <div className="col-span-1 lg:col-span-2 bg-gradient-to-br from-primary/10 to-cyan-500/10 border border-primary/20 rounded-xl p-5 flex items-center">
          <div className="flex-1">
            <h3 className="font-semibold text-primary flex items-center gap-2">
              <Target className="w-4 h-4" />
              نجوم الشهر (أعلى تحقيق للهدف)
            </h3>
            <div className="flex flex-wrap gap-4 mt-3">
              {stats.topPerformers.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد بيانات أهداف مسجلة لهذا الشهر</p>
              ) : (
                stats.topPerformers.slice(0, 3).map((tp: any) => {
                  const percentage = Math.min(100, Math.round((Number(tp.achieved) / Number(tp.target)) * 100));
                  return (
                    <Link key={tp.id} href={`/dashboard/pharmacies/${tp.pharmacyId}`} className="flex flex-col gap-1 hover:opacity-80 transition-opacity">
                      <p className="text-xs font-bold">{tp.pharmacy.name}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-background rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full", percentage >= 100 ? "bg-green-500" : "bg-primary")} style={{ width: `${percentage}%` }} />
                        </div>
                        <span className="text-[10px] font-mono">{percentage}%</span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pharmacies List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <h2 className="font-semibold text-sm">دليل الصيدليات</h2>
        </div>

        {pharmacies.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">لا توجد صيدليات مسجلة بعد</p>
            <Link href="/dashboard/pharmacies/new" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" /> سجل أول صيدلية
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">اسم الصيدلية</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">المحافظة</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">المندوب المسؤول</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">الرصيد المستحق</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">حالة الحساب</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pharmacies.map((pharmacy: any) => {
                  const creditRatio = pharmacy.creditLimit ? Number(pharmacy.currentBalance) / Number(pharmacy.creditLimit) : 0;
                  const isCritical = creditRatio >= 0.9; // 90% of credit limit

                  return (
                    <tr key={pharmacy.id} className="data-table-row">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/pharmacies/${pharmacy.id}`} className="font-medium text-primary hover:underline">
                          {pharmacy.name}
                        </Link>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{pharmacy._count.invoices} فواتير</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{pharmacy.governorate.name}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          {pharmacy.assignedReps.length > 0 ? pharmacy.assignedReps[0].salesRep.name : "غير معين"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">
                        {formatCurrency(pharmacy.currentBalance.toString())}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-full max-w-[80px] h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", isCritical ? "bg-red-500" : "bg-primary")}
                              style={{ width: `${Math.min(100, creditRatio * 100)}%` }}
                            />
                          </div>
                          <span className={cn("text-[10px]", isCritical ? "text-red-500 font-medium" : "text-muted-foreground")}>
                            {Math.round(creditRatio * 100)}% من الحد
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <PharmacyRowActions
                          pharmacyId={pharmacy.id}
                          pharmacyName={pharmacy.name}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
