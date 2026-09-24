"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { setRepMonthlyTarget } from "@/actions/sales";
import { Target, Plus, Trash2, Loader2, CheckCircle2, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

interface ExistingTargetItem {
  productId: string;
  targetQuantity: number;
  achievedQuantity: number;
}

interface Props {
  salesRepId: string;
  products: Product[];
  existingTarget?: {
    id: string;
    month: number;
    year: number;
    notes?: string | null;
    items: ExistingTargetItem[];
  } | null;
}

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const Schema = z.object({
  salesRepId: z.string(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1, "اختر منتجاً"),
      targetQuantity: z.coerce.number().int().positive("الكمية يجب أن تكون أكبر من 0"),
    })
  ).min(1, "أضف منتجاً واحداً على الأقل"),
});

type FormData = z.input<typeof Schema>;

const now = new Date();

export function RepMonthlyTargetForm({ salesRepId, products, existingTarget }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      salesRepId,
      month: existingTarget?.month ?? now.getMonth() + 1,
      year: existingTarget?.year ?? now.getFullYear(),
      notes: existingTarget?.notes ?? "",
      items: existingTarget?.items.map((i) => ({
        productId: i.productId,
        targetQuantity: i.targetQuantity,
      })) ?? [{ productId: "", targetQuantity: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchMonth = watch("month");
  const watchYear = watch("year");

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  const onSubmit = (data: FormData) => {
    setServerError(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const result = await setRepMonthlyTarget(data);
      if (result.success) {
        setSuccessMsg(result.message ?? "تم حفظ الأهداف الشهرية بنجاح");
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" dir="rtl">
      <input type="hidden" {...register("salesRepId")} />

      {/* Period Selection */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">الشهر</label>
          <select {...register("month")} className={inputClass}>
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">السنة</label>
          <select {...register("year")} className={inputClass}>
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {existingTarget && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-700 dark:text-amber-400">
          ⚠️ يوجد هدف مسجل لهذه الفترة. حفظ بيانات جديدة سيستبدل الأهداف السابقة.
        </div>
      )}

      {/* Product Target Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold flex items-center gap-1.5">
            <Package className="w-4 h-4 text-primary" />
            أهداف المنتجات
          </label>
          <button
            type="button"
            onClick={() => append({ productId: "", targetQuantity: 0 })}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            إضافة منتج
          </button>
        </div>

        <div className="space-y-2">
          {fields.map((field, index) => {
            const achieved = existingTarget?.items.find(
              (i) => i.productId === field.productId
            )?.achievedQuantity ?? 0;

            return (
              <div
                key={field.id}
                className="grid grid-cols-12 gap-2 items-center p-3 bg-muted/30 rounded-xl border border-border/50"
              >
                {/* Product Select */}
                <div className="col-span-7">
                  <select
                    {...register(`items.${index}.productId`)}
                    className={cn(inputClass, "text-sm")}
                  >
                    <option value="">اختر منتجاً...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit})
                      </option>
                    ))}
                  </select>
                  {errors.items?.[index]?.productId && (
                    <p className="text-red-500 text-xs mt-0.5">
                      {errors.items[index]?.productId?.message}
                    </p>
                  )}
                </div>

                {/* Target Quantity */}
                <div className="col-span-3">
                  <input
                    type="number"
                    min={1}
                    {...register(`items.${index}.targetQuantity`)}
                    placeholder="الكمية"
                    className={cn(inputClass, "text-center")}
                  />
                </div>

                {/* Remove Button */}
                <div className="col-span-2 flex justify-center">
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Achievement badge if editing existing */}
                {existingTarget && achieved > 0 && (
                  <div className="col-span-12">
                    <p className="text-xs text-green-600 font-medium">
                      ✓ تحقق: {achieved} وحدة
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {errors.items?.root && (
          <p className="text-red-500 text-xs mt-1">{errors.items.root.message}</p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">ملاحظات (اختياري)</label>
        <input {...register("notes")} placeholder="ملاحظات حول الأهداف..." className={inputClass} />
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {serverError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Target className="w-4 h-4" />
        )}
        حفظ الأهداف الشهرية لـ {MONTHS[(watchMonth || 1) - 1]} {watchYear}
      </button>
    </form>
  );
}
