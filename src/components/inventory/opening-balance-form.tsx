"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowRight,
  Info,
  Loader2,
  PackagePlus,
  Plus,
  Save,
  Trash2,
  Wallet,
} from "lucide-react";
import { createOpeningStockBalance } from "@/actions/inventory";
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

const Schema = z
  .object({
    warehouseId: z.string().min(1, "اختر المخزن"),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, "اختر منتجاً"),
          quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
          unitCost: z.coerce.number().min(0, "التكلفة لا يمكن أن تكون سالبة"),
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

export function OpeningBalanceForm({
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
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      warehouseId: defaultWarehouseId ?? warehouses[0]?.id ?? "",
      notes: "",
      items: [{ productId: "", quantity: 1, unitCost: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const warehouseId = watch("warehouseId");
  const items = watch("items");
  const selectedItems = (items ?? []).filter((item) => item?.productId);
  const totalValuation = selectedItems.reduce(
    (sum, item) =>
      sum + (Number(item?.quantity) || 0) * (Number(item?.unitCost) || 0),
    0
  );
  const totalUnits = selectedItems.reduce(
    (sum, item) => sum + (Number(item?.quantity) || 0),
    0
  );
  const selectedProductsCount = selectedItems.length;

  const getCurrentStock = (productId: string) => {
    if (!warehouseId || !productId) return 0;
    return (
      stockLevels.find(
        (level) =>
          level.warehouseId === warehouseId && level.productId === productId
      )?.quantity ?? 0
    );
  };

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createOpeningStockBalance(data);
      if (result.success) {
        toast.success(result.message ?? "تم إدخال الرصيد الافتتاحي بنجاح");
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
          {/* Warehouse & notes */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-primary" />
              بيانات الرصيد الافتتاحي
            </h2>

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
                <label className="text-sm font-medium">ملاحظات (اختياري)</label>
                <input
                  {...register("notes")}
                  placeholder="مثال: جرد افتتاحي بتاريخ بداية النشاط"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-primary/5 border border-primary/15 p-3 text-xs text-muted-foreground">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p>
                الرصيد الافتتاحي يزيد كمية المخزن وقيمة الأصول، ولا يخصم من
                الخزينة ولا يسجل مديونية للمورد. يُعامل كرأس مال مخزني افتتاحي.
              </p>
            </div>
          </div>

          {/* Product rows */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="font-semibold text-sm">المنتجات والكميات</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  أدخل الكمية الفعلية الحالية لكل منتج، وعدّل تكلفة الوحدة عند
                  الحاجة.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  append({ productId: "", quantity: 1, unitCost: 0 })
                }
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
                const currentStock = getCurrentStock(selectedProductId);
                const lineTotal =
                  (Number(items?.[index]?.quantity) || 0) *
                  (Number(items?.[index]?.unitCost) || 0);

                return (
                  <div
                    key={field.id}
                    className="rounded-xl border border-border/80 bg-muted/20 p-3"
                  >
                    <div className="grid grid-cols-12 gap-3 items-start">
                      <div className="col-span-12 lg:col-span-6">
                        {index === 0 && (
                          <label className="text-xs text-muted-foreground mb-1 block">
                            المنتج
                          </label>
                        )}
                        <select
                          {...(() => {
                            const productField = register(
                              `items.${index}.productId`
                            );
                            return {
                              ...productField,
                              onChange: (
                                event: React.ChangeEvent<HTMLSelectElement>
                              ) => {
                                productField.onChange(event);
                                const product = products.find(
                                  (entry) => entry.id === event.target.value
                                );
                                if (product) {
                                  setValue(
                                    `items.${index}.unitCost`,
                                    product.costPrice,
                                    {
                                      shouldValidate: true,
                                      shouldDirty: true,
                                    }
                                  );
                                }
                              },
                            };
                          })()}
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
                          <p className="text-[11px] text-muted-foreground mt-1">
                            الرصيد الحالي في المخزن:{" "}
                            <span className="font-semibold text-foreground">
                              {formatNumber(currentStock)}
                            </span>{" "}
                            {products.find((p) => p.id === selectedProductId)
                              ?.unit ?? ""}
                          </p>
                        )}
                      </div>

                      <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                        {index === 0 && (
                          <label className="text-xs text-muted-foreground mb-1 block">
                            الكمية الفعلية
                          </label>
                        )}
                        <input
                          type="number"
                          min={0.001}
                          step="any"
                          {...register(`items.${index}.quantity`)}
                          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-center"
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
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          {...register(`items.${index}.unitCost`)}
                          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-center"
                        />
                        {errors.items?.[index]?.unitCost && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors.items[index]?.unitCost?.message}
                          </p>
                        )}
                      </div>

                      <div className="col-span-10 sm:col-span-12 lg:col-span-1">
                        {index === 0 && (
                          <label className="text-xs text-muted-foreground mb-1 block">
                            القيمة
                          </label>
                        )}
                        <div className="h-[42px] flex items-center justify-center rounded-xl bg-background border border-border px-2 text-xs font-semibold font-mono whitespace-nowrap">
                          {formatCurrency(lineTotal)}
                        </div>
                      </div>

                      <div className="col-span-2 sm:col-span-12 lg:col-span-1 flex items-center justify-center lg:pt-5">
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
          </div>
        </div>

        {/* Summary */}
        <aside className="xl:sticky xl:top-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-gradient-to-l from-emerald-500/10 to-cyan-500/5">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold">قيمة الرصيد الافتتاحي</p>
                  <p className="text-[11px] text-muted-foreground">
                    إجمالي تقييم البضاعة المدخلة
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">إجمالي التقييم</p>
                <p className="text-2xl font-extrabold font-mono text-emerald-600 mt-1">
                  {formatCurrency(totalValuation)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground">عدد المنتجات</p>
                  <p className="text-lg font-bold">{selectedProductsCount}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground">إجمالي الوحدات</p>
                  <p className="text-lg font-bold">
                    {formatNumber(totalUnits)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                لا يتم إنشاء أي حركة نقدية أو مديونية مورد. سيظهر المبلغ في
                تقرير رأس المال المخزني الافتتاحي ضمن القوائم المالية.
              </div>
            </div>

            <div className="px-5 pb-5 space-y-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                حفظ الرصيد الافتتاحي
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
            className={cn(
              "mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            )}
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
