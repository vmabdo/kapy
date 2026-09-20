"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InvoiceType } from "@prisma/client";
import { createInvoice } from "@/actions/sales";
import { FileText, Loader2, Plus, Trash2, CreditCard, Wallet } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface Props {
  pharmacies: { id: string; name: string }[];
  salesReps: { id: string; name: string; employeeCode: string }[];
  products: { id: string; name: string; sku: string; sellingPrice: number }[];
}

const Schema = z.object({
  pharmacyId: z.string().min(1, "اختر صيدلية"),
  salesRepId: z.string().min(1, "اختر المندوب"),
  type: z.nativeEnum(InvoiceType),
  notes: z.string().optional(),
  amountPaidNow: z.coerce.number().min(0).optional().default(0),
  items: z.array(
    z.object({
      productId: z.string().min(1, "اختر منتجاً"),
      quantity: z.coerce.number().int().positive("يجب أن تكون الكمية موجبة"),
      unitPrice: z.coerce.number().positive(),
    })
  ).min(1, "أضف منتجاً واحداً على الأقل"),
});

type FormData = z.input<typeof Schema>;

export function InvoiceForm({ pharmacies, salesReps, products }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      type: InvoiceType.CASH,
      amountPaidNow: 0,
      items: [{ productId: "", quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  // Watch items and type for live calculations
  const watchItems = useWatch({ control, name: "items" });
  const selectedType = useWatch({ control, name: "type" });
  const amountPaidNow = useWatch({ control, name: "amountPaidNow" });

  const calculateTotal = () => {
    return watchItems?.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0) || 0;
  };

  const total = calculateTotal();
  const isCash = selectedType === InvoiceType.CASH;
  const paidNow = isCash ? total : (Number(amountPaidNow ?? 0) || 0);
  const remainingAmount = Math.max(0, total - paidNow);

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setValue(`items.${index}.unitPrice`, product.sellingPrice, { shouldValidate: true });
    }
  };

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createInvoice({
        ...data,
        amountPaidNow: data.amountPaidNow ?? 0,
      });
      if (result.success) {
        router.push("/dashboard/sales");
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  const inputClass = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" dir="rtl">

      {/* Basic Info */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          بيانات الفاتورة
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Invoice Type Toggle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">نوع الفاتورة</label>
            <div className="grid grid-cols-2 gap-2">
              <label className={cn(
                "flex items-center justify-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium",
                selectedType === InvoiceType.CASH
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                  : "border-border hover:bg-muted text-muted-foreground"
              )}>
                <input type="radio" value={InvoiceType.CASH} {...register("type")} className="sr-only" />
                <Wallet className="w-4 h-4" />
                نقدي
              </label>
              <label className={cn(
                "flex items-center justify-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium",
                selectedType === InvoiceType.CREDIT
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                  : "border-border hover:bg-muted text-muted-foreground"
              )}>
                <input type="radio" value={InvoiceType.CREDIT} {...register("type")} className="sr-only" />
                <CreditCard className="w-4 h-4" />
                آجل (Credit)
              </label>
            </div>
          </div>

          <div className="space-y-1.5 md:col-start-1">
            <label className="text-sm font-medium">الصيدلية (العميل)</label>
            <select {...register("pharmacyId")} className={inputClass}>
              <option value="">اختر الصيدلية</option>
              {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {errors.pharmacyId && <p className="text-red-500 text-xs">{errors.pharmacyId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">مندوب المبيعات</label>
            <select {...register("salesRepId")} className={inputClass}>
              <option value="">اختر المندوب</option>
              {salesReps.map(r => <option key={r.id} value={r.id}>{r.name} ({r.employeeCode})</option>)}
            </select>
            {errors.salesRepId && <p className="text-red-500 text-xs">{errors.salesRepId.message}</p>}
          </div>
        </div>
      </div>

      {/* Invoice Items */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm">الأصناف (المنتجات)</h2>
          <button
            type="button"
            onClick={() => append({ productId: "", quantity: 1, unitPrice: 0 })}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Plus className="w-4 h-4" /> إضافة صنف
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-3 items-start p-3 bg-muted/30 rounded-xl border border-border/50">
              <div className="col-span-12 sm:col-span-5">
                <label className="text-xs text-muted-foreground mb-1 block">المنتج</label>
                <select
                  {...register(`items.${index}.productId`)}
                  onChange={(e) => {
                    register(`items.${index}.productId`).onChange(e);
                    handleProductChange(index, e.target.value);
                  }}
                  className={inputClass}
                >
                  <option value="">اختر منتجاً...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {errors.items?.[index]?.productId && <p className="text-red-500 text-xs mt-1">{errors.items[index]?.productId?.message}</p>}
              </div>

              <div className="col-span-4 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">الكمية</label>
                <input
                  type="number" min={1}
                  {...register(`items.${index}.quantity`)}
                  className={cn(inputClass, "text-center")}
                />
              </div>

              <div className="col-span-4 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">سعر الوحدة</label>
                <input
                  type="number" step="0.01"
                  {...register(`items.${index}.unitPrice`)}
                  className={cn(inputClass, "text-center")}
                  readOnly
                />
              </div>

              <div className="col-span-4 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">الإجمالي</label>
                <div className="w-full px-3 py-2.5 rounded-xl border border-transparent bg-transparent text-sm font-semibold text-center text-primary">
                  {formatCurrency(((watchItems?.[index]?.quantity || 0) * (watchItems?.[index]?.unitPrice || 0)).toString())}
                </div>
              </div>

              <div className="col-span-12 sm:col-span-1 flex items-center justify-center pt-5">
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-border flex justify-between items-center">
          <span className="font-medium text-muted-foreground">إجمالي الفاتورة:</span>
          <span className="text-2xl font-bold text-foreground">
            {formatCurrency(total.toString())}
          </span>
        </div>
      </div>

      {/* Payment Section — Dynamic based on invoice type */}
      <div className={cn(
        "border rounded-xl p-5 transition-colors",
        isCash
          ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40"
          : "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40"
      )}>
        {isCash ? (
          // CASH: Show confirmation that full amount will be recorded
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-green-800 dark:text-green-400 text-sm">دفع نقدي بالكامل</p>
              <p className="text-xs text-green-700 dark:text-green-500 mt-0.5">
                سيتم تسجيل المبلغ الإجمالي <span className="font-bold">{formatCurrency(total.toString())}</span> كمدفوع نقداً بالكامل عند إصدار الفاتورة.
              </p>
            </div>
          </div>
        ) : (
          // CREDIT: Show amountPaidNow input + remaining calculation
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-amber-600" />
              <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-400">الدفع الآجل — تسوية مالية</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Amount Paid Now */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">المبلغ المدفوع حالياً (ج.م)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={total}
                  {...register("amountPaidNow")}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
                <p className="text-xs text-muted-foreground">اتركه 0 إذا لم يُدفع أي مبلغ الآن</p>
              </div>

              {/* Total for reference */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">إجمالي الفاتورة</label>
                <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm font-semibold text-foreground">
                  {formatCurrency(total.toString())}
                </div>
              </div>

              {/* Remaining Amount */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">المبلغ المتبقي (الدَّين)</label>
                <div className={cn(
                  "w-full px-3 py-2.5 rounded-xl border text-sm font-bold",
                  remainingAmount > 0
                    ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                    : "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                )}>
                  {formatCurrency(remainingAmount.toString())}
                </div>
                {remainingAmount === 0 && paidNow > 0 && (
                  <p className="text-xs text-green-600 font-medium">✓ مدفوع بالكامل</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-card border border-border rounded-xl p-5">
        <label className="text-sm font-medium block mb-2">ملاحظات (اختياري)</label>
        <textarea {...register("notes")} rows={2} className={cn(inputClass, "resize-none")} placeholder="ملاحظات إضافية حول الفاتورة..." />
      </div>

      {serverError && (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">
          {serverError}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => router.back()} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted">
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          إصدار الفاتورة
        </button>
      </div>
    </form>
  );
}
