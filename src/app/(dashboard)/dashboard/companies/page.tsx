import type { Metadata } from "next";
import Link from "next/link";
import { getCompanies, getCompanyStats } from "@/queries/companies";
import { getAllGovernorates } from "@/queries/inventory";
import { getAllSalesReps } from "@/queries/sales";
import { Building2, User } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { CompanyRowActions } from "@/components/companies/company-row-actions";
import { CompanyFormModal } from "@/components/companies/company-form-modal";

export const metadata: Metadata = { title: "إدارة الشركات والمخازن" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const [companies, stats, governorates, salesReps] = await Promise.all([
    getCompanies(),
    getCompanyStats(),
    getAllGovernorates(),
    getAllSalesReps(),
  ]);

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            إدارة الشركات والمخازن (B2B)
          </h1>
          <p className="page-subtitle">قاعدة بيانات الشركات والمخازن الخارجية، وحساباتهم</p>
        </div>
        <CompanyFormModal
          governorates={governorates}
          salesReps={salesReps.map(r => ({ id: r.id, name: r.name }))}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">إجمالي الشركات / المخازن</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{stats.totalCompanies}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">إجمالي المستحقات (أرصدة العملاء)</p>
          <p className="text-2xl font-bold mt-1 text-amber-500">
            {formatCurrency(stats.totalCredit.toString())}
          </p>
        </div>
      </div>

      {/* Companies List */}
      <div className="bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <h2 className="font-semibold text-sm">دليل الشركات والمخازن</h2>
        </div>

        {companies.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">لا توجد شركات مسجلة بعد</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">اسم الشركة</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">المحافظة</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">المندوب المسؤول</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">الرصيد المستحق</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">حالة الحساب</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company: any) => {
                  const creditRatio = company.creditLimit ? Number(company.currentBalance) / Number(company.creditLimit) : 0;
                  const isCritical = creditRatio >= 0.9; // 90% of credit limit

                  return (
                    <tr key={company.id} className="data-table-row">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/companies/${company.id}`} className="font-medium text-primary hover:underline">
                          {company.name}
                        </Link>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{company._count.invoices} فواتير</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{company.governorate.name}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          {company.assignedReps.length > 0 ? company.assignedReps[0].salesRep.name : "غير معين"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">
                        {formatCurrency(company.currentBalance.toString())}
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
                        <CompanyRowActions
                          companyId={company.id}
                          companyName={company.name}
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
