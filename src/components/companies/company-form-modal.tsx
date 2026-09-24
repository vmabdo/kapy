"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createCompany } from "@/actions/companies";
import { Building2, Loader2, X, Plus } from "lucide-react";

const CreateSchema = z.object({
  name: z.string().min(2, "اسم الشركة مطلوب"),
  licenseNumber: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  governorateId: z.string().min(1, "اختر المحافظة"),
  assignedRepId: z.string().optional(),
  creditLimit: z.coerce.number().min(0).default(100000),
  targetAmount: z.coerce.number().min(0).default(0),
});

type CreateFormData = z.input<typeof CreateSchema>;

interface Props {
  governorates: { id: string; name: string }[];
  salesReps: { id: string; name: string }[];
}

export function CompanyFormModal({ governorates, salesReps }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const inputClass = "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  const form = useForm<CreateFormData>({
    resolver: zodResolver(CreateSchema),
    defaultValues: { creditLimit: 100000, targetAmount: 0 },
  });

  const onSubmit = (data: CreateFormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createCompany(data as any);
      if (result.success) {
        setIsOpen(false);
        form.reset();
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
        شركة جديدة
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm" 
            onClick={() => !isPending && setIsOpen(false)}
          />
          
          {/* Modal Content */}
          <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-xl p-6" dir="rtl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                إضافة شركة / مخزن خارجي
              </h2>
              <button 
                onClick={() => !isPending && setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {serverError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
                  {serverError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">اسم الشركة/المخزن *</label>
                  <input {...form.register("name")} className={inputClass} placeholder="مثال: شركة كذا للأدوية" />
                  {form.formState.errors.name && (
                    <p className="text-[10px] text-red-500">{form.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">رقم الترخيص / السجل التجاري</label>
                  <input {...form.register("licenseNumber")} className={inputClass} placeholder="اختياري" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">العنوان</label>
                  <input {...form.register("address")} className={inputClass} placeholder="عنوان الشركة" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">المحافظة *</label>
                  <select {...form.register("governorateId")} className={inputClass}>
                    <option value="">اختر المحافظة...</option>
                    {governorates.map((gov) => (
                      <option key={gov.id} value={gov.id}>{gov.name}</option>
                    ))}
                  </select>
                  {form.formState.errors.governorateId && (
                    <p className="text-[10px] text-red-500">{form.formState.errors.governorateId.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">رقم الهاتف</label>
                  <input {...form.register("phone")} className={inputClass} placeholder="اختياري" />
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">المندوب المسؤول</label>
                  <select {...form.register("assignedRepId")} className={inputClass}>
                    <option value="">بدون مندوب معين...</option>
                    {salesReps.map((rep) => (
                      <option key={rep.id} value={rep.id}>{rep.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">الحد الائتماني (ج.م)</label>
                  <input type="number" {...form.register("creditLimit")} className={inputClass} />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ الشركة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
