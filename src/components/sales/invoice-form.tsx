"use client";

import { useState, useTransition, useEffect } from "react";
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
  Package,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  pharmacies: { id: string; name: string; clientType: string; governorateId: string }[];
  salesReps: { id: string; name: string; employeeCode: string }[];
  products: { id: string; name: string; sku: string; unit: string; sellingPrice: number }[];
  initialClientId?: string;
}

const UpfrontPaymentItemSchema = z.object({
  productId: z.string(),
  paidQuantity: z.coerce.number().min(0).optional().default(0),
  unitPrice: z.coerce.number().min(0).optional().default(0),
});

const Schema = z.object({
  pharmacyId: z.string().min(1, "اختر العميل"),
  salesRepId: z.string().min(1, "اختر المندوب"),
  type: z.nativeEnum(InvoiceType),
  manualNumber: z.string().min(1, "رقم الفاتورة مطلوب"),
  discountType: z.nativeEnum(DiscountType).default(DiscountType.PERCENTAGE),
  discountValue: z.coerce.number().min(0).optional().default(0),
  paidAmount: z.coerce.number().min(0).optional().default(0),
  notes: z.string().optional(),
  isLegacy: z.boolean().optional().default(false),
  issueDate: z.string().optional(),
  // Upfront itemized payment items (for CREDIT invoices)
  upfrontPaymentItems: z.array(UpfrontPaymentItemSchema).optional().default([]),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "اختر منتجاً"),
        quantity: z.coerce.number().positive("يجب أن تكون الكمية موجبة"),
        bonusQuantity: z.coerce.number().min(0).optional().default(0), // free boxes
        unitPrice: z.coerce.number().min(0, "السعر غير صالح").optional().default(0),
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
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      type: InvoiceType.CASH,
      pharmacyId: initialClientId || "",
      discountType: DiscountType.PERCENTAGE,
      discountValue: 0,
      paidAmount: 0,
      isLegacy: false,
      issueDate: new Date().toISOString().split('T')[0],
      upfrontPaymentItems: [],
      items: [{ productId: "", quantity: 1, bonusQuantity: 0, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const watchItems = useWatch({ control, name: "items" });
  const selectedType = useWatch({ control, name: "type" });
  const upfrontPaymentItems = useWatch({ control, name: "upfrontPaymentItems" });
  const discountType = useWatch({ control, name: "discountType" });
  const discountValue = useWatch({ control, name: "discountValue" });
  const paidAmount = useWatch({ control, name: "paidAmount" });
  const isLegacy = useWatch({ control, name: "isLegacy" });

  // Dynamically calculate and set paidAmount based on upfrontPaymentItems
  useEffect(() => {
    if (selectedType !== InvoiceType.CASH) {
      const totalPaid = (upfrontPaymentItems || []).reduce(
        (sum, item) => sum + (Number(item.paidQuantity || 0) * Number(item.unitPrice || 0)),
        0
      );
      setValue('paidAmount', totalPaid, { shouldValidate: true });
    }
  }, [upfrontPaymentItems, selectedType, setValue]);

  // Re-sync upfront item prices whenever discount changes (discountedUnitPrice must be recalculated)
  useEffect(() => {
    if (selectedType !== InvoiceType.CASH) {
      setTimeout(syncUpfrontItems, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountValue, discountType]);

  // Subtotal = only billed quantity * price (bonus is free)
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

  // ── Proportional discount factor ──
  // Used to compute discountedUnitPrice per item for upfront payment and returns
  const discountFactor = subtotal > 0 ? total / subtotal : 1;

  const isCash = selectedType === InvoiceType.CASH;

  // Compute the upfront paid amount from itemized entries
  const upfrontPaid = isCash
    ? total
    : Number(paidAmount || 0);
  const remainingAmount = Math.max(0, total - upfrontPaid);

  const today = new Date();
  const invoiceDatePrefix = `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-`;

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValue(`items.${index}.unitPrice`, product.sellingPrice, {
        shouldValidate: true,
      });
      // Recalculate upfront items to use new discountedUnitPrice
      setTimeout(syncUpfrontItems, 0);
    }
  };

  // When items change, sync the upfrontPaymentItems array to match
  // CRITICAL: unitPrice in upfrontPaymentItems is the discountedUnitPrice (after discount)
  const syncUpfrontItems = () => {
    const currentItems = getValues("items") ?? [];
    const currentUpfront = getValues("upfrontPaymentItems") ?? [];
    // Re-compute discountFactor at sync time
    const currentSubtotal = currentItems.reduce(
      (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
      0
    );
    const currentDiscountValue = Number(getValues("discountValue") || 0);
    const currentDiscountType = getValues("discountType");
    let currentDiscountAmount = 0;
    if (currentDiscountValue > 0) {
      currentDiscountAmount = currentDiscountType === DiscountType.PERCENTAGE
        ? (currentSubtotal * currentDiscountValue) / 100
        : currentDiscountValue;
    }
    const currentTotal = Math.max(0, currentSubtotal - currentDiscountAmount);
    const factor = currentSubtotal > 0 ? currentTotal / currentSubtotal : 1;

    const newUpfront = currentItems
      .filter((item) => item.productId)
      .map((item) => {
        const existing = currentUpfront.find((u) => u.productId === item.productId);
        const discountedPrice = (Number(item.unitPrice) || 0) * factor;
        return {
          productId: item.productId,
          paidQuantity: existing?.paidQuantity || 0,
          unitPrice: discountedPrice, // discountedUnitPrice
        };
      });
    setValue("upfrontPaymentItems", newUpfront, { shouldValidate: true });
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
        paidAmount: data.paidAmount ?? 0,
        isLegacy: data.isLegacy ?? false,
        issueDate: data.isLegacy && data.issueDate ? new Date(data.issueDate) : undefined,
        // upfrontPaymentItems carry discountedUnitPrice as unitPrice
        upfrontPaymentItems: (data.upfrontPaymentItems ?? []).filter(
          (pi) => (pi.paidQuantity ?? 0) > 0
        ).map((pi) => ({
          ...pi,
          paidQuantity: pi.paidQuantity ?? 0,
          unitPrice: pi.unitPrice ?? 0, // discountedUnitPrice
        })),
        items: data.items.map(item => ({
          ...item,
          unitPrice: item.unitPrice ?? 0,
          bonusQuantity: item.bonusQuantity ?? 0,
        })),
      });
      if (result.success) {
        toast.success("تم إصدار الفاتورة بنجاح");
        router.push(`/dashboard/sales/${result.data.id}`);
        router.refresh();
      } else {
        toast.error("حدث خطأ", { description: result.error });
        setServerError(result.error);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  const onError = (errors: any) => {
    console.error("Form Validation Errors:", errors);
    let errorMessages: string[] = [];

    const extractErrors = (obj: any, path: string = "") => {
      if (!obj) return;
      if (obj.message) {
        errorMessages.push(`الحقل ${path}: ${obj.message}`);
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => extractErrors(item, `${path}[${index}]`));
      } else if (typeof obj === "object") {
        Object.keys(obj).forEach(key => extractErrors(obj[key], path ? `${path}.${key}` : key));
      }
    };

    extractErrors(errors);
    
    const msg = errorMessages.length > 0 ? errorMessages.join(" | ") : "تأكد من صحة البيانات المدخلة";
    setServerError(`خطأ في الإدخال: ${msg}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-6" dir="rtl">

      {/* ─── Section 1: Invoice Header ─────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            بيانات الفاتورة
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold cursor-pointer text-amber-600 dark:text-amber-500 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/10 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/50">
              تسجيل مديونية/فاتورة سابقة
              <input
                type="checkbox"
                {...register("isLegacy")}
                className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 border-amber-300"
              />
            </label>
          </div>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {isLegacy && (
            <div className="space-y-1.5 md:col-span-2 bg-amber-50/50 dark:bg-amber-900/5 p-4 rounded-xl border border-amber-100 dark:border-amber-900/30">
              <label className="text-sm font-bold text-amber-800 dark:text-amber-400">
                تاريخ الفاتورة السابقة
              </label>
              <p className="text-xs text-amber-700/80 dark:text-amber-500/80 mb-2">
                لن يتم خصم المخزون لهذه الفاتورة، ولن تحتسب ضمن أهداف المندوبين.
              </p>
              <input
                type="date"
                {...register("issueDate")}
                className={cn(inputClass, "border-amber-200 dark:border-amber-900/50")}
              />
            </div>
          )}

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
            onClick={() => {
              append({ productId: "", quantity: 1, unitPrice: 0 });
            }}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Plus className="w-4 h-4" /> إضافة صنف
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id}
              className="grid grid-cols-12 gap-3 items-start p-3 bg-muted/30 rounded-xl border border-border/50"
            >
              <div className="col-span-12 sm:col-span-4">
                <label className="text-xs text-muted-foreground mb-1 block">المنتج</label>
                <select
                  {...register(`items.${index}.productId`)}
                  onChange={(e) => {
                    register(`items.${index}.productId`).onChange(e);
                    handleProductChange(index, e.target.value);
                    setTimeout(syncUpfrontItems, 0);
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
              </div>

              {/* Quantity */}
              <div className="col-span-3 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">الكمية</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  {...register(`items.${index}.quantity`)}
                  onChange={(e) => {
                    register(`items.${index}.quantity`).onChange(e);
                    setTimeout(syncUpfrontItems, 0);
                  }}
                  className={cn(inputClass, "text-center")}
                />
              </div>

              {/* Bonus Quantity (free boxes) */}
              <div className="col-span-3 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                  بونص 🎁
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  {...register(`items.${index}.bonusQuantity`)}
                  placeholder="0"
                  className={cn(inputClass, "text-center border-emerald-300 dark:border-emerald-700/50 bg-emerald-50/50 dark:bg-emerald-900/10")}
                />
              </div>

              {/* Unit Price */}
              <div className="col-span-3 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">سعر الوحدة</label>
                <input
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                  className={cn(inputClass, "text-center bg-muted/50")}
                  readOnly
                />
              </div>

              {/* Line Total */}
              <div className="col-span-3 sm:col-span-1">
                <label className="text-xs text-muted-foreground mb-1 block">الإجمالي</label>
                <div className="w-full px-2 py-2.5 rounded-xl border border-transparent bg-transparent text-sm font-semibold text-center text-primary">
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
                    onClick={() => {
                      remove(index);
                      setTimeout(syncUpfrontItems, 0);
                    }}
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
                الدفع الآجل — دفعة مقدمة بالكميات (اختياري)
              </h3>
            </div>

            {/* Upfront itemized payment by product */}
            {(upfrontPaymentItems ?? []).some((item) => item.productId) ? (
              <div className="space-y-3">
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  حدد الكمية المراد دفعها مقدماً لكل منتج (اتركها 0 إذا لم يُدفع شيء الآن):
                </p>
                {(upfrontPaymentItems ?? []).map((upfrontItem, index) => {
                  if (!upfrontItem.productId) return null;
                  const product = products.find((p) => p.id === upfrontItem.productId);
                  const relatedWatchItem = (watchItems ?? []).find(i => i.productId === upfrontItem.productId);
                  const maxQty = relatedWatchItem?.quantity || 0;
                  const upfrontQty = upfrontItem.paidQuantity || 0;
                  const lineAmount = upfrontQty * (upfrontItem.unitPrice || 0);

                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors",
                        upfrontQty > 0
                          ? "border-amber-400/50 bg-amber-50/50 dark:bg-amber-900/10"
                          : "border-border/40 bg-background/50"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">
                          {product?.name ?? upfrontItem.productId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          إجمالي الصنف: {maxQty} {product?.unit ?? "وحدة"} ×{" "}
                          {formatCurrency((upfrontItem.unitPrice || 0).toString())}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={maxQty}
                          step="any"
                          {...register(`upfrontPaymentItems.${index}.paidQuantity`, { valueAsNumber: true })}
                          placeholder="0"
                          className="w-24 px-2 py-1.5 text-center text-sm rounded-lg border border-amber-300 dark:border-amber-700 bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          من {maxQty} {product?.unit ?? "وحدة"}
                        </p>
                        {upfrontQty > 0 && (
                          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            = {formatCurrency(lineAmount.toString())}
                          </p>
                        )}
                      </div>
                      {/* Hidden fields to sync productId and unitPrice */}
                      <input type="hidden" {...register(`upfrontPaymentItems.${index}.productId`)} value={upfrontItem.productId} />
                      <input type="hidden" {...register(`upfrontPaymentItems.${index}.unitPrice`, { valueAsNumber: true })} value={upfrontItem.unitPrice || 0} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-border/40 bg-background/50 text-xs text-muted-foreground">
                <Package className="w-4 h-4" />
                أضف منتجات في الأصناف أولاً لتظهر خيارات الدفع المقدم
              </div>
            )}

            {/* Summary */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  إجمالي الفاتورة
                </label>
                <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm font-semibold text-foreground">
                  {formatCurrency(total.toString())}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  المدفوع مقدماً
                </label>
                <div className="w-full px-3 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-background text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {formatCurrency(upfrontPaid.toString())}
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
                {remainingAmount === 0 && upfrontPaid > 0 && (
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
