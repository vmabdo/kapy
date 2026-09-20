"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createProduct, createCategory, updateProduct, deleteCategory } from "@/actions/inventory";
import { Package, Loader2, Plus, X, Tag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductData {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  unit: string;
  packageSize: number;
  sellingPrice: number;
  costPrice?: number;
  vatRate: number;
  reorderLevel: number;
  requiresPrescription: boolean;
}

interface Props {
  categories: { id: string; name: string }[];
  product?: ProductData; // when provided, form is in edit mode
}

const Schema = z.object({
  name: z.string().min(2, "اسم المنتج مطلوب"),
  sku: z.string().min(1, "الرمز مطلوب"),
  categoryId: z.string().min(1, "اختر فئة"),
  unit: z.string().default("علبة"),
  packageSize: z.coerce.number().int().positive().default(1),
  sellingPrice: z.coerce.number().positive("أدخل سعر البيع"),
  costPrice: z.coerce.number().optional(),
  vatRate: z.coerce.number().min(0).max(100).default(0),
  reorderLevel: z.coerce.number().int().min(0).default(0),
  requiresPrescription: z.boolean().default(false),
});

type FormData = z.input<typeof Schema>;

const inputClass = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all";

// ── Inline Add Category Mini Dialog ────────────────────────────
function AddCategoryInline({
  categories,
  onCreated,
  onDeleted,
}: {
  categories: { id: string; name: string }[];
  onCreated: (cat: { id: string; name: string }) => void;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "add" | "manage">("idle");
  const [catName, setCatName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    if (!catName.trim() || catName.trim().length < 2) {
      setError("الاسم يجب أن يكون حرفين على الأقل");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createCategory({ name: catName.trim() });
      if (result.success) {
        onCreated({ id: result.data.id, name: catName.trim() });
        setCatName("");
        setMode("idle");
      } else {
        setError(result.error);
      }
    });
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (result.success) {
        onDeleted(id);
      } else {
        setError(result.error);
      }
      setDeletingId(null);
    });
  };

  if (mode === "idle") {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setMode("add")}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-all whitespace-nowrap"
        >
          <Plus className="w-3 h-3" />
          فئة جديدة
        </button>
        <button
          type="button"
          onClick={() => setMode("manage")}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-red-400/50 hover:text-red-500 transition-all whitespace-nowrap"
          title="حذف فئة"
        >
          <Trash2 className="w-3 h-3" />
          إدارة
        </button>
      </div>
    );
  }

  if (mode === "manage") {
    return (
      <div className="mt-2 p-3 bg-muted/40 rounded-xl border border-border/60 space-y-1" dir="rtl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">حذف فئة</span>
          <button type="button" onClick={() => { setMode("idle"); setError(null); }} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-background border border-border/50">
            <span className="text-xs text-foreground">{cat.name}</span>
            <button
              type="button"
              onClick={() => handleDelete(cat.id)}
              disabled={isPending && deletingId === cat.id}
              className="text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
            >
              {isPending && deletingId === cat.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1.5 p-2.5 bg-muted/40 rounded-xl border border-border/60">
      <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
      <input
        autoFocus
        value={catName}
        onChange={(e) => setCatName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
          if (e.key === "Escape") setMode("idle");
        }}
        placeholder="اسم الفئة الجديدة..."
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
      />
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending}
        className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60 hover:bg-primary/90 transition-colors"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "إضافة"}
      </button>
      <button type="button" onClick={() => setMode("idle")} className="text-muted-foreground hover:text-foreground">
        <X className="w-3.5 h-3.5" />
      </button>
      {error && <p className="text-red-500 text-xs absolute mt-14">{error}</p>}
    </div>
  );
}

// ── Main Product Form ──────────────────────────────────────────

