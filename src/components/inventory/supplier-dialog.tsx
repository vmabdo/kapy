"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createSupplier } from "@/actions/inventory";
import { Truck, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const Schema = z.object({
  name: z.string().min(2, "اسم المورد مطلوب"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("البريد غير صالح").optional().or(z.literal("")),
  address: z.string().optional(),
});

type FormData = z.input<typeof Schema>;

interface SupplierDialogProps {
  onSuccess?: () => void;
}

export function SupplierDialog({ onSuccess }: SupplierDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(Schema) });

  const inputClass = cn(
    "w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm",
    "focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all"
  );

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createSupplier(data as any);
      if (result.success) {
        setSuccessMsg(result.message ?? "تم إضافة المورد بنجاح");
        reset();
        setTimeout(() => {
          setOpen(false);
          setSuccessMsg(null);
          onSuccess?.();
        }, 1200);
      } else {
        setServerError(result.error);
      }
    });
  };

  return (
    <>
      {/* Trigger button */}
      <button
        id="add-supplier-btn"
        onClick={() => { setOpen(true); setServerError(null); setSuccessMsg(null); }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
      >
        <Truck className="w-4 h-4 text-muted-foreground" />
        إضافة مورد
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md animate-scale-in"
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                إضافة مورد / مصنع جديد
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">اسم المورد / المصنع *</label>
                <input
                  {...register("name")}
                  placeholder="مثال: مصنع الدلتا للأدوية"
                  className={inputClass}
                />
                {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">مسؤول التواصل</label>
                  <input {...register("contactPerson")} placeholder="اسم المسؤول" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">رقم الهاتف</label>
                  <input {...register("phone")} placeholder="01xxxxxxxxx" className={inputClass} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">البريد الإلكتروني</label>
                <input {...register("email")} type="email" placeholder="supplier@example.com" className={inputClass} />
                {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">العنوان</label>
                <input {...register("address")} placeholder="عنوان الشركة / المصنع" className={inputClass} />
              </div>

              {serverError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm">
                  {serverError}
                </div>
              )}
              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 text-sm">
                  ✓ {successMsg}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  id="supplier-form-submit-btn"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  حفظ المورد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
