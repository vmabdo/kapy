import type { Metadata } from "next";
import { getCompanies, getCompanyStats } from "@/queries/companies";
import { getAllGovernorates } from "@/queries/inventory";
import { getAllSalesReps } from "@/queries/sales";
import { Building2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CompaniesList } from "@/components/companies/companies-list";
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

  const companyRows = companies.map((company) => ({
    id: company.id,
    name: company.name,
    address: company.address,
    currentBalance: Number(company.currentBalance),
    creditLimit: company.creditLimit === null ? null : Number(company.creditLimit),
    governorateName: company.governorate.name,
    assignedRepName: company.assignedReps[0]?.salesRep.name ?? null,
    invoiceCount: company._count.invoices,
  }));

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
      <CompaniesList companies={companyRows} />
    </div>
  );
}
