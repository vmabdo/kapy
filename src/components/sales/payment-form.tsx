"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { recordInvoicePayment } from "@/actions/sales";
import { Banknote, Loader2, DollarSign, Package, CheckCircle2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

interface InvoiceItemForPayment {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  quantity: number;      // total ordered
  unitPrice: number;     // effective (discounted) unit price
  originalUnitPrice?: number; // original price before discount (for display only)
  lineTotal: number;
}

export interface ProductOption {
  id: string;
  name: string;
  sku?: string;
  unit?: string;
  price?: number;
}

interface LegacyTargetItemInput {
  productId: string;
  quantity: number;
  price: number;
}

interface Props {
  invoiceId: string;
  remainingAmount: number;
  invoiceItems?: InvoiceItemForPayment[];
  isLegacy?: boolean;
  allProducts?: ProductOption[];
  salesReps?: { id: string; name: string; employeeCode: string }[];
}

// ─── Schemas ──────────────────────────────────────────────────

const FlatPaymentSchema = z.object({
  invoiceId: z.string(),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHECK"]),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
});

const ItemizedPaymentSchema = z.object({
  invoiceId: z.string(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHECK"]),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
  paymentItems: z
    .array(
      z.object({
        invoiceItemId: z.string(),
        productId: z.string(),
        paidQuantity: z.coerce.number().min(0),
        unitPrice: z.coerce.number().min(0),
      })
    )
    .refine(
      (items) => items.some((i) => i.paidQuantity > 0),
      "حدد كمية لمنتج واحد على الأقل"
    ),
});

type FlatFormData = z.infer<typeof FlatPaymentSchema>;
type ItemizedFormData = z.infer<typeof ItemizedPaymentSchema>;
type PaymentMode = "FLAT" | "ITEMIZED";

const METHOD_LABELS: Record<string, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
  CHECK: "شيك",
};

// ─── Component ────────────────────────────────────────────────

export function PaymentForm({
  invoiceId,
  remainingAmount,
  invoiceItems = [],
  isLegacy = false,
  allProducts = [],
  salesReps = [],
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mode, setMode] = useState<PaymentMode>("FLAT");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [includeTargetItems, setIncludeTargetItems] = useState(false);
  const [targetSalesRepId, setTargetSalesRepId] = useState<string>("");
  const [targetItems, setTargetItems] = useState<LegacyTargetItemInput[]>([]);

  // ─── Flat payment form ────────────────────────────────────
  const flatForm = useForm<z.infer<typeof FlatPaymentSchema>>({
    resolver: zodResolver(FlatPaymentSchema),
    defaultValues: { invoiceId, amount: remainingAmount, method: "CASH" },
  });
  const watchFlatAmount = flatForm.watch("amount") || 0;
  const isOverFlat = watchFlatAmount > remainingAmount + 0.01;

  // ─── Itemized payment form ─────────────────────────────────
  const itemizedForm = useForm<z.infer<typeof ItemizedPaymentSchema>>({
    resolver: zodResolver(ItemizedPaymentSchema),
    defaultValues: {
      invoiceId,
      method: "CASH" as const,
      paymentItems: invoiceItems.map((item) => ({
        invoiceItemId: item.id,
        productId: item.productId,
        paidQuantity: 0,
        unitPrice: item.unitPrice,
      })),
    },
  });
  const watchItemizedItems = itemizedForm.watch("paymentItems") || [];
  const itemizedTotal = watchItemizedItems.reduce(
    (sum, pi) => sum + (pi.paidQuantity || 0) * (pi.unitPrice || 0),
    0
  );
  const isOverItemized = itemizedTotal > remainingAmount + 0.01;

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  if (remainingAmount <= 0) return null;

  const handleFlatSubmit = (data: z.infer<typeof FlatPaymentSchema>) => {
    if (isOverFlat) return;
    if (isLegacy && includeTargetItems) {
      const activeTargets = targetItems.filter((ti) => ti.productId && Number(ti.quantity) > 0);
      if (activeTargets.length > 0 && !targetSalesRepId) {
        setServerError("يرجى اختيار المندوب المستفيد من التارجت");
        return;
      }
    }
    setServerError(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const activeTargets =
        isLegacy && includeTargetItems
          ? targetItems
              .filter((ti) => ti.productId && Number(ti.quantity) > 0)
              .map((ti) => ({
                productId: ti.productId,
                quantity: Number(ti.quantity),
                price: Number(ti.price) || 0,
              }))
          : undefined;

      const result = await recordInvoicePayment({
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        referenceNo: data.referenceNo,
        notes: data.notes,
        targetSalesRepId: isLegacy && includeTargetItems ? targetSalesRepId : undefined,
        targetItems: activeTargets && activeTargets.length > 0 ? activeTargets : undefined,
      });
      if (result.success) {
        setSuccessMsg(result.message ?? "تم تسجيل الدفعة بنجاح");
        flatForm.reset({ invoiceId, amount: 0, method: "CASH" });
        setTargetItems([]);
        setTargetSalesRepId("");
        setIncludeTargetItems(false);
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  const handleItemizedSubmit = (data: z.infer<typeof ItemizedPaymentSchema>) => {
    if (isOverItemized) return;
    const activeItems = data.paymentItems.filter((pi) => pi.paidQuantity > 0);
    if (activeItems.length === 0) {
      setServerError("حدد كمية لمنتج واحد على الأقل");
      return;
    }
    setServerError(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const result = await recordInvoicePayment({
        invoiceId: data.invoiceId,
        amount: itemizedTotal,
        method: data.method,
        referenceNo: data.referenceNo,
        notes: data.notes,
        paymentItems: activeItems.map((pi) => ({
          invoiceItemId: pi.invoiceItemId,
          productId: pi.productId,
          paidQuantity: pi.paidQuantity,
          unitPrice: pi.unitPrice,
        })),
      });
      if (result.success) {
        setSuccessMsg(result.message ?? "تم تسجيل الدفعة بنجاح");
        itemizedForm.reset();
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Banknote className="w-4 h-4 text-green-600" />
          {isLegacy ? "سداد مديونية سابقة" : "تسجيل دفعة (سداد)"}
          {isLegacy && (
            <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
              مديونية سابقة
            </span>
          )}
        </h2>
        <span className="text-xs text-muted-foreground">
          المتبقي:{" "}
          <span className="font-bold text-amber-600">
            {formatCurrency(remainingAmount.toString())}
          </span>
        </span>
      </div>

      {/* Mode Tabs — only for standard invoices */}
      {!isLegacy && (
        <div className="grid grid-cols-2 gap-2 mb-5">
          <button
            type="button"
            onClick={() => setMode("FLAT")}
            className={cn(
              "flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all",
              mode === "FLAT"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            <DollarSign className="w-4 h-4" />
            تسديد مبلغ
          </button>
          <button
            type="button"
            onClick={() => setMode("ITEMIZED")}
            disabled={invoiceItems.length === 0}
            className={cn(
              "flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all",
              mode === "ITEMIZED"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
              invoiceItems.length === 0 && "opacity-40 cursor-not-allowed"
            )}
          >
            <Package className="w-4 h-4" />
            تسديد كميات
          </button>
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* ─── FLAT MODE ───────────────────────────────────────── */}
      {mode === "FLAT" && (
        <form onSubmit={flatForm.handleSubmit(handleFlatSubmit)} className="space-y-4" dir="rtl">
          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">المبلغ (ج.م)</label>
            <input
              type="number"
              step="0.01"
              max={remainingAmount}
              {...flatForm.register("amount")}
              className={cn(inputClass, isOverFlat && "border-red-500 focus:ring-red-500/30 text-red-600")}
            />
            {flatForm.formState.errors.amount && (
              <p className="text-red-500 text-xs">{flatForm.formState.errors.amount.message}</p>
            )}
            {isOverFlat && (
              <p className="text-red-500 text-xs">المبلغ يتجاوز المتبقي ({formatCurrency(remainingAmount.toString())})</p>
            )}
          </div>

          {/* Method */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">طريقة الدفع</label>
            <select {...flatForm.register("method")} className={inputClass}>
              {Object.entries(METHOD_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">رقم المرجع (اختياري)</label>
            <input
              {...flatForm.register("referenceNo")}
              placeholder="رقم الشيك، رقم التحويل..."
              className={inputClass}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">ملاحظات (اختياري)</label>
            <input {...flatForm.register("notes")} placeholder="ملاحظات..." className={inputClass} />
          </div>

          {/* LEGACY DEBT: Target items selection for Sales Rep */}
          {isLegacy && (
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeTargetItems}
                    onChange={(e) => {
                      setIncludeTargetItems(e.target.checked);
                      if (e.target.checked && targetItems.length === 0 && allProducts.length > 0) {
                        setTargetItems([
                          {
                            productId: allProducts[0].id,
                            quantity: 1,
                            price: Number(allProducts[0].price) || 0,
                          },
                        ]);
                      }
                    }}
                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                    🎯 احتساب أصناف لمستهدف المندوب (اختياري - بدون مساس بالمخزون)
                  </span>
                </label>
                {includeTargetItems && (
                  <button
                    type="button"
                    onClick={() => {
                      if (allProducts.length > 0) {
                        setTargetItems([
                          ...targetItems,
                          {
                            productId: allProducts[0].id,
                            quantity: 1,
                            price: Number(allProducts[0].price) || 0,
                          },
                        ]);
                      }
                    }}
                    className="text-xs text-amber-700 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    + إضافة صنف
                  </button>
                )}
              </div>

              {includeTargetItems && (
                <div className="space-y-3 mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-900/40">
                  <div className="space-y-1.5 bg-card/60 p-3 rounded-lg border border-amber-200/80 dark:border-amber-900/50">
                    <label className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span>اختر المندوب المستفيد من التارجت</span>
                        <span className="text-red-500 font-bold">*</span>
                      </span>
                      {salesReps.length === 0 && (
                        <span className="text-[11px] text-red-500 font-normal">لا يوجد مناديب متاحين</span>
                      )}
                    </label>
                    <select
                      value={targetSalesRepId}
                      onChange={(e) => setTargetSalesRepId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-background text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    >
                      <option value="">-- اختر المندوب المستفيد من التارجت --</option>
                      {salesReps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.employeeCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-[11px] text-amber-700/80 dark:text-amber-500/80">
                    هذه الأصناف تُستخدم حصرياً لحساب نسبة تحقيق مستهدف المندوب المحدد لهذا السداد ولا تؤثر إطلاقاً على المخزون.
                  </p>
                  {targetItems.map((ti, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center bg-card p-2.5 rounded-lg border border-amber-200/60 dark:border-amber-900/30 text-xs"
                    >
                      <div className="col-span-5">
                        <label className="text-[10px] text-muted-foreground block mb-0.5">المنتج</label>
                        <select
                          value={ti.productId}
                          onChange={(e) => {
                            const selProd = allProducts.find((p) => p.id === e.target.value);
                            const updated = [...targetItems];
                            updated[idx] = {
                              ...updated[idx],
                              productId: e.target.value,
                              price: Number(selProd?.price) || updated[idx].price,
                            };
                            setTargetItems(updated);
                          }}
                          className="w-full p-1.5 rounded-md border text-xs bg-background"
                        >
                          {allProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="text-[10px] text-muted-foreground block mb-0.5">الكمية</label>
                        <input
                          type="number"
                          min={1}
                          value={ti.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const updated = [...targetItems];
                            updated[idx] = { ...updated[idx], quantity: val };
                            setTargetItems(updated);
                          }}
                          className="w-full p-1.5 rounded-md border text-xs text-center bg-background"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="text-[10px] text-muted-foreground block mb-0.5">السعر (ج.م)</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={ti.price}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const updated = [...targetItems];
                            updated[idx] = { ...updated[idx], price: val };
                            setTargetItems(updated);
                          }}
                          className="w-full p-1.5 rounded-md border text-xs text-center bg-background"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center pt-3">
                        <button
                          type="button"
                          onClick={() => setTargetItems(targetItems.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700 text-sm font-bold"
                          title="حذف"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  {targetItems.length > 0 && (
                    <div className="flex items-center justify-between pt-1 text-xs text-amber-800 dark:text-amber-400 font-medium">
                      <span>
                        إجمالي قيمة الأصناف:{" "}
                        <span className="font-bold">
                          {formatCurrency(
                            targetItems
                              .reduce((sum, i) => sum + (i.quantity || 0) * (i.price || 0), 0)
                              .toString()
                          )}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const totalVal = targetItems.reduce(
                            (sum, i) => sum + (i.quantity || 0) * (i.price || 0),
                            0
                          );
                          flatForm.setValue("amount", Math.min(totalVal, remainingAmount));
                        }}
                        className="text-[11px] underline text-primary hover:text-primary/80"
                      >
                        مزامنة مع مبلغ السداد
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {serverError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs dark:bg-red-900/10 dark:text-red-400">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || isOverFlat}
            className="w-full flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
            تأكيد السداد
          </button>
        </form>
      )}

      {/* ─── ITEMIZED MODE ────────────────────────────────────── */}
      {mode === "ITEMIZED" && (
        <form onSubmit={itemizedForm.handleSubmit(handleItemizedSubmit)} className="space-y-4" dir="rtl">
          {/* Product lines */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              حدد الكمية المراد تسديدها لكل منتج:
            </p>
            {invoiceItems.map((item, index) => {
              const paidQty = watchItemizedItems[index]?.paidQuantity || 0;
              const lineAmount = paidQty * item.unitPrice;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "p-3 rounded-xl border transition-colors",
                    paidQty > 0
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/50 bg-muted/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{item.productName}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{item.productSku}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        الإجمالي: {item.quantity} {item.productUnit} ×{" "}
                        {item.originalUnitPrice && item.originalUnitPrice !== item.unitPrice ? (
                          <>
                            <span className="line-through text-muted-foreground/60 text-[10px] mr-0.5">{item.originalUnitPrice.toFixed(2)}</span>
                            {" "}
                            <span className="font-semibold text-primary">{item.unitPrice.toFixed(2)} ج.م</span>
                            <span className="text-[10px] text-amber-600 mr-1">(بعد الخصم)</span>
                          </>
                        ) : (
                          <>{item.unitPrice.toFixed(2)} ج.م</>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        step="any"
                        {...itemizedForm.register(`paymentItems.${index}.paidQuantity`)}
                        placeholder="0"
                        className="w-20 px-2 py-1.5 text-center text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        من {item.quantity} {item.productUnit}
                      </p>
                      {paidQty > 0 && (
                        <p className="text-[11px] font-semibold text-primary">
                          = {formatCurrency(lineAmount.toString())}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Itemized total */}
          <div
            className={cn(
              "flex justify-between items-center p-3 rounded-xl border font-semibold",
              isOverItemized
                ? "border-red-300 bg-red-50 dark:bg-red-900/10 text-red-600"
                : itemizedTotal > 0
                ? "border-primary/40 bg-primary/5 text-primary"
                : "border-border bg-muted/30 text-muted-foreground"
            )}
          >
            <span className="text-sm">إجمالي الدفعة:</span>
            <span className="text-lg">{formatCurrency(itemizedTotal.toString())}</span>
          </div>
          {isOverItemized && (
            <p className="text-red-500 text-xs">
              الإجمالي يتجاوز المتبقي ({formatCurrency(remainingAmount.toString())})
            </p>
          )}

          {/* Method */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">طريقة الدفع</label>
            <select {...itemizedForm.register("method")} className={inputClass}>
              {Object.entries(METHOD_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">رقم المرجع (اختياري)</label>
            <input
              {...itemizedForm.register("referenceNo")}
              placeholder="رقم الشيك، رقم التحويل..."
              className={inputClass}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">ملاحظات (اختياري)</label>
            <input {...itemizedForm.register("notes")} placeholder="ملاحظات..." className={inputClass} />
          </div>

          {serverError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs dark:bg-red-900/10 dark:text-red-400">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || isOverItemized || itemizedTotal <= 0}
            className="w-full flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            تأكيد سداد الكميات ({formatCurrency(itemizedTotal.toString())})
          </button>
        </form>
      )}
    </div>
  );
}
