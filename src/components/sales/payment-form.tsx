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
  unitPrice: number;
  lineTotal: number;
}

interface Props {
  invoiceId: string;
  remainingAmount: number;
  invoiceItems?: InvoiceItemForPayment[];
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
        paidQuantity: z.coerce.number().int().min(0),
        unitPrice: z.coerce.number(),
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

export function PaymentForm({ invoiceId, remainingAmount, invoiceItems = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mode, setMode] = useState<PaymentMode>("FLAT");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
    setServerError(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const result = await recordInvoicePayment({
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        referenceNo: data.referenceNo,
        notes: data.notes,
      });
      if (result.success) {
        setSuccessMsg(result.message ?? "تم تسجيل الدفعة بنجاح");
        flatForm.reset({ invoiceId, amount: 0, method: "CASH" });
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
          تسجيل دفعة (سداد)
        </h2>
        <span className="text-xs text-muted-foreground">
          المتبقي:{" "}
          <span className="font-bold text-amber-600">
            {formatCurrency(remainingAmount.toString())}
          </span>
        </span>
      </div>

      {/* Mode Tabs */}
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
                        {formatCurrency(item.unitPrice.toString())}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
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
