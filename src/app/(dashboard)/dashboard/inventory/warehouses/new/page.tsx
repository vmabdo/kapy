import type { Metadata } from "next";
import { getAllGovernorates } from "@/queries/inventory";
import { WarehouseForm } from "@/components/inventory/warehouse-form";
import Link from "next/link";
import { ArrowRight, Warehouse } from "lucide-react";

export const metadata: Metadata = { title: "إضافة مخزن جديد" };

export default async function NewWarehousePage() {
  const governorates = await getAllGovernorates();

  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/inventory" className="hover:text-foreground">المخازن</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">مخزن جديد</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-primary" />
            إضافة مخزن جديد
          </h1>
          <p className="page-subtitle">أضف مخزناً فرعياً جديداً إلى النظام لخدمة محافظة جديدة</p>
        </div>
      </div>

      <WarehouseForm governorates={governorates} />
    </div>
  );
}
