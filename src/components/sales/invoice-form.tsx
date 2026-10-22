"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useForm,
  useFieldArray,
  useWatch,
  Controller,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InvoiceType } from "@prisma/client";
import { getZonedDateKey } from "@/lib/datetime";

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
  AlertTriangle,
} from "lucide-react";
import { cn, formatCurrency, calculateDiscountAmount, calculateNetTotal } from "@/lib/utils";
import { toast } from "sonner";
import {
  ClientCombobox,
  type ClientComboboxOption,
} from "@/components/sales/client-combobox";
import {
  SalesRepCombobox,
  type SalesRepOption,
} from "@/components/sales/sales-rep-combobox";
import {
  ProductCombobox,
  type ProductOption,
} from "@/components/sales/product-combobox";

interface PharmacyOption extends ClientComboboxOption {
  governorateId: string;
  currentBalance: number;
  creditLimit: number | null;
}

interface Props {
  pharmacies: PharmacyOption[];
  salesReps: SalesRepOption[];
  products: ProductOption[];
  initialClientId?: string;
  /** Sales reps must not be offered the legacy-debt workflow. */
  allowLegacy?: boolean;
}

const UpfrontPaymentItemSchema = z.object({
  productId: z.string(),
  paidQuantity: z.coerce.number().min(0).optional().default(0),
  unitPrice: z.coerce.number().min(0).optional().default(0),
});

const Schema = z.object({
  pharmacyId: z.string().min(1, "اختر العميل"),
  salesRepId: z.string().optional().nullable(),
  type: z.nativeEnum(InvoiceType),
  manualNumber: z.string().min(1, "رقم الفاتورة مطلوب"),
  discountType: z.nativeEnum(DiscountType).default(DiscountType.PERCENTAGE),
  discountValue: z.coerce.number().min(0).optional().default(0),
  paidAmount: z.coerce.number().min(0).optional().default(0),
  notes: z.string().optional(),
  isLegacy: z.boolean().optional().default(false),
  /// LEGACY DEBT: total debt amount — only used when isLegacy is true
  legacyDebtAmount: z.coerce.number().min(0).optional().default(0),
  issueDate: z.string().optional(),
  // Upfront itemized payment items (for CREDIT invoices)
  upfrontPaymentItems: z.array(UpfrontPaymentItemSchema).optional().default([]),
  items: z
    .array(
      z.object({
        productId: z.string().optional().default(""),
        quantity: z.coerce.number().optional().default(1),
        bonusQuantity: z.coerce.number().min(0).optional().default(0), // free boxes
        unitPrice: z.coerce.number().min(0).optional().default(0),
      })
    )
    .optional()
    .default([]),
}).superRefine((data, ctx) => {
  if (data.isLegacy) {
    if (!data.legacyDebtAmount || Number(data.legacyDebtAmount) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legacyDebtAmount"],
        message: "قيمة المديونية يجب أن تكون أكبر من 0",
      });
    }
  } else {
    if (!data.salesRepId || data.salesRepId.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["salesRepId"],
        message: "اختر المندوب",
      });
    }
    if (!data.items || data.items.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "أضف صنفاً واحداً على الأقل للفاتورة",
      });
    } else {
      data.items.forEach((item, index) => {
        if (!item.productId || item.productId.trim() === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["items", index, "productId"],
            message: "اختر منتجاً",
          });
        }
        if (!item.quantity || Number(item.quantity) <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["items", index, "quantity"],
            message: "يجب أن تكون الكمية موجبة",
          });
        }
      });
    }
  }
});

type FormData = z.input<typeof Schema>;

/** Client type filter — to let the user switch between Pharmacy / External Warehouse lists */
type ClientTypeFilter = "PHARMACY" | "EXTERNAL_WAREHOUSE" | "ALL";

