"use client";

import { useRef, useState } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { processInvoiceReturn } from "@/actions/returns";
import { Undo2, Plus, Trash2, X } from "lucide-react";
import { z } from "zod";
import { formatCurrency } from "@/lib/utils";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const ReturnItemSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من 0"),
});

const LegacyReturnItemSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من 0"),
  basePrice: z.coerce.number().min(0, "السعر يجب أن يكون 0 أو أكبر"),
  discountPercent: z.coerce
    .number()
    .min(0, "الخصم يجب أن يكون 0 أو أكبر")
    .max(100, "الخصم لا يمكن أن يتجاوز 100%"),
});

export const ProcessReturnSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(ReturnItemSchema).optional().default([]),
  legacyItems: z.array(LegacyReturnItemSchema).optional().default([]),
});

type ReturnFormData = z.input<typeof ProcessReturnSchema>;

/** Net unit price after applying a percentage discount. */
function calculateNetPrice(basePrice: unknown, discountPercent: unknown) {
  const base = Math.max(0, Number(basePrice) || 0);
  const discount = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  return Number((base * (1 - discount / 100)).toFixed(2));
}

export interface ProductOption {
  id: string;
  name: string;
  sku?: string;
  unit?: string;
  price?: number;
}

interface Props {
  invoiceId: string;
  invoiceItems?: {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
  isLegacy?: boolean;
  allProducts?: ProductOption[];
}

export function ReturnForm({
  invoiceId,
  invoiceItems = [],
  isLegacy = false,
  allProducts = [],
}: Props) {
  const router = useRouter();
  const submitLockRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ReturnFormData>({
    resolver: zodResolver(ProcessReturnSchema),
    defaultValues: {
      invoiceId,
      reason: "",
      notes: "",
      items: [],
      legacyItems: [],
    },
  });

  const {
    fields: standardFields,
    append: appendStandard,
    remove: removeStandard,
  } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const {
    fields: legacyFields,
    append: appendLegacy,
    remove: removeLegacy,
  } = useFieldArray({
    control: form.control,
    name: "legacyItems",
  });

  const watchLegacyItems = useWatch({
    control: form.control,
    name: "legacyItems",
    defaultValue: [],
  }) || [];
  const legacyTotalReturn = watchLegacyItems.reduce((sum, item) => {
    const netPrice = calculateNetPrice(item?.basePrice, item?.discountPercent);
    return sum + (Number(item?.quantity) || 0) * netPrice;
  }, 0);

  const onSubmit = async (data: ReturnFormData) => {
    setServerError(null);
    if (isLegacy) {
      if (!data.legacyItems || data.legacyItems.length === 0) {
        setServerError("أضف منتجاً واحداً على الأقل للارتجاع");
        return;
      }
    } else {
      if (!data.items || data.items.length === 0) {
        setServerError("أضف منتجاً واحداً على الأقل للارتجاع");
        return;
      }
    }

    if (submitLockRef.current) return;
    submitLockRef.current = true;

    try {
      const result = await processInvoiceReturn({
        invoiceId: data.invoiceId,
        reason: data.reason,
        notes: data.notes,
        items: (!isLegacy && data.items ? data.items : []),
        legacyItems: isLegacy && data.legacyItems
          ? data.legacyItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              // The discounted (net) price is the official unit price used for
              // debt deduction and account-statement entries.
              unitPrice: calculateNetPrice(item.basePrice, item.discountPercent),
            }))
          : [],
      });