export function ProductForm({ categories: initialCategories, product }: Props) {
  const router = useRouter();
  const isEditMode = !!product;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: product
      ? {
          name: product.name,
          sku: product.sku,
          categoryId: product.categoryId,
          unit: product.unit,
          packageSize: product.packageSize,
          sellingPrice: product.sellingPrice,
          costPrice: product.costPrice,
          vatRate: product.vatRate,
          reorderLevel: product.reorderLevel,
          requiresPrescription: product.requiresPrescription,
        }
      : { unit: "علبة", packageSize: 1, vatRate: 0, reorderLevel: 0 },
  });

  const selectedCategoryId = watch("categoryId");

  const handleCategoryCreated = (cat: { id: string; name: string }) => {
    setCategories((prev) => [...prev, cat]);
    setValue("categoryId", cat.id, { shouldValidate: true });
  };

  const handleCategoryDeleted = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const onSubmit = (data: FormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = isEditMode
        ? await updateProduct(product.id, data as any)
        : await createProduct(data as any);

      if (result.success) {
        router.push("/dashboard/inventory/products");
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  const Field = ({
    label,
    error,
    children,
    className,
  }: {
    label: string;
    error?: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" dir="rtl">
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-5 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          بيانات المنتج
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="اسم المنتج" error={errors.name?.message} className="sm:col-span-2">
            <input {...register("name")} placeholder="مثال: أموكسيسيلين 500 مجم" className={inputClass} />
          </Field>

          <Field label="رمز المنتج (SKU / باركود)" error={errors.sku?.message}>
            <input {...register("sku")} placeholder="مثال: AMX-500" className={inputClass} />
          </Field>

          {/* Category with inline add & delete */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground">الفئة</label>
              <AddCategoryInline
                categories={categories}
                onCreated={handleCategoryCreated}
                onDeleted={handleCategoryDeleted}
              />
            </div>
            <select
              {...register("categoryId")}
              className={inputClass}
              value={selectedCategoryId}
              onChange={(e) => setValue("categoryId", e.target.value, { shouldValidate: true })}
            >
              <option value="">اختر الفئة</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.categoryId && <p className="text-red-500 text-xs">{errors.categoryId.message}</p>}
          </div>

          <Field label="وحدة القياس" error={errors.unit?.message}>
            <input {...register("unit")} placeholder="علبة / شريط / زجاجة" className={inputClass} />
          </Field>

          <Field label="حجم العبوة (وحدات)" error={errors.packageSize?.message}>
            <input type="number" min={1} {...register("packageSize")} className={inputClass} />
          </Field>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-5">التسعير والضرائب</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="سعر البيع (ج.م)" error={errors.sellingPrice?.message}>
            <input type="number" step="0.01" {...register("sellingPrice")} placeholder="0.00" className={inputClass} />
          </Field>

          <Field label="سعر التكلفة (ج.م)" error={errors.costPrice?.message}>
            <input type="number" step="0.01" {...register("costPrice")} placeholder="0.00 (اختياري)" className={inputClass} />
          </Field>

          <Field label="نسبة ضريبة القيمة المضافة (%)" error={errors.vatRate?.message}>
            <input type="number" step="0.01" min={0} max={100} {...register("vatRate")} placeholder="0" className={inputClass} />
          </Field>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-5">إعدادات المخزون</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="مستوى إعادة الطلب (حد التنبيه)" error={errors.reorderLevel?.message}>
            <input type="number" min={0} {...register("reorderLevel")} placeholder="0" className={inputClass} />
          </Field>

          <div className="flex items-center gap-3 pt-7">
            <input
              type="checkbox"
              id="prescription"
              {...register("requiresPrescription")}
              className="w-4 h-4 rounded border-border text-primary"
            />
            <label htmlFor="prescription" className="text-sm font-medium cursor-pointer">
              يستلزم وصفة طبية
            </label>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm">
          {serverError}
        </div>
      )}

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
          id="product-form-submit-btn"
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
          {isEditMode ? "حفظ التعديلات" : "حفظ المنتج"}
        </button>
      </div>
    </form>
  );
}
