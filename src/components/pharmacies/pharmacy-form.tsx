"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createPharmacy, updatePharmacy } from "@/actions/pharmacies";
import { Building2, Loader2 } from "lucide-react";

interface PharmacyData {
  id: string;
  name: string;
  licenseNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  governorateId: string;
  creditLimit?: number | null;
  salesTarget?: number | null;
  isActive: boolean;
}

interface Props {
  governorates: { id: string; name: string }[];
  salesReps: { id: string; name: string }[];
  pharmacy?: PharmacyData; // when provided, form is in edit mode
}

const CreateSchema = z.object({
  name: z.string().min(2, "اسم الصيدلية مطلوب"),
  licenseNumber: z.string().optional(),
  taxNumber: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  governorateId: z.string().min(1, "اختر المحافظة"),
  assignedRepId: z.string().optional(),
  creditLimit: z.coerce.number().min(0).default(50000),
  targetAmount: z.coerce.number().min(0).default(10000),
});

const UpdateSchema = z.object({
  name: z.string().min(2, "اسم الصيدلية مطلوب"),
  licenseNumber: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  governorateId: z.string().min(1, "اختر المحافظة"),
  creditLimit: z.coerce.number().min(0).default(50000),
  salesTarget: z.coerce.number().min(0).default(10000),
  isActive: z.boolean().default(true),
});

type CreateFormData = z.input<typeof CreateSchema>;
type UpdateFormData = z.input<typeof UpdateSchema>;

export function PharmacyForm({ governorates, salesReps, pharmacy }: Props) {
  const router = useRouter();
  const isEditMode = !!pharmacy;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const inputClass = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  // ── Create mode ────────────────────────────────────────────
  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(CreateSchema),
    defaultValues: { creditLimit: 50000, targetAmount: 10000 },
  });

  // ── Edit mode ──────────────────────────────────────────────
  const editForm = useForm<UpdateFormData>({
    resolver: zodResolver(UpdateSchema),
    defaultValues: pharmacy
      ? {
          name: pharmacy.name,
          licenseNumber: pharmacy.licenseNumber ?? "",
          address: pharmacy.address ?? "",
          phone: pharmacy.phone ?? "",
          governorateId: pharmacy.governorateId,
          creditLimit: pharmacy.creditLimit ? Number(pharmacy.creditLimit) : 50000,
          salesTarget: pharmacy.salesTarget ? Number(pharmacy.salesTarget) : 10000,
          isActive: pharmacy.isActive,
        }
      : {},
  });

  const onCreateSubmit = (data: CreateFormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createPharmacy(data as any);
      if (result.success) {
        router.push("/dashboard/pharmacies");
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  const onEditSubmit = (data: UpdateFormData) => {
    if (!pharmacy) return;
    setServerError(null);
    startTransition(async () => {
      const result = await updatePharmacy(pharmacy.id, data as any);
      if (result.success) {
        router.push(`/dashboard/pharmacies/${pharmacy.id}`);
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  // ── Edit Mode Render ───────────────────────────────────────
  if (isEditMode && pharmacy) {
    const { register, handleSubmit, formState: { errors } } = editForm;
    return (
      <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-6" dir="rtl">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            البيانات الأساسية للصيدلية
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">اسم الصيدلية</label>
              <input {...register("name")} className={inputClass} />
              {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">المحافظة</label>
              <select {...register("governorateId")} className={inputClass}>
                <option value="">اختر المحافظة</option>
                {governorates.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {errors.governorateId && <p className="text-red-500 text-xs">{errors.governorateId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">رقم الهاتف</label>
              <input {...register("phone")} className={inputClass} />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">العنوان التفصيلي</label>
              <input {...register("address")} className={inputClass} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">رقم الترخيص</label>
              <input {...register("licenseNumber")} className={inputClass} />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="isActive" {...register("isActive")} className="w-4 h-4 rounded border-border text-primary" />
              <label htmlFor="isActive" className="text-sm font-medium cursor-pointer">الصيدلية نشطة</label>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">البيانات المالية والأهداف</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الحد الائتماني (ج.م)</label>
              <input type="number" {...register("creditLimit")} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الهدف الشهري (ج.م)</label>
              <input type="number" {...register("salesTarget")} className={inputClass} />
            </div>
          </div>
        </div>

        {serverError && (
          <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">{serverError}</div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => router.back()} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
            حفظ التعديلات
          </button>
        </div>
      </form>
    );
  }

  // ── Create Mode Render ─────────────────────────────────────
  const { register, handleSubmit, formState: { errors } } = createForm;
  return (
    <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-6" dir="rtl">
      {/* Basic Info */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          البيانات الأساسية للصيدلية
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium">اسم الصيدلية</label>
            <input {...register("name")} placeholder="مثال: صيدلية الشفاء" className={inputClass} />
            {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">المحافظة</label>
            <select {...register("governorateId")} className={inputClass}>
              <option value="">اختر المحافظة</option>
              {governorates.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {errors.governorateId && <p className="text-red-500 text-xs">{errors.governorateId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">العنوان التفصيلي</label>
            <input {...register("address")} placeholder="الشارع، الحي..." className={inputClass} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">رقم الهاتف</label>
            <input {...register("phone")} placeholder="01..." className={inputClass} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">المندوب المسؤول (اختياري)</label>
            <select {...register("assignedRepId")} className={inputClass}>
              <option value="">لا يوجد مندوب محدد</option>
              {salesReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Financial Info */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4">البيانات المالية والأهداف</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الحد الائتماني (أقصى مديونية مسموحة بالجنيه)</label>
            <input type="number" {...register("creditLimit")} className={inputClass} />
            {errors.creditLimit && <p className="text-red-500 text-xs">{errors.creditLimit.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">الهدف الشهري المبدئي (ج.م)</label>
            <input type="number" {...register("targetAmount")} className={inputClass} />
            {errors.targetAmount && <p className="text-red-500 text-xs">{errors.targetAmount.message}</p>}
          </div>
        </div>
      </div>

      {/* Legal Info */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4">البيانات القانونية (اختياري)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">رقم الترخيص</label>
            <input {...register("licenseNumber")} className={inputClass} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">الرقم الضريبي</label>
            <input {...register("taxNumber")} className={inputClass} />
          </div>
        </div>
      </div>

      {serverError && (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">{serverError}</div>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => router.back()} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
          حفظ الصيدلية
        </button>
      </div>
    </form>
  );
}