      if (result.success) {
        toast.success("تم تسجيل المرتجع بنجاح");
        setIsOpen(false);
        form.reset();
        router.refresh();
      } else {
        toast.error("حدث خطأ", { description: result.error || "حدث خطأ غير متوقع" });
        setServerError(result.error || "حدث خطأ غير متوقع");
      }
    } catch {
      const message = "تعذر تسجيل المرتجع، يرجى المحاولة مرة أخرى.";
      toast.error(message);
      setServerError(message);
    } finally {
      submitLockRef.current = false;
    }
  };

  const availableStandardItems = invoiceItems.filter(
    (item) => !standardFields.find((field) => field.productId === item.productId)
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors text-sm"
      >
        <Undo2 className="w-4 h-4" />
        {isLegacy ? "إضافة مرتجع لمديونية سابقة" : "إضافة مرتجع للفاتورة"}
      </button>

      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
            <div className="bg-card w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl border border-border">
              <div className="flex justify-between items-center p-5 border-b border-border">
                <div>
                  <h2 className="font-semibold text-lg flex items-center gap-2">
                    {isLegacy ? "تسجيل مرتجع لمديونية سابقة" : "تسجيل مرتجع مبيعات"}
                    {isLegacy && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                        مديونية سابقة
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isLegacy
                      ? "حدد المنتجات والكميات المرتجعة وأسعارها. سيتم إدخال البضاعة لمخزن المحافظة وخصم إجمالي قيمتها من رصيد المديونية المستحقة."
                      : "حدد المنتجات والكميات المرتجعة. سيتم استرجاع المنتجات إلى رصيد المخزن وخصم قيمتها من الفاتورة."}
                  </p>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-muted rounded-full">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="p-5">
                {serverError && (
                  <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
                    {serverError}
                  </div>
                )}

                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  dir="rtl"
                  aria-busy={form.formState.isSubmitting}
                >
                  <fieldset
                    disabled={form.formState.isSubmitting}
                    className="contents space-y-6"
                  >
                  {/* ─── LEGACY RETURN FORM ──────────────────────────────── */}
                  {isLegacy ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">الأصناف المرتجعة (من الكتالوج)</h3>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted font-medium"
                          onClick={() => {
                            if (allProducts.length > 0) {
                              appendLegacy({
                                productId: allProducts[0].id,
                                quantity: 1,
                                basePrice: Number(allProducts[0].price) || 0,
                                discountPercent: 0,
                              });
                            }
                          }}
                        >
                          <Plus className="w-3 h-3" />
                          إضافة صنف للارتجاع
                        </button>
                      </div>

                      {legacyFields.length === 0 && (
                        <div className="text-center p-6 bg-muted/30 rounded-xl border border-border border-dashed">
                          <p className="text-sm text-muted-foreground">لم يتم اختيار أي منتجات للارتجاع بعد</p>
                          <button
                            type="button"
                            onClick={() => {
                              if (allProducts.length > 0) {
                                appendLegacy({
                                  productId: allProducts[0].id,
                                  quantity: 1,
                                  basePrice: Number(allProducts[0].price) || 0,
                                  discountPercent: 0,
                                });
                              }
                            }}
                            className="mt-2 text-xs text-primary font-semibold hover:underline"
                          >
                            + انقر لإضافة أول صنف
                          </button>
                        </div>
                      )}

                      {legacyFields.map((field, index) => {
                        const quantity = Number(watchLegacyItems[index]?.quantity) || 0;
                        const basePrice = Number(watchLegacyItems[index]?.basePrice) || 0;
                        const discountPercent =
                          Number(watchLegacyItems[index]?.discountPercent) || 0;
                        const netPrice = calculateNetPrice(basePrice, discountPercent);
                        const lineTotal = quantity * netPrice;

                        return (
                          <div
                            key={field.id}
                            className="bg-muted/20 p-3.5 rounded-xl border border-border/60 space-y-3"
                          >
                            {/* Row 1: product selector + delete */}
                            <div className="flex items-end gap-2">
                              <div className="flex-1 min-w-0 space-y-1">
                                <label className="text-xs font-medium">المنتج</label>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  {...form.register(`legacyItems.${index}.productId`)}
                                  onChange={(e) => {
                                    form.register(`legacyItems.${index}.productId`).onChange(e);
                                    const sel = allProducts.find((p) => p.id === e.target.value);
                                    if (sel) {
                                      form.setValue(
                                        `legacyItems.${index}.basePrice`,
                                        Number(sel.price) || 0,
                                        { shouldValidate: true }
                                      );
                                      form.setValue(`legacyItems.${index}.discountPercent`, 0);
                                    }
                                  }}
                                >
                                  {allProducts.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <button
                                type="button"
                                className="h-10 w-10 shrink-0 flex justify-center items-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                onClick={() => removeLegacy(index)}
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Row 2: quantity, base price, discount, net price */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium">الكمية</label>
                                <input
                                  type="number"
                                  min={0.001}
                                  step="any"
                                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  {...form.register(`legacyItems.${index}.quantity`, { valueAsNumber: true })}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-medium">السعر (ج.م)</label>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  {...form.register(`legacyItems.${index}.basePrice`, { valueAsNumber: true })}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-medium">الخصم (%)</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.01"
                                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  {...form.register(`legacyItems.${index}.discountPercent`, { valueAsNumber: true })}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-medium">السعر بعد الخصم (ج.م)</label>
                                <input
                                  type="number"
                                  readOnly
                                  tabIndex={-1}
                                  value={netPrice}
                                  className="flex h-10 w-full rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 text-sm text-center font-bold text-amber-800 dark:text-amber-300 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50">
                              <span className="text-xs text-muted-foreground">إجمالي الصنف</span>
                              <span className="text-sm font-bold text-foreground">
                                {formatCurrency(lineTotal.toString())}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {legacyFields.length > 0 && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-900/40 flex justify-between items-center text-sm">
                          <span className="font-semibold text-amber-900 dark:text-amber-300">
                            إجمالي قيمة المرتجع المخصوم من الدين:
                          </span>
                          <span className="text-base font-bold text-red-600">
                            - {formatCurrency(legacyTotalReturn.toString())}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ─── STANDARD RETURN FORM ────────────────────────────── */
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">المنتجات المرتجعة</h3>
                        {availableStandardItems.length > 0 && (
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted"
                            onClick={() => {
                              if (availableStandardItems[0]) {
                                appendStandard({ productId: availableStandardItems[0].productId, quantity: 1 });
                              }
                            }}
                          >
                            <Plus className="w-3 h-3" />
                            إضافة منتج للارتجاع
                          </button>
                        )}
                      </div>

                      {standardFields.length === 0 && (
                        <div className="text-center p-6 bg-muted/30 rounded-xl border border-border border-dashed">
                          <p className="text-sm text-muted-foreground">لم يتم اختيار أي منتجات للارتجاع</p>
                        </div>
                      )}

                      {standardFields.map((field, index) => {
                        const selectedProductId = form.watch(`items.${index}.productId`);
                        const originalItem = invoiceItems.find((i) => i.productId === selectedProductId);
                        const maxQuantity = originalItem?.quantity || 1;

                        return (
                          <div
                            key={field.id}
                            className="grid grid-cols-12 gap-3 items-end bg-muted/20 p-3 rounded-lg border border-border/50"
                          >
                            <div className="col-span-12 sm:col-span-6 space-y-1">
                              <label className="text-xs font-medium">المنتج</label>
                              <select
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                {...form.register(`items.${index}.productId`)}
                              >
                                <option value="">اختر المنتج</option>
                                {invoiceItems.map((item) => (
                                  <option
                                    key={item.productId}
                                    value={item.productId}
                                    disabled={
                                      item.productId !== selectedProductId &&
                                      standardFields.some((f) => f.productId === item.productId)
                                    }
                                  >
                                    {item.productName} (السعر: {formatCurrency(item.unitPrice.toString())})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-9 sm:col-span-4 space-y-1">
                              <div className="flex justify-between">
                                <label className="text-xs font-medium">الكمية المرتجعة</label>
                                <span className="text-[10px] text-muted-foreground">أقصى حد: {maxQuantity}</span>
                              </div>
                              <input
                                type="number"
                                min={0.001}
                                max={maxQuantity}
                                step="any"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                {...form.register(`items.${index}.quantity`)}
                              />
                            </div>

                            <div className="col-span-3 sm:col-span-2">
                              <button
                                type="button"
                                className="h-9 w-full flex justify-center items-center rounded-lg text-red-500 hover:bg-red-50"
                                onClick={() => removeStandard(index)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ─── Reason and Notes ────────────────────────────── */}
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">سبب الارتجاع (اختياري)</label>
                      <input
                        type="text"
                        placeholder="مثال: تسوية رصيد سابق، منتج مسترجع..."
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                        {...form.register("reason")}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm font-medium">ملاحظات إضافية (اختياري)</label>
                      <textarea
                        placeholder="أي ملاحظات أخرى حول المرتجع..."
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                        {...form.register("notes")}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={form.formState.isSubmitting}
                      className="px-4 py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {form.formState.isSubmitting ? (
                        <>
                          <Undo2 className="w-4 h-4 animate-spin" /> جاري الحفظ...
                        </>
                      ) : (
                        "تأكيد المرتجع"
                      )}
                    </button>
                  </div>
                  </fieldset>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
