import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAllGovernorates } from "@/queries/inventory";
import { getAllSalesReps } from "@/queries/sales";
import { PharmacyForm } from "@/components/pharmacies/pharmacy-form";
import { Building2, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "إضافة صيدلية جديدة" };
export const dynamic = "force-dynamic";

export default async function NewPharmacyPage() {
  const [governorates, salesReps] = await Promise.all([
    getAllGovernorates(),
    getAllSalesReps(),
  ]);

  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/pharmacies" className="hover:text-foreground transition-colors">الصيدليات والعملاء</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">صيدلية جديدة</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            تسجيل صيدلية جديدة
          </h1>
          <p className="page-subtitle">أضف عميلاً جديداً إلى قاعدة بيانات كابي فارما</p>
        </div>
      </div>

      <PharmacyForm
        governorates={governorates}
        salesReps={salesReps.map(r => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
