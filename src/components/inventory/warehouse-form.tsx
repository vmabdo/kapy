"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { WarehouseType } from "@prisma/client";
import { createWarehouse } from "@/actions/inventory";
import { Warehouse, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  governorates: { id: string; name: string }[];
}

const Schema = z.object({
  name: z.string().min(2, "اسم المخزن مطلوب"),
  type: z.nativeEnum(WarehouseType),
  governorateId: z.string().min(1, "اختر المحافظة"),
  address: z.string().optional(),
});

type FormData = z.infer<typeof Schema>;

export function WarehouseForm({ governorates }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { type: WarehouseType.SUB },
  });

  const selectedType = watch("type");
  const inputClass = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createWarehouse(data);
      if (result.success) {
        router.push("/dashboard/inventory");
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-xl" dir="rtl">
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-5 flex items-center gap-2">
          <Warehouse className="w-4 h-4 text-primary" />
          نوع المخزن
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: WarehouseType.MAIN, label: "🏭 مخزن رئيسي", desc: "يستلم من الموردين مباشرة. مسموح بمخزن رئيسي واحد فقط." },
            { value: WarehouseType.SUB, label: "🏪 مخزن فرعي", desc: "يستلم من المخزن الرئيسي فقط. مخزن لكل محافظة." },
          ].map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex flex-col gap-1 p-4 rounded-xl border cursor-pointer transition-all",
                selectedType === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              )}
            >
              <input type="radio" value={opt.value} {...register("type")} className="sr-only" />
              <span className="font-semibold text-sm">{opt.label}</span>
              <span className="text-xs text-muted-foreground leading-tight">{opt.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm mb-1">بيانات المخزن</h2>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">اسم المخزن</label>
          <input {...register("name")} placeholder="مثال: مخزن القاهرة الفرعي" className={inputClass} />
          {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">المحافظة</label>
          <select {...register("governorateId")} className={inputClass}>
            <option value="">اختر المحافظة</option>
            {governorates.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          {errors.governorateId && <p className="text-red-500 text-xs">{errors.governorateId.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">العنوان التفصيلي (اختياري)</label>
          <textarea {...register("address")} rows={2} placeholder="الحي، الشارع، رقم المبنى..." className={cn(inputClass, "resize-none")} />
        </div>
      </div>

      {serverError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm">
          {serverError}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => router.back()} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isPending}
          id="warehouse-form-submit-btn"
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Warehouse className="w-4 h-4" />}
          إنشاء المخزن
        </button>
      </div>
    </form>
  );
}
