"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InvoiceType } from "@prisma/client";

// DiscountType enum — mirrored from Prisma schema
const DiscountType = { PERCENTAGE: "PERCENTAGE", FIXED: "FIXED" } as const;
type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];
import { createInvoice } from "@/actions/sales";
import {
  FileText,
  Loader2,
  Plus,
  Trash2,
  CreditCard,
  Wallet,
  Hash,
  Percent,
  Tag,
  Building2,
  Store,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface Props {
  pharmacies: { id: string; name: string; clientType: string }[];
  salesReps: { id: string; name: string; employeeCode: string }[];
  products: { id: string; name: string; sku: string; sellingPrice: number }[];
  initialClientId?: string;
}

const Schema = z.object({
  pharmacyId: z.string().min(1, "اختر العميل"),
  salesRepId: z.string().min(1, "اختر المندوب"),
  type: z.nativeEnum(InvoiceType),
  manualNumber: z.string().min(1, "رقم الفاتورة مطلوب"),
  discountType: z.nativeEnum(DiscountType).default(DiscountType.PERCENTAGE),
  discountValue: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  amountPaidNow: z.coerce.number().min(0).optional().default(0),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "اختر منتجاً"),
        quantity: z.coerce.number().int().positive("يجب أن تكون الكمية موجبة"),
        unitPrice: z.coerce.number().positive(),
      })
    )
    .min(1, "أضف منتجاً واحداً على الأقل"),
});

type FormData = z.input<typeof Schema>;

/** Client type filter — to let the user switch between Pharmacy / External Warehouse lists */
type ClientTypeFilter = "PHARMACY" | "EXTERNAL_WAREHOUSE" | "ALL";

