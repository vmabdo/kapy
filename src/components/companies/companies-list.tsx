"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Search, User } from "lucide-react";
import { CompanyRowActions } from "@/components/companies/company-row-actions";
import { SearchInput } from "@/components/ui/search-input";
import { normalizeSearchText } from "@/lib/search";
import { cn, formatCurrency } from "@/lib/utils";

export interface CompanyListItem {
  id: string;
  name: string;
  address: string | null;
  currentBalance: number;
  creditLimit: number | null;
  governorateName: string;
  assignedRepName: string | null;
  invoiceCount: number;
}

interface Props {
  companies: CompanyListItem[];
}

export function CompaniesList({ companies }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedQuery = normalizeSearchText(searchTerm);

  // Normalize each record once per dataset, not on every keystroke.
  const searchableCompanies = useMemo(
    () =>
      companies.map((company) => ({
        company,
        haystack: normalizeSearchText(
          `${company.name} ${company.address ?? ""} ${company.governorateName}`
        ),
      })),
    [companies]
  );

  const filteredCompanies = useMemo(() => {
    if (!normalizedQuery) return companies;

    return searchableCompanies
      .filter(({ haystack }) => haystack.includes(normalizedQuery))
      .map(({ company }) => company);
  }, [companies, searchableCompanies, normalizedQuery]);

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">دليل الشركات والمخازن</h2>
          <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {filteredCompanies.length} من {companies.length}
          </span>
        </div>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="بحث عن شركة أو مخزن بالاسم أو العنوان أو المحافظة..."
          ariaLabel="بحث في الشركات والمخازن"
          className="sm:max-w-sm"
        />
      </div>

      {companies.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium">لا توجد شركات مسجلة بعد</p>
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-25" />
          <p className="font-medium">لا توجد نتائج مطابقة للبحث</p>
          <p className="text-xs mt-1">جرّب كلمة بحث أخرى أو امسح البحث لعرض كل الشركات.</p>
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            مسح البحث
          </button>
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
              {filteredCompanies.map((company) => {
                const creditRatio = company.creditLimit
                  ? company.currentBalance / company.creditLimit
                  : 0;
                const isCritical = creditRatio >= 0.9; // 90% of credit limit

                return (
                  <tr key={company.id} className="data-table-row">
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/companies/${company.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {company.name}
                      </Link>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {company.invoiceCount} فواتير
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{company.governorateName}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        {company.assignedRepName ?? "غير معين"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-foreground">
                      {formatCurrency(company.currentBalance)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-full max-w-[80px] h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isCritical ? "bg-red-500" : "bg-primary"
                            )}
                            style={{ width: `${Math.min(100, creditRatio * 100)}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-[10px]",
                            isCritical ? "text-red-500 font-medium" : "text-muted-foreground"
                          )}
                        >
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
  );
}
