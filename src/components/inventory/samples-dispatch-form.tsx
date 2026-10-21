"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Gift,
  Info,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import { dispatchSamples } from "@/actions/inventory";
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
  costPrice: number;
}

interface SalesRepOption {
  id: string;
  name: string;
  employeeCode: string;
}

interface StockLevel {
  warehouseId: string;
  productId: string;
  quantity: number;
  reservedQty: number;
}

interface Props {
  warehouses: WarehouseOption[];
  products: ProductOption[];
  salesReps: SalesRepOption[];
  stockLevels: StockLevel[];
  defaultWarehouseId?: string;
}

const Schema = z
  .object({
    warehouseId: z.string().min(1, "اختر المخزن"),
    salesRepId: z.string().min(1, "اختر المندوب"),
    notes: z.string().max(500, "الملاحظات طويلة جداً").optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, "اختر منتجاً"),
          quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
        })
      )
      .min(1, "أضف منتجاً واحداً على الأقل"),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.items.forEach((item, index) => {
      if (item.productId && seen.has(item.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "productId"],
          message: "لا يمكن تكرار نفس المنتج",
        });
      }
      if (item.productId) seen.add(item.productId);
    });
  });

type FormData = z.infer<typeof Schema>;

export function SamplesDispatchForm({
  warehouses,
  products,
  salesReps,
  stockLevels,
  defaultWarehouseId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      warehouseId: defaultWarehouseId ?? warehouses[0]?.id ?? "",
      salesRepId: "",
      notes: "",
      items: [{ productId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const warehouseId = watch("warehouseId");
  const salesRepId = watch("salesRepId");
  const items = watch("items");
  const selectedRep = salesReps.find((rep) => rep.id === salesRepId);
  const selectedItems = (items ?? []).filter((item) => item?.productId);

  const getAvailableStock = (productId: string) => {
    if (!warehouseId || !productId) return 0;
    const stockLevel = stockLevels.find(
      (level) =>
        level.warehouseId === warehouseId && level.productId === productId
    );
    return (
      Number(stockLevel?.quantity ?? 0) - Number(stockLevel?.reservedQty ?? 0)
    );
  };

  const totalCost = selectedItems.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item?.productId);
    return sum + (Number(item?.quantity) || 0) * (product?.costPrice ?? 0);
  }, 0);
  const totalUnits = selectedItems.reduce(
    (sum, item) => sum + (Number(item?.quantity) || 0),
    0
  );

  const selectedProductIds = selectedItems.map((item) => item.productId);
  const hasDuplicateProducts =
    new Set(selectedProductIds).size !== selectedProductIds.length;
  const hasInvalidQuantity = selectedItems.some(
    (item) => (Number(item?.quantity) || 0) <= 0
  );

  const insufficientItems = selectedItems.filter((item) => {
    const quantity = Number(item?.quantity) || 0;
    return quantity > getAvailableStock(item.productId);
  });

  const canSubmit =
    !!warehouseId &&
    !!salesRepId &&
    selectedItems.length > 0 &&
    !hasDuplicateProducts &&
    !hasInvalidQuantity &&
    insufficientItems.length === 0 &&
    !isPending;

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await dispatchSamples(data);
      if (result.success) {
        toast.success(result.message ?? "تم صرف العينات بنجاح");
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
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6">
          {/* Dispatch details */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Gift className="w-4 h-4 text-pink-500" />
              بيانات صرف العينات
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">المخزن المصدر *</label>
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
                <label className="text-sm font-medium">
                  المندوب المستلم *
                </label>
                <select
                  {...register("salesRepId")}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">اختر المندوب</option>
                  {salesReps.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name} ({rep.employeeCode})
                    </option>
                  ))}
                </select>
                {errors.salesRepId && (
                  <p className="text-red-500 text-xs">
                    {errors.salesRepId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">
                  ملاحظات (اسم الطبيب / الجهة)
                </label>
                <textarea
                  {...register("notes")}
                  rows={3}
                  placeholder="مثال: عينات للدكتور أحمد — عيادة النور"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                {errors.notes && (
                  <p className="text-red-500 text-xs">{errors.notes.message}</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-pink-500/5 border border-pink-500/15 p-3 text-xs text-muted-foreground">
              <Info className="w-4 h-4 text-pink-500 shrink-0 mt-0.5" />
              <p>
                العينات تُخصم من المخزون وتُحمّل كـ«مصروفات تسويق وعينات
                مجانية» في قائمة الدخل. لا تُسجل كعجز جرد، ولا تخصم من الخزينة،
                ولا تُضاف إلى أهداف مبيعات المندوب.
              </p>
            </div>
          </div>

          {/* Products */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="font-semibold text-sm">المنتجات والكميات</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  أضف كل منتج وحدد الكمية المصروفة من المخزن المختار.
                </p>
              </div>
              <button
                type="button"
                onClick={() => append({ productId: "", quantity: 1 })}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Plus className="w-4 h-4" />
                إضافة منتج
              </button>
            </div>

            {errors.items?.message && (
              <p className="text-red-500 text-xs mb-3">{errors.items.message}</p>
            )}

            <div className="space-y-3">
              {fields.map((field, index) => {
                const selectedProductId = items?.[index]?.productId ?? "";
                const selectedProduct = products.find(
                  (product) => product.id === selectedProductId
                );
                const available = getAvailableStock(selectedProductId);
                const quantity = Number(items?.[index]?.quantity) || 0;
                const lineTotal = quantity * (selectedProduct?.costPrice ?? 0);
                const exceedsStock =
                  !!selectedProductId && quantity > available;

                return (
                  <div
                    key={field.id}
                    className="rounded-xl border border-border/80 bg-muted/20 p-3"
                  >
                    <div className="grid grid-cols-12 gap-3 items-start">
                      <div className="col-span-12 lg:col-span-5">
                        {index === 0 && (
                          <label className="text-xs text-muted-foreground mb-1 block">
                            المنتج
                          </label>
                        )}
                        <select
                          {...register(`items.${index}.productId`)}
                          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">اختر منتجاً...</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} ({product.sku})
                            </option>
                          ))}
                        </select>
                        {errors.items?.[index]?.productId && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors.items[index]?.productId?.message}
                          </p>
                        )}
                        {selectedProductId && (
                          <p
                            className={cn(
                              "text-[11px] mt-1",
                              exceedsStock
                                ? "text-red-500 font-semibold"
                                : "text-muted-foreground"
                            )}
                          >
                            المتاح للصرف: {formatNumber(available)}{" "}
                            {selectedProduct?.unit ?? ""}
                          </p>
                        )}
                      </div>

                      <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                        {index === 0 && (
                          <label className="text-xs text-muted-foreground mb-1 block">
                            الكمية
                          </label>
                        )}
                        <input
                          type="number"
                          min={0.001}
                          step="any"
                          {...register(`items.${index}.quantity`)}
                          className={cn(
                            "w-full px-3 py-2.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 text-center",
                            exceedsStock
                              ? "border-red-400 focus:ring-red-300/40"
                              : "border-border focus:ring-primary/30"
                          )}
                        />
                        {errors.items?.[index]?.quantity && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors.items[index]?.quantity?.message}
                          </p>
                        )}
                      </div>

                      <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                        {index === 0 && (
                          <label className="text-xs text-muted-foreground mb-1 block">
                            تكلفة الوحدة
                          </label>
                        )}
                        <div className="h-[42px] flex items-center justify-center rounded-xl bg-background border border-border px-2 text-xs font-semibold font-mono whitespace-nowrap">
                          {formatCurrency(selectedProduct?.costPrice ?? 0)}
                        </div>
                      </div>

                      <div className="col-span-10 sm:col-span-10 lg:col-span-2">
                        {index === 0 && (
                          <label className="text-xs text-muted-foreground mb-1 block">
                            القيمة
                          </label>
                        )}
                        <div className="h-[42px] flex items-center justify-center rounded-xl bg-background border border-border px-2 text-xs font-semibold font-mono whitespace-nowrap">
                          {formatCurrency(lineTotal)}
                        </div>
                      </div>

                      <div className="col-span-2 sm:col-span-2 lg:col-span-1 flex items-center justify-center lg:pt-5">
                        {fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            aria-label="حذف المنتج"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasDuplicateProducts && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  لا يمكن تكرار نفس المنتج في أكثر من سطر. اجمع الكميات في سطر
                  واحد قبل الحفظ.
                </p>
              </div>
            )}

            {insufficientItems.length > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 p-3 text-xs text-red-700 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  كمية أحد المنتجات أكبر من المخزون المتاح. عدّل الكمية أو اختر
                  مخزناً آخر قبل الحفظ.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <aside className="xl:sticky xl:top-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-gradient-to-l from-pink-500/10 to-rose-500/5">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-pink-500" />
                </div>
                <div>
                  <p className="text-sm font-bold">قيمة العينات المصروفة</p>
                  <p className="text-[11px] text-muted-foreground">
                    تُحمّل كمصروف تسويق ودعاية
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  إجمالي التكلفة
                </p>
                <p className="text-2xl font-extrabold font-mono text-pink-600 mt-1">
                  {formatCurrency(totalCost)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground">المنتجات</p>
                  <p className="text-lg font-bold">
                    {selectedItems.length}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground">الوحدات</p>
                  <p className="text-lg font-bold">
                    {formatNumber(totalUnits)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-[11px] text-muted-foreground mb-1">
                  المندوب المستلم
                </p>
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <UserRound className="w-4 h-4 text-muted-foreground" />
                  {selectedRep?.name ?? "لم يتم الاختيار"}
                </p>
                {selectedRep && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {selectedRep.employeeCode}
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                لا يتم إنشاء أي حركة نقدية أو مديونية مورد. تظهر القيمة ضمن
                المصروفات التشغيلية في قائمة الدخل.
              </div>
            </div>

            <div className="px-5 pb-5 space-y-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                تسجيل صرف العينات
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