export function InvoiceForm({ pharmacies, salesReps, products, initialClientId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<ClientTypeFilter>("ALL");

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      type: InvoiceType.CASH,
      pharmacyId: initialClientId || "",
      discountType: DiscountType.PERCENTAGE,
      discountValue: 0,
      amountPaidNow: 0,
      items: [{ productId: "", quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const watchItems = useWatch({ control, name: "items" });
  const selectedType = useWatch({ control, name: "type" });
  const amountPaidNow = useWatch({ control, name: "amountPaidNow" });
  const discountType = useWatch({ control, name: "discountType" });
  const discountValue = useWatch({ control, name: "discountValue" });

  const subtotal =
    watchItems?.reduce(
      (sum: number, item: { quantity?: number; unitPrice?: number }) =>
        sum + (item.quantity || 0) * (item.unitPrice || 0),
      0
    ) || 0;

  const discountAmount =
    (discountValue ?? 0) > 0
      ? discountType === DiscountType.PERCENTAGE
        ? (subtotal * (discountValue ?? 0)) / 100
        : Number(discountValue ?? 0)
      : 0;

  const total = Math.max(0, subtotal - discountAmount);
  const isCash = selectedType === InvoiceType.CASH;
  const paidNow = isCash ? total : Number(amountPaidNow ?? 0) || 0;
  const remainingAmount = Math.max(0, total - paidNow);

  const today = new Date();
  const invoiceDatePrefix = `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-`;

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValue(`items.${index}.unitPrice`, product.sellingPrice, {
        shouldValidate: true,
      });
    }
  };

  const filteredClients =
    clientFilter === "ALL"
      ? pharmacies
      : pharmacies.filter((p) => p.clientType === clientFilter);

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createInvoice({
        ...data,
        discountType: data.discountType ?? DiscountType.PERCENTAGE,
        discountValue: data.discountValue ?? 0,
        amountPaidNow: data.amountPaidNow ?? 0,
      });
      if (result.success) {
        router.push(`/dashboard/sales/${result.data.id}`);
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" dir="rtl">

      {/* ─── Section 1: Invoice Header ─────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          بيانات الفاتورة
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Invoice Type Toggle */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium">نوع الفاتورة</label>
            <div className="grid grid-cols-2 gap-2 max-w-xs">
              <label
                className={cn(
                  "flex items-center justify-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium",
                  selectedType === InvoiceType.CASH
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                    : "border-border hover:bg-muted text-muted-foreground"
                )}
              >
                <input
                  type="radio"
                  value={InvoiceType.CASH}
                  {...register("type")}
                  className="sr-only"
                />
                <Wallet className="w-4 h-4" />
                نقدي
              </label>
              <label
                className={cn(
                  "flex items-center justify-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium",
                  selectedType === InvoiceType.CREDIT
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                    : "border-border hover:bg-muted text-muted-foreground"
                )}
              >
                <input
                  type="radio"
                  value={InvoiceType.CREDIT}
                  {...register("type")}
                  className="sr-only"
                />
                <CreditCard className="w-4 h-4" />
                آجل
              </label>
            </div>
          </div>

          {/* Manual Invoice Number */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-primary" />
              رقم الفاتورة
            </label>
            <div className="flex items-center rounded-xl border border-border bg-background overflow-hidden">
              <span className="px-3 py-2.5 bg-muted border-l border-border text-sm text-muted-foreground font-mono whitespace-nowrap select-none">
                {invoiceDatePrefix}
              </span>
              <input
                type="text"
                {...register("manualNumber")}
                placeholder="مثال: 001 أو A-12"
                className="flex-1 px-3 py-2.5 text-sm bg-transparent focus:outline-none focus:ring-0"
                dir="ltr"
              />
            </div>
            {errors.manualNumber && (
              <p className="text-red-500 text-xs">{errors.manualNumber.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              رقم الفاتورة النهائي سيكون: <span className="font-mono font-medium text-foreground">{invoiceDatePrefix}???</span>
            </p>
          </div>

          {/* Client Type Filter + Client Select */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium">العميل</label>
            {/* Client type tabs */}
            <div className="flex gap-1 mb-2">
              {([
                { value: "ALL", label: "الكل", icon: null },
                { value: "PHARMACY", label: "صيدليات", icon: <Store className="w-3.5 h-3.5" /> },
                { value: "EXTERNAL_WAREHOUSE", label: "مستودعات / شركات", icon: <Building2 className="w-3.5 h-3.5" /> },
              ] as { value: ClientTypeFilter; label: string; icon: React.ReactNode }[]).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setClientFilter(tab.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    clientFilter === tab.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
            <select {...register("pharmacyId")} className={inputClass}>
              <option value="">اختر العميل ({filteredClients.length} متاح)</option>
              {filteredClients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{" "}
                  {p.clientType === "EXTERNAL_WAREHOUSE" ? "🏭" : "💊"}
                </option>
              ))}
            </select>
            {errors.pharmacyId && (
              <p className="text-red-500 text-xs">{errors.pharmacyId.message}</p>
            )}
          </div>

          {/* Sales Rep */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium">مندوب المبيعات</label>
            <select {...register("salesRepId")} className={inputClass}>
              <option value="">اختر المندوب</option>
              {salesReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.employeeCode})
                </option>
              ))}
            </select>
            {errors.salesRepId && (
              <p className="text-red-500 text-xs">{errors.salesRepId.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Section 2: Invoice Items ────────────────────────────── */}
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
            <div
              key={field.id}
              className="grid grid-cols-12 gap-3 items-start p-3 bg-muted/30 rounded-xl border border-border/50"
            >
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
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {(errors.items as Record<number, { productId?: { message?: string } }>)?.[index]?.productId && (
                  <p className="text-red-500 text-xs mt-1">
                    {(errors.items as Record<number, { productId?: { message?: string } }>)[index]?.productId?.message}
                  </p>
                )}
              </div>

              <div className="col-span-4 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">الكمية</label>
                <input
                  type="number"
                  min={1}
                  {...register(`items.${index}.quantity`)}
                  className={cn(inputClass, "text-center")}
                />
              </div>

              <div className="col-span-4 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">سعر الوحدة</label>
                <input
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.unitPrice`)}
                  className={cn(inputClass, "text-center")}
                />
              </div>

              <div className="col-span-4 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">الإجمالي</label>
                <div className="w-full px-3 py-2.5 rounded-xl border border-transparent bg-transparent text-sm font-semibold text-center text-primary">
                  {formatCurrency(
                    (
                      (watchItems?.[index]?.quantity || 0) *
                      (watchItems?.[index]?.unitPrice || 0)
                    ).toString()
                  )}
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

        {/* Subtotal */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">المجموع قبل الخصم:</span>
            <span className="text-lg font-bold text-foreground">
              {formatCurrency(subtotal.toString())}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Section 3: Discount ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          الخصم (اختياري)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Discount Type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">نوع الخصم</label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={cn(
                  "flex items-center justify-center gap-1.5 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium",
                  discountType === DiscountType.PERCENTAGE
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted text-muted-foreground"
                )}
              >
                <input
                  type="radio"
                  value={DiscountType.PERCENTAGE}
                  {...register("discountType")}
                  className="sr-only"
                />
                <Percent className="w-3.5 h-3.5" />
                نسبة %
              </label>
              <label
                className={cn(
                  "flex items-center justify-center gap-1.5 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium",
                  discountType === DiscountType.FIXED
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted text-muted-foreground"
                )}
              >
                <input
                  type="radio"
                  value={DiscountType.FIXED}
                  {...register("discountType")}
                  className="sr-only"
                />
                ج.م مبلغ ثابت
              </label>
            </div>
          </div>

          {/* Discount Value */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {discountType === DiscountType.PERCENTAGE ? "قيمة الخصم (%)" : "مبلغ الخصم (ج.م)"}
            </label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={discountType === DiscountType.PERCENTAGE ? 100 : undefined}
              {...register("discountValue")}
              placeholder="0"
              className={inputClass}
            />
          </div>

          {/* Calculated discount + net total */}
          <div className="space-y-2">
            {discountAmount > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  مبلغ الخصم المحتسب
                </label>
                <div className="px-3 py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 text-sm font-semibold text-red-700 dark:text-red-400">
                  - {formatCurrency(discountAmount.toString())}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">صافي الفاتورة</label>
              <div className="px-3 py-2.5 rounded-xl border border-primary/30 bg-primary/5 text-lg font-bold text-primary">
                {formatCurrency(total.toString())}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section 4: Payment ─────────────────────────────────── */}
      <div
        className={cn(
          "border rounded-xl p-5 transition-colors",
          isCash
            ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40"
            : "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40"
        )}
      >
        {isCash ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-green-800 dark:text-green-400 text-sm">
                دفع نقدي بالكامل
              </p>
              <p className="text-xs text-green-700 dark:text-green-500 mt-0.5">
                سيتم تسجيل المبلغ{" "}
                <span className="font-bold">{formatCurrency(total.toString())}</span>{" "}
                كمدفوع نقداً بالكامل عند إصدار الفاتورة.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-amber-600" />
              <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-400">
                الدفع الآجل — تسوية مالية
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  المبلغ المدفوع حالياً (ج.م)
                </label>
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

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  إجمالي الفاتورة
                </label>
                <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm font-semibold text-foreground">
                  {formatCurrency(total.toString())}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  المبلغ المتبقي (الدَّين)
                </label>
                <div
                  className={cn(
                    "w-full px-3 py-2.5 rounded-xl border text-sm font-bold",
                    remainingAmount > 0
                      ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                      : "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                  )}
                >
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

      {/* ─── Notes ──────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <label className="text-sm font-medium block mb-2">ملاحظات (اختياري)</label>
        <textarea
          {...register("notes")}
          rows={2}
          className={cn(inputClass, "resize-none")}
          placeholder="ملاحظات إضافية حول الفاتورة..."
        />
      </div>

      {serverError && (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200 dark:bg-red-900/10 dark:text-red-400 dark:border-red-900/50">
          {serverError}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          إصدار الفاتورة
        </button>
      </div>
    </form>
  );
}
