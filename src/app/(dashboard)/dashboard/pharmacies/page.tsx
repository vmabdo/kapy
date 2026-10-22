import type { Metadata } from "next";
import Link from "next/link";
import { getPharmacies, getPharmacyStats } from "@/queries/pharmacies";
import { Building2, Plus, Target } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { PharmaciesList } from "@/components/pharmacies/pharmacies-list";

export const metadata: Metadata = { title: "إدارة الصيدليات والعملاء" };
export const dynamic = "force-dynamic";

export default async function PharmaciesPage() {
  const [pharmacies, stats] = await Promise.all([
    getPharmacies(),
    getPharmacyStats(),
  ]);

  const pharmacyRows = pharmacies.map((pharmacy) => ({
    id: pharmacy.id,
    name: pharmacy.name,
    address: pharmacy.address,
    currentBalance: Number(pharmacy.currentBalance),
    creditLimit: pharmacy.creditLimit === null ? null : Number(pharmacy.creditLimit),
    governorateName: pharmacy.governorate.name,
    assignedRepName: pharmacy.assignedReps[0]?.salesRep.name ?? null,
    invoiceCount: pharmacy._count.invoices,
  }));

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
        <Link prefetch={false}
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
                    <Link prefetch={false} key={tp.id} href={`/dashboard/pharmacies/${tp.pharmacyId}`} className="flex flex-col gap-1 hover:opacity-80 transition-opacity">
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
      <PharmaciesList pharmacies={pharmacyRows} />
    </div>
  );
}
