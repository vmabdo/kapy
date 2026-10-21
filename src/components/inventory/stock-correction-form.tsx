"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ClipboardCheck,
  Info,
  Loader2,
  Save,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { createStockCountCorrection } from "@/actions/inventory";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

interface WarehouseOption {
  id: string;
  name: string;
  type: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  unit: string;
  unitCost: number;
}

interface StockLevel {
  warehouseId: string;
  productId: string;
  quantity: number;
}

interface Props {
  warehouses: WarehouseOption[];
  products: ProductOption[];
  stockLevels: StockLevel[];
  defaultWarehouseId?: string;
}

const Schema = z.object({
  direction: z.enum(["SHORTAGE", "SURPLUS"]),
  warehouseId: z.string().min(1, "اختر المخزن"),
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce.number().positive("كمية الفرق يجب أن تكون أكبر من صفر"),
  reason: z.string().trim().min(2, "يرجى إدخال سبب التصحيح"),
});

type FormData = z.infer<typeof Schema>;

export function StockCorrectionForm({
  warehouses,
  products,
  stockLevels,
  defaultWarehouseId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      direction: "SHORTAGE",
      warehouseId: defaultWarehouseId ?? warehouses[0]?.id ?? "",
      productId: "",
      quantity: 1,
      reason: "",
    },
  });

  const direction = watch("direction");
  const warehouseId = watch("warehouseId");
  const productId = watch("productId");
  const quantity = Number(watch("quantity")) || 0;

  const selectedProduct = products.find((product) => product.id === productId);
  const currentStock =
    stockLevels.find(
      (level) =>
        level.warehouseId === warehouseId && level.productId === productId
    )?.quantity ?? 0;

  const isShortage = direction === "SHORTAGE";
  const finalStock = isShortage
    ? currentStock - quantity
    : currentStock + quantity;
  const shortageExceedsStock = isShortage && quantity > currentStock;
  const financialImpact = quantity * (selectedProduct?.unitCost ?? 0);
  const canSubmit =
    !!warehouseId &&
    !!productId &&
    quantity > 0 &&
    !shortageExceedsStock &&
    !isPending;

  const onSubmit = (data: FormData) => {
    if (data.direction === "SHORTAGE" && data.quantity > currentStock) {
      setServerError("كمية النقص أكبر من الرصيد الحالي للمخزن");
      return;
    }

    setServerError(null);
    startTransition(async () => {
      const result = await createStockCountCorrection(data);
      if (result.success) {
        toast.success(result.message ?? "تم تسجيل تصحيح المخزون بنجاح");
        router.push("/dashboard/inventory/movements");
        router.refresh();
      } else {
        setServerError(result.error);
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" dir="rtl">
      <input type="hidden" {...register("direction")} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6">
          {/* Direction */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm mb-1 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary" />
              اتجاه التصحيح
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              حدد ما إذا كان الجرد الفعلي أقل أو أكثر من رصيد البرنامج.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setValue("direction", "SHORTAGE", { shouldValidate: true })
                }
                className={cn(
                  "text-right p-4 rounded-xl border-2 transition-all",
                  isShortage
                    ? "border-red-500/60 bg-red-500/5"
                    : "border-border hover:border-red-500/30"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      isShortage
                        ? "bg-red-500/10 text-red-500"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <TrendingDown className="w-4 h-4" />
                  </span>
                  <p className="text-sm font-bold">تسجيل نقص / عجز</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  الجرد الفعلي أقل من رصيد النظام. يُسجل كخسارة عجز وتوالف
                  مخزون.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setValue("direction", "SURPLUS", { shouldValidate: true })
                }
                className={cn(
                  "text-right p-4 rounded-xl border-2 transition-all",
                  !isShortage
                    ? "border-emerald-500/60 bg-emerald-500/5"
                    : "border-border hover:border-emerald-500/30"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      !isShortage
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <TrendingUp className="w-4 h-4" />
                  </span>
                  <p className="text-sm font-bold">تسجيل زيادة</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  الجرد الفعلي أكثر من رصيد النظام. يُسجل كفائض/تعديل زيادة
                  مخزون.
                </p>
              </button>
            </div>
          </div>

          {/* Details */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm mb-4">تفاصيل التصحيح</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">المخزن *</label>
                <select
                  {...register("warehouseId")}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">اختر المخزن</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
                {errors.warehouseId && (
                  <p className="text-red-500 text-xs">
                    {errors.warehouseId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">المنتج *</label>
                <select
                  {...register("productId")}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">اختر المنتج</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </select>
                {errors.productId && (
                  <p className="text-red-500 text-xs">
                    {errors.productId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {isShortage ? "كمية النقص" : "كمية الزيادة"} *
                </label>
                <input
                  type="number"
                  min={0.001}
                  step="any"
                  {...register("quantity")}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {errors.quantity && (
                  <p className="text-red-500 text-xs">
                    {errors.quantity.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  الرصيد الحالي في البرنامج
                </label>
                <div className="h-[42px] flex items-center rounded-xl border border-border bg-muted/40 px-3 text-sm font-bold">
                  {productId ? formatNumber(currentStock) : "—"}{" "}
                  {selectedProduct?.unit && (
                    <span className="text-xs font-normal text-muted-foreground mr-1">
                      {selectedProduct.unit}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">
                  سبب التصحيح (إلزامي) *
                </label>
                <textarea
                  {...register("reason")}
                  rows={3}
                  placeholder="مثال: كسر، تلف، خطأ جرد، فرق أثناء الجرد الفعلي..."
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                {errors.reason && (
                  <p className="text-red-500 text-xs">
                    {errors.reason.message}
                  </p>
                )}
              </div>
            </div>

            {shortageExceedsStock && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 p-3 text-xs text-red-700 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  كمية النقص ({formatNumber(quantity)}) أكبر من الرصيد الحالي (
                  {formatNumber(currentStock)}). لا يمكن أن يصبح الرصيد سالباً.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        <aside className="xl:sticky xl:top-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div
              className={cn(
                "px-5 py-4 border-b border-border",
                isShortage
                  ? "bg-gradient-to-l from-red-500/10 to-orange-500/5"
                  : "bg-gradient-to-l from-emerald-500/10 to-cyan-500/5"
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center",
                    isShortage
                      ? "bg-red-500/10 text-red-500"
                      : "bg-emerald-500/10 text-emerald-500"
                  )}
                >
                  {isShortage ? (
                    <ArrowDown className="w-4 h-4" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold">
                    {isShortage ? "معاينة النقص" : "معاينة الزيادة"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    الرصيد قبل وبعد التصحيح
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                  <span className="text-xs text-muted-foreground">
                    الرصيد بالبرنامج حالياً
                  </span>
                  <span className="text-sm font-bold font-mono">
                    {productId ? formatNumber(currentStock) : "—"}
                  </span>
                </div>

                <div className="flex justify-center">
                  <ArrowDown
                    className={cn(
                      "w-4 h-4",
                      isShortage ? "text-red-500" : "text-emerald-500"
                    )}
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                  <span className="text-xs text-muted-foreground">
                    {isShortage ? "الكمية المخصومة" : "الكمية المضافة"}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold font-mono",
                      isShortage ? "text-red-500" : "text-emerald-500"
                    )}
                  >
                    {isShortage ? "-" : "+"}
                    {formatNumber(quantity || 0)}
                  </span>
                </div>

                <div className="flex justify-center">
                  <ArrowDown className="w-4 h-4 text-muted-foreground" />
                </div>

                <div
                  className={cn(
                    "flex items-center justify-between rounded-xl border p-3",
                    shortageExceedsStock
                      ? "bg-red-500/5 border-red-500/30"
                      : "bg-primary/5 border-primary/20"
                  )}
                >
                  <span className="text-xs font-semibold">
                    الرصيد النهائي بعد التصحيح
                  </span>
                  <span
                    className={cn(
                      "text-base font-extrabold font-mono",
                      shortageExceedsStock ? "text-red-500" : "text-primary"
                    )}
                  >
                    {productId ? formatNumber(finalStock) : "—"}
                  </span>
                </div>
              </div>

              <div
                className={cn(
                  "rounded-xl border p-4",
                  isShortage
                    ? "bg-red-500/5 border-red-500/20"
                    : "bg-emerald-500/5 border-emerald-500/20"
                )}
              >
                <p className="text-[11px] text-muted-foreground mb-1">
                  {isShortage
                    ? "التأثير المالي (خسارة عجز)"
                    : "التأثير المالي (فائض جرد)"}
                </p>
                <p
                  className={cn(
                    "text-xl font-extrabold font-mono",
                    isShortage ? "text-red-500" : "text-emerald-500"
                  )}
                >
                  {formatCurrency(financialImpact)}
                </p>
                {selectedProduct && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatNumber(quantity || 0)} ×{" "}
                    {formatCurrency(selectedProduct.unitCost)} للتكلفة
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  التصحيح لا يحرك الخزينة النقدية. يظهر النقص كمصروف عجز
                  والزيادة كإيراد/تعديل مخزون في قائمة الدخل.
                </span>
              </div>
            </div>

            <div className="px-5 pb-5 space-y-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors",
                  isShortage
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                )}
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isShortage ? "تسجيل النقص" : "تسجيل الزيادة"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                إلغاء
              </button>
            </div>
          </div>

          <Link
            href="/dashboard/inventory/movements"
            className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            العودة إلى سجل حركات المخزون
          </Link>
        </aside>
      </div>

      {serverError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm">
          {serverError}
        </div>
      )}
    </form>
  );
}
