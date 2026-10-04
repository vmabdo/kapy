"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createSalesRep } from "@/actions/reps";
import { Users, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const Schema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  phone: z.string().optional(),
  /// Optional — if empty, no system login account will be created
  email: z.string().email("البريد الإلكتروني غير صالح").optional().or(z.literal("")),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل").optional().or(z.literal("")),
  baseSalary: z.coerce.number().min(0).default(0),
  governorateId: z.string().optional(),
}).refine(
  (data) => {
    if (data.email && data.email.trim().length > 0) {
      return data.password && data.password.trim().length >= 6;
    }
    return true;
  },
  { message: "كلمة المرور مطلوبة عند تحديد البريد الإلكتروني", path: ["password"] }
);

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
    defaultValues: { baseSalary: 0 },
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
        toast.success(result.message ?? "تم إضافة المندوب بنجاح");
        reset();
        setTimeout(() => {
          setOpen(false);
          router.refresh();
        }, 300);
      } else {
        toast.error("حدث خطأ", { description: result.error });
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
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Modal Content */}
          <div 
            className="fixed z-50 top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] max-w-xl w-[95vw] max-h-[95vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-xl animate-scale-in" 
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-card z-10">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                إضافة مندوب مبيعات جديد
              </h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-3">
              {/* Personal Info */}
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">الاسم الكامل *</label>
                  <input {...register("name")} placeholder="اسم المندوب" className={inputClass} />
                  {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">رقم الهاتف</label>
                    <input {...register("phone")} placeholder="01xxxxxxxxx" className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">المحافظة</label>
                    <select {...register("governorateId")} className={inputClass}>
                      <option value="">اختر المحافظة</option>
                      {governorates.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Account Info — Optional */}
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">بيانات الدخول (اختياري)</p>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">البريد الإلكتروني</label>
                    <input {...register("email")} type="email" placeholder="rep@kapy.com" className={inputClass} />
                    {errors.email && <p className="text-red-500 text-[10px]">{errors.email.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">كلمة المرور</label>
                    <input {...register("password")} type="password" placeholder="6 أحرف على الأقل" className={inputClass} />
                    {errors.password && <p className="text-red-500 text-[10px]">{errors.password.message}</p>}
                  </div>
                </div>
              </div>

              {/* Financial Info */}
              <div className="space-y-2 pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">البيانات المالية</p>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium">الراتب الأساسي (ج.م)</label>
                  <input type="number" step="0.01" min="0" {...register("baseSalary")} placeholder="0.00" className={inputClass} />
                </div>
              </div>

              {serverError && (
                <div className="p-2 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 text-red-700 text-xs">
                  {serverError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  id="add-rep-submit-btn"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  إضافة
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
