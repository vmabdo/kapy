"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createSalesRep } from "@/actions/reps";
import { Users, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const Schema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  phone: z.string().optional(),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  baseSalary: z.coerce.number().min(0).default(0),
  monthlyTarget: z.coerce.number().min(0).default(0),
  governorateId: z.string().optional(),
});

type FormData = z.input<typeof Schema>;

interface Props {
  governorates: { id: string; name: string }[];
}

export function AddRepDialog({ governorates }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { baseSalary: 0, monthlyTarget: 0 },
  });

  const inputClass = cn(
    "w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm",
    "focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all"
  );

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createSalesRep(data as any);
      if (result.success) {
        setSuccessMsg(result.message ?? "تم إضافة المندوب بنجاح");
        reset();
        setTimeout(() => {
          setOpen(false);
          setSuccessMsg(null);
          router.refresh();
        }, 1200);
      } else {
        setServerError(result.error);
      }
    });
  };

  return (
    <>
      <button
        id="add-rep-btn"
        onClick={() => { setOpen(true); setServerError(null); setSuccessMsg(null); }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" />
        إضافة مندوب
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 sticky top-0 bg-card z-10">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                إضافة مندوب مبيعات جديد
              </h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              {/* Personal Info */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">البيانات الشخصية</p>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">الاسم الكامل *</label>
                  <input {...register("name")} placeholder="اسم المندوب" className={inputClass} />
                  {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">رقم الهاتف</label>
                    <input {...register("phone")} placeholder="01xxxxxxxxx" className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">المحافظة</label>
                    <select {...register("governorateId")} className={inputClass}>
                      <option value="">اختر المحافظة</option>
                      {governorates.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Account Info */}
              <div className="space-y-3 pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">بيانات الحساب</p>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">البريد الإلكتروني (للدخول) *</label>
                  <input {...register("email")} type="email" placeholder="rep@kapypharma.com" className={inputClass} />
                  {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">كلمة المرور *</label>
                  <input {...register("password")} type="password" placeholder="كلمة مرور قوية" className={inputClass} />
                  {errors.password && <p className="text-red-500 text-xs">{errors.password.message}</p>}
                </div>
              </div>

              {/* Financial Info */}
              <div className="space-y-3 pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">البيانات المالية</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">الراتب الأساسي (ج.م)</label>
                    <input type="number" step="0.01" min="0" {...register("baseSalary")} placeholder="0.00" className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">الهدف الشهري (ج.م)</label>
                    <input type="number" step="0.01" min="0" {...register("monthlyTarget")} placeholder="0.00" className={inputClass} />
                  </div>
                </div>
              </div>

              {serverError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 text-red-700 text-sm">
                  {serverError}
                </div>
              )}
              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 text-emerald-700 text-sm">
                  ✓ {successMsg}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  id="add-rep-submit-btn"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  إضافة المندوب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
