import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllGovernorates } from "@/queries/inventory";
import { getAllSalesReps } from "@/queries/sales";
import { getPharmacyById } from "@/queries/pharmacies";
import { PharmacyForm } from "@/components/pharmacies/pharmacy-form";
import { Building2, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "تعديل بيانات الصيدلية" };
export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export default async function EditPharmacyPage({ params }: Props) {
  const [pharmacy, governorates, salesReps] = await Promise.all([
    getPharmacyById(params.id),
    getAllGovernorates(),
    getAllSalesReps(),
  ]);

  if (!pharmacy) notFound();

  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/pharmacies" className="hover:text-foreground transition-colors">الصيدليات</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <Link href={`/dashboard/pharmacies/${pharmacy.id}`} className="hover:text-foreground transition-colors">{pharmacy.name}</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">تعديل</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            تعديل بيانات الصيدلية
          </h1>
          <p className="page-subtitle">{pharmacy.name}</p>
        </div>
      </div>

      <PharmacyForm
        governorates={governorates}
        salesReps={salesReps.map(r => ({ id: r.id, name: r.name }))}
        pharmacy={{
          id: pharmacy.id,
          name: pharmacy.name,
          licenseNumber: pharmacy.licenseNumber,
          address: pharmacy.address,
          phone: pharmacy.phone,
          governorateId: pharmacy.governorateId,
          creditLimit: pharmacy.creditLimit ? Number(pharmacy.creditLimit) : null,
          salesTarget: pharmacy.salesTarget ? Number(pharmacy.salesTarget) : null,
          isActive: pharmacy.isActive,
        }}
      />
    </div>
  );
}