export function InvoiceForm({
  pharmacies,
  salesReps,
  products,
  initialClientId,
  allowLegacy = true,
}: Props) {
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
      legacyDebtAmount: 0,
      issueDate: getZonedDateKey(new Date()),
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
  const legacyDebtAmount = useWatch({ control, name: "legacyDebtAmount" });
  const selectedPharmacyId = useWatch({ control, name: "pharmacyId" });

  // Selected client is resolved from the full list so the summary stays visible
  // even when the client-type filter changes.
  const selectedPharmacy = useMemo(
    () => pharmacies.find((p) => p.id === selectedPharmacyId) ?? null,
    [pharmacies, selectedPharmacyId]
  );

  // When isLegacy is toggled on, force the invoice type to CREDIT and clear salesRepId
  useEffect(() => {
    if (isLegacy) {
      setValue("type", InvoiceType.CREDIT, { shouldValidate: true });
      setValue("salesRepId", "");
    }
  }, [isLegacy, setValue]);

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
  // For LEGACY: subtotal is the manually-entered debt amount
  const itemsSubtotal =
    watchItems?.reduce(
      (sum: number, item: { quantity?: number; unitPrice?: number }) =>
        sum + (item.quantity || 0) * (item.unitPrice || 0),
      0
    ) || 0;

  const subtotal = isLegacy ? (Number(legacyDebtAmount) || 0) : itemsSubtotal;

  const discountAmount = isLegacy
    ? 0
    : calculateDiscountAmount(
        subtotal,
        discountType ?? DiscountType.PERCENTAGE,
        Number(discountValue ?? 0)
      );

  const total = isLegacy ? subtotal : calculateNetTotal(subtotal, discountAmount);

  // ── Proportional discount factor ──
  // Used to compute discountedUnitPrice per item for upfront payment and returns
  const discountFactor = itemsSubtotal > 0 ? total / itemsSubtotal : 1;

  // LEGACY invoices are always CREDIT (آجل)
  const isCash = !isLegacy && selectedType === InvoiceType.CASH;

  // Compute the upfront paid amount from itemized entries
  // LEGACY invoices always start with 0 paid (full amount deferred)
  const upfrontPaid = isLegacy
    ? 0
    : isCash
    ? total
    : Number(paidAmount || 0);
  const remainingAmount = Math.max(0, total - upfrontPaid);

  const invoiceDatePrefix = `INV-${getZonedDateKey(new Date()).replaceAll("-", "")}-`;

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    setValue(`items.${index}.unitPrice`, product?.sellingPrice ?? 0, {
      shouldValidate: true,
    });

    // Ensure the row is immediately sellable once a product is picked.
    if (product) {
      const quantity = Number(getValues(`items.${index}.quantity`));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setValue(`items.${index}.quantity`, 1, { shouldValidate: true });
      }
    }

    // Recalculate upfront items to use new discountedUnitPrice
    setTimeout(syncUpfrontItems, 0);
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
          productId: item.productId as string,
          paidQuantity: existing?.paidQuantity || 0,
          unitPrice: discountedPrice, // discountedUnitPrice
        };
      });
    setValue("upfrontPaymentItems", newUpfront, { shouldValidate: true });
  };

  const filteredClients = useMemo(
    () =>
      clientFilter === "ALL"
        ? pharmacies
        : pharmacies.filter((p) => p.clientType === clientFilter),
    [clientFilter, pharmacies]
  );

  const onSubmit = (data: FormData) => {
    if (data.isLegacy) {
      data.items = []; // Clear any hidden empty rows
    }
    setServerError(null);
    startTransition(async () => {
      const result = await createInvoice({
        ...data,
        salesRepId: data.isLegacy ? null : (data.salesRepId || null),
        discountType: data.discountType ?? DiscountType.PERCENTAGE,
        discountValue: data.discountValue ?? 0,
        paidAmount: data.paidAmount ?? 0,
        isLegacy: data.isLegacy ?? false,
        legacyDebtAmount: data.isLegacy ? (Number(data.legacyDebtAmount) || 0) : 0,
        issueDate: data.isLegacy && data.issueDate ? new Date(data.issueDate) : undefined,
        // upfrontPaymentItems carry discountedUnitPrice as unitPrice
        upfrontPaymentItems: data.isLegacy
          ? []
          : (data.upfrontPaymentItems ?? []).filter(
              (pi) => (pi.paidQuantity ?? 0) > 0
            ).map((pi) => ({
              ...pi,
              paidQuantity: pi.paidQuantity ?? 0,
              unitPrice: pi.unitPrice ?? 0, // discountedUnitPrice
            })),
        // LEGACY invoices have no items
        items: data.isLegacy
          ? []
          : (data.items ?? []).map((item) => ({
              productId: (item.productId || "") as string,
              quantity: (item.quantity || 1) as number,
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
            {allowLegacy && (
              <label className="text-xs font-semibold cursor-pointer text-amber-600 dark:text-amber-500 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/10 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/50">
                تسجيل مديونية/فاتورة سابقة
                <input
                  type="checkbox"
                  {...register("isLegacy")}
                  className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 border-amber-300"
                />
              </label>
            )}
          </div>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {isLegacy && (
            <div className="space-y-3 md:col-span-2 bg-amber-50/50 dark:bg-amber-900/5 p-4 rounded-xl border border-amber-200 dark:border-amber-900/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-amber-800 dark:text-amber-400">
                  ⚠️ تسجيل مديونية سابقة
                </span>
                <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                  آجل تلقائياً
                </span>
              </div>
              <p className="text-xs text-amber-700/80 dark:text-amber-500/80">
                لن يتم خصم المخزون لهذه الفاتورة، ولن تحتسب ضمن أهداف المندوبين عند الإنشاء.
              </p>
              {/* Debt Amount */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                  قيمة المديونية (ج.م) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  {...register("legacyDebtAmount", { valueAsNumber: true })}
                  placeholder="مثال: 5000.00"
                  className={cn(inputClass, "border-amber-300 dark:border-amber-700 text-lg font-bold text-amber-800 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-900/10")}
                />
                {(errors as any).legacyDebtAmount && (
                  <p className="text-red-500 text-xs">{(errors as any).legacyDebtAmount?.message}</p>
                )}
                {Number(legacyDebtAmount) > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    إجمالي المديونية: <span className="font-bold">{formatCurrency(String(legacyDebtAmount))}</span>
                  </p>
                )}
              </div>
              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                  تاريخ الفاتورة السابقة
                </label>
                <input
                  type="date"
                  {...register("issueDate")}
                  className={cn(inputClass, "border-amber-200 dark:border-amber-900/50")}
                />
              </div>
            </div>
          )}

          {/* Invoice Type Toggle — hidden for LEGACY (always CREDIT) */}
          {!isLegacy ? (
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
          ) : (
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">نوع الفاتورة</label>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 max-w-xs">
                <CreditCard className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">آجل (مثبت للمديونية)</span>
              </div>
              <input type="hidden" {...register("type")} value={InvoiceType.CREDIT} />
            </div>
          )}

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
            <div className="flex flex-wrap gap-1 mb-2">
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
            <Controller
              control={control}
              name="pharmacyId"
              render={({ field }) => (
                <ClientCombobox
                  options={filteredClients}
                  selectedClient={selectedPharmacy}
                  value={field.value ?? ""}
                  onChange={(clientId) => field.onChange(clientId)}
                  onBlur={field.onBlur}
                  invalid={Boolean(errors.pharmacyId)}
                  placeholder={`ابحث واختر العميل (${filteredClients.length} متاح)`}
                />
              )}
            />
            {errors.pharmacyId && (
              <p className="text-red-500 text-xs">{errors.pharmacyId.message}</p>
            )}

            {/* Selected client financial snapshot */}
            {selectedPharmacy && (
              <div className="mt-2 space-y-1.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-xs",
                      selectedPharmacy.currentBalance > 0
                        ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10"
                        : "border-border bg-muted/30"
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Wallet className="w-3.5 h-3.5" />
                      الرصيد الحالي
                    </span>
                    <span
                      className={cn(
                        "font-bold",
                        selectedPharmacy.currentBalance > 0
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-foreground"
                      )}
                    >
                      {formatCurrency(selectedPharmacy.currentBalance)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border bg-muted/30 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CreditCard className="w-3.5 h-3.5" />
                      الحد الائتماني
                    </span>
                    <span className="font-bold text-foreground">
                      {selectedPharmacy.creditLimit === null
                        ? "غير محدد"
                        : formatCurrency(selectedPharmacy.creditLimit)}
                    </span>
                  </div>
                </div>

                {selectedPharmacy.creditLimit !== null &&
                  selectedPharmacy.currentBalance > selectedPharmacy.creditLimit && (
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      العميل تجاوز الحد الائتماني المسموح به
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* Sales Rep */}
          {!isLegacy && (
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">مندوب المبيعات</label>
              <Controller
                control={control}
                name="salesRepId"
                render={({ field }) => (
                  <SalesRepCombobox
                    salesReps={salesReps}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={Boolean(errors.salesRepId)}
                  />
                )}
              />
              {errors.salesRepId && (
                <p className="text-red-500 text-xs">{errors.salesRepId.message}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Section 2: Invoice Items ────────────────────────────── */}
      {!isLegacy && (
        <>
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
                <Controller
                  control={control}
                  name={`items.${index}.productId`}
                  render={({ field }) => (
                    <ProductCombobox
                      products={products}
                      selectedGovernorateId={selectedPharmacy?.governorateId ?? null}
                      value={field.value ?? ""}
                      onChange={(productId) => {
                        field.onChange(productId);
                        handleProductChange(index, productId);
                      }}
                      onBlur={field.onBlur}
                      invalid={Boolean(errors.items?.[index]?.productId)}
                    />
                  )}
                />
                {errors.items?.[index]?.productId && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.items[index]?.productId?.message}
                  </p>
                )}
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
    </>
  )}

      {/* ─── Section 4: Payment ─────────────────────────────────── */}
      {isLegacy ? (
        <div className="bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-400">
                تسجيل مديونية سابقة — آجل بالكامل (رصيد سابق)
              </h3>
              <p className="text-xs text-amber-700/90 dark:text-amber-500/90 mt-1">
                سيتم قيد مبلغ <span className="font-bold text-amber-900 dark:text-amber-300">{formatCurrency(total.toString())}</span> كدين مستحق على العميل بدون دفعة أولى وبدون أي مساس بأرصدة المخازن أو أصناف المنتجات.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-6 text-xs text-amber-800 dark:text-amber-400 font-medium bg-amber-100/50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
                <div>إجمالي الدين المقيد: <span className="font-bold text-foreground">{formatCurrency(total.toString())}</span></div>
                <div>المدفوع حالياً: <span className="font-bold text-muted-foreground">0.00 ج.م</span></div>
                <div>المتبقي للدفع: <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(total.toString())}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
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
      )}

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
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors",
            isLegacy
              ? "bg-amber-600 hover:bg-amber-700 text-white"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          {isLegacy ? "تسجيل المديونية السابقة" : "إصدار الفاتورة"}
        </button>
      </div>
    </form>
  );
}
