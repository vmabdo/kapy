"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  StockMovementType,
  StockMovementSource,
  WarehouseType,
} from "@prisma/client";
import { createStockMovement } from "@/actions/inventory";
import { Plus, Trash2, Loader2, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────
interface Warehouse {
  id: string;
  name: string;
  type: WarehouseType;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

interface SalesRep {
  id: string;
  name: string;
  employeeCode: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Props {
  warehouses: Warehouse[];
  products: Product[];
  salesReps: SalesRep[];
  suppliers: Supplier[];
  defaultWarehouseId?: string;
}

// ── Schema ────────────────────────────────────────────────────
const Schema = z.object({
  movementType: z.nativeEnum(StockMovementType),
  source: z.nativeEnum(StockMovementSource),
  sourceWarehouseId: z.string().optional(),
  targetWarehouseId: z.string().optional(),
  supplierId: z.string().optional(),
  salesRepId: z.string().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "اختر منتجاً"),
        quantity: z.coerce.number().int().positive("كمية صحيحة مطلوبة"),
        unitCost: z.coerce.number().optional(),
        batchNumber: z.string().optional(),
      })
    )
    .min(1),
});

type FormData = z.infer<typeof Schema>;

// ── Movement type configs ─────────────────────────────────────
const MOVEMENT_PRESETS: Record<string, { label: string; type: StockMovementType; source: StockMovementSource; description: string }> = {
  receive_from_supplier: {
    label: "استلام من مورد",
    type: StockMovementType.INBOUND,
    source: StockMovementSource.SUPPLIER,
    description: "استلام بضاعة من مورد/مصنع إلى المخزن الرئيسي",
  },
  transfer_to_sub: {
    label: "تحويل إلى مخزن فرعي",
    type: StockMovementType.OUTBOUND,
    source: StockMovementSource.WAREHOUSE,
    description: "تحويل بضاعة من المخزن الرئيسي إلى مخزن فرعي",
  },
  issue_to_rep: {
    label: "صرف لمندوب",
    type: StockMovementType.OUTBOUND,
    source: StockMovementSource.SALES_REP,
    description: "صرف بضاعة لمندوب مبيعات للتوزيع",
  },
  return_from_rep: {
    label: "مرتجع من مندوب",
    type: StockMovementType.RETURN_INBOUND,
    source: StockMovementSource.SALES_REP,
    description: "استرداد بضاعة من مندوب المبيعات",
  },
  adjustment: {
    label: "تسوية مخزون",
    type: StockMovementType.ADJUSTMENT,
    source: StockMovementSource.WAREHOUSE,
    description: "تعديل يدوي لرصيد المخزون (جرد)",
  },
};

export function StockMovementForm({ warehouses, products, salesReps, suppliers, defaultWarehouseId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("receive_from_supplier");

  const mainWarehouses = warehouses.filter((w) => w.type === WarehouseType.MAIN);
  const subWarehouses = warehouses.filter((w) => w.type === WarehouseType.SUB);

  const preset = MOVEMENT_PRESETS[selectedPreset];

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      movementType: preset.type,
      source: preset.source,
      sourceWarehouseId: defaultWarehouseId,
      items: [{ productId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const handlePresetChange = (key: string) => {
    setSelectedPreset(key);
    const p = MOVEMENT_PRESETS[key];
    setValue("movementType", p.type);
    setValue("source", p.source);
  };

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createStockMovement(data);
      if (result.success) {
        router.push("/dashboard/inventory/movements");
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  const needsSupplier = selectedPreset === "receive_from_supplier";
  const needsSalesRep = selectedPreset === "issue_to_rep" || selectedPreset === "return_from_rep";
  const needsSourceWarehouse = ["transfer_to_sub", "issue_to_rep", "return_from_rep"].includes(selectedPreset);
  const needsTargetWarehouse = ["receive_from_supplier", "transfer_to_sub", "adjustment"].includes(selectedPreset);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" dir="rtl">
      {/* Preset Selector */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-primary" />
          نوع الحركة
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {Object.entries(MOVEMENT_PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              onClick={() => handlePresetChange(key)}
              className={cn(
                "p-3 rounded-xl border text-right transition-all duration-150 text-sm",
                selectedPreset === key
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-primary/30 text-muted-foreground hover:text-foreground"
              )}
            >
              <p className="font-semibold leading-tight">{p.label}</p>
              <p className="text-[10px] mt-1 opacity-70 leading-tight">{p.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Context Fields */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4">تفاصيل الحركة</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Supplier */}
          {needsSupplier && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">المورد</label>
              <select
                {...register("supplierId")}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">اختر المورد</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sales Rep */}
          {needsSalesRep && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">المندوب</label>
              <select
                {...register("salesRepId")}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">اختر المندوب</option>
                {salesReps.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.employeeCode})</option>
                ))}
              </select>
            </div>
          )}

          {/* Source Warehouse */}
          {needsSourceWarehouse && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">المخزن المصدر</label>
              <select
                {...register("sourceWarehouseId")}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">اختر المخزن</option>
                {(selectedPreset === "transfer_to_sub" ? mainWarehouses : warehouses).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Target Warehouse */}
          {needsTargetWarehouse && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {selectedPreset === "receive_from_supplier" ? "المخزن المستلم" : "المخزن الوجهة"}
              </label>
              <select
                {...register("targetWarehouseId")}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">اختر المخزن</option>
                {(selectedPreset === "transfer_to_sub" ? subWarehouses : warehouses).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Reference Number */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">رقم المرجع (اختياري)</label>
            <input
              {...register("referenceNumber")}
              placeholder="رقم بوليصة الشحن / أمر الصرف..."
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">ملاحظات (اختياري)</label>
            <textarea
              {...register("notes")}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm">المنتجات والكميات</h2>
          <button
            type="button"
            onClick={() => append({ productId: "", quantity: 1 })}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Plus className="w-4 h-4" />
            إضافة منتج
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className={`grid gap-3 items-start ${needsSupplier ? "grid-cols-12" : "grid-cols-10"}`}>
              {/* Product */}
              <div className={needsSupplier ? "col-span-5" : "col-span-7"}>
                {index === 0 && <label className="text-xs text-muted-foreground mb-1 block">المنتج</label>}
                <select
                  {...register(`items.${index}.productId`)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">اختر منتجاً...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
                {errors.items?.[index]?.productId && (
                  <p className="text-red-500 text-xs mt-1">{errors.items[index]?.productId?.message}</p>
                )}
              </div>

              {/* Quantity */}
              <div className="col-span-2">
                {index === 0 && <label className="text-xs text-muted-foreground mb-1 block">الكمية</label>}
                <input
                  type="number"
                  min={1}
                  {...register(`items.${index}.quantity`)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-center"
                />
              </div>

              {/* Unit Cost — only for supplier receipts */}
              {needsSupplier && (
                <div className="col-span-2">
                  {index === 0 && <label className="text-xs text-muted-foreground mb-1 block">سعر التكلفة</label>}
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...register(`items.${index}.unitCost`)}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-center"
                  />
                </div>
              )}

              {/* Batch */}
              <div className="col-span-2">
                {index === 0 && <label className="text-xs text-muted-foreground mb-1 block">رقم الدفعة</label>}
                <input
                  {...register(`items.${index}.batchNumber`)}
                  placeholder="اختياري"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Delete */}
              <div className={`col-span-1 flex items-center justify-center ${index === 0 ? "pt-5" : ""}`}>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {serverError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm">
          {serverError}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isPending}
          id="stock-movement-submit-btn"
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
          تسجيل الحركة
        </button>
      </div>
    </form>
  );
}
