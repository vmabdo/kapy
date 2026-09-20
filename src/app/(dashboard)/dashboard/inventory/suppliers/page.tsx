import type { Metadata } from "next";
import Link from "next/link";
import { getAllSuppliersWithCount } from "@/queries/inventory";
import { Truck, Plus, ArrowRight, Package, ArrowLeftRight } from "lucide-react";
import { SupplierDialog } from "@/components/inventory/supplier-dialog";
import { SupplierRowActions } from "@/components/inventory/supplier-row-actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "الموردون والمصانع" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await getAllSuppliersWithCount();

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/inventory" className="hover:text-foreground transition-colors">المخازن</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">الموردون</span>
      </nav>

      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            الموردون والمصانع
          </h1>
          <p className="page-subtitle">{suppliers.length} مورد مسجل في النظام</p>
        </div>
        <SupplierDialog />
      </div>

      {/* Suppliers Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
        {suppliers.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">لا يوجد موردون مسجلون بعد</p>
            <p className="text-sm mt-1">أضف أول مورد من الزر أعلاه</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">اسم المورد / المصنع</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">مسؤول التواصل</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">الهاتف</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                    <span className="flex items-center justify-center gap-1">
                      <Package className="w-3.5 h-3.5" /> المنتجات
                    </span>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                    <span className="flex items-center justify-center gap-1">
                      <ArrowLeftRight className="w-3.5 h-3.5" /> حركات المخزون
                    </span>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="data-table-row">
                    <td className="px-5 py-3">
                      <div>
                        <p className="font-medium text-foreground">{supplier.name}</p>
                        {supplier.email && (
                          <p className="text-xs text-muted-foreground">{supplier.email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {supplier.contactPerson || <span className="text-border">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {supplier.phone || <span className="text-border">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-foreground">{supplier._count.products}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-foreground">{supplier._count.stockMovements}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "text-[11px] font-medium px-2 py-0.5 rounded-full",
                        supplier.isActive
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {supplier.isActive ? "نشط" : "غير نشط"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SupplierRowActions
                        supplier={{
                          id: supplier.id,
                          name: supplier.name,
                          contactPerson: supplier.contactPerson ?? undefined,
                          phone: supplier.phone ?? undefined,
                          email: supplier.email ?? undefined,
                          address: supplier.address ?? undefined,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
