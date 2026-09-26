"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transferToRep, returnFromRep } from "@/actions/rep-custody";
import {
  Package,
  Truck,
  RotateCcw,
  X,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

interface Warehouse {
  id: string;
  name: string;
}

interface CustodyItem {
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  currentQty: number;
  issuedQty: number;
  soldQty: number;
  returnedQty: number;
}

interface Props {
  repId: string;
  products: Product[];
  warehouses: Warehouse[];
  custodyItems: CustodyItem[];
}

// ─── Shared Styles ───────────────────────────────────────────
const inputClass =
  "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all";

const selectClass =
  "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all";

// ─── Modal Backdrop ──────────────────────────────────────────
function ModalBackdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-lg bg-background border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// ─── Item Row (shared between both modals) ───────────────────
interface ItemRowProps {
  products: Product[];
  selectedProductId: string;
  quantity: string;
  onProductChange: (id: string) => void;
  onQuantityChange: (qty: string) => void;
  onRemove: () => void;
  maxQty?: number; // for return modal — rep's current qty
  custodyItems?: CustodyItem[];
}

function ItemRow({
  products,
  selectedProductId,
  quantity,
  onProductChange,
  onQuantityChange,
  onRemove,
  maxQty,
  custodyItems,
}: ItemRowProps) {
  const available =
    maxQty !== undefined
      ? maxQty
      : custodyItems
        ? custodyItems.find((c) => c.productId === selectedProductId)
            ?.currentQty ?? null
        : null;

  return (
    <div className="flex items-start gap-2 p-3 rounded-xl border border-border/60 bg-muted/20">
      <div className="flex-1 space-y-2">
        <select
          value={selectedProductId}
          onChange={(e) => onProductChange(e.target.value)}
          className={selectClass}
        >
          <option value="">— اختر منتجاً —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max={available ?? undefined}
            value={quantity}
            onChange={(e) => onQuantityChange(e.target.value)}
            placeholder="الكمية"
            className={cn(inputClass, "w-28")}
          />
          {available !== null && selectedProductId && (
            <span className="text-[11px] text-muted-foreground">
              المتاح:{" "}
              <span className={cn("font-semibold", available === 0 && "text-red-500")}>
                {available}
              </span>
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-1 p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Transfer to Rep Modal ───────────────────────────────────
function TransferToRepModal({
  repId,
  products,
  warehouses,
  onClose,
}: {
  repId: string;
  products: Product[];
  warehouses: Warehouse[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState(
    warehouses.length === 1 ? warehouses[0].id : ""
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ productId: "", quantity: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const addRow = () =>
    setItems((prev) => [...prev, { productId: "", quantity: "" }]);

  const removeRow = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const updateProduct = (index: number, productId: string) =>
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, productId } : item))
    );

  const updateQty = (index: number, quantity: string) =>
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity } : item))
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!warehouseId) {
      setError("اختر المخزن المصدر");
      return;
    }
    const validItems = items.filter(
      (it) => it.productId && Number(it.quantity) > 0
    );
    if (validItems.length === 0) {
      setError("أضف منتجاً واحداً على الأقل بكمية صحيحة");
      return;
    }

    startTransition(async () => {
      const result = await transferToRep({
        salesRepId: repId,
        warehouseId,
        notes: notes || undefined,
        items: validItems.map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
        })),
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 1200);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <ModalBackdrop onClose={onClose}>
      {/* Header */}
      <div className="sticky top-0 flex items-center justify-between p-5 border-b border-border bg-background rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="font-bold text-base text-foreground">
              صرف بضاعة للمندوب
            </h2>
            <p className="text-xs text-muted-foreground">
              نقل من المخزن إلى عهدة المندوب
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Warehouse selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            المخزن المصدر *
          </label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className={selectClass}
          >
            <option value="">— اختر المخزن —</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>
                {wh.name}
              </option>
            ))}
          </select>
        </div>

        {/* Products */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            المنتجات *
          </label>
          <div className="space-y-2">
            {items.map((item, index) => (
              <ItemRow
                key={index}
                products={products}
                selectedProductId={item.productId}
                quantity={item.quantity}
                onProductChange={(id) => updateProduct(index, id)}
                onQuantityChange={(qty) => updateQty(index, qty)}
                onRemove={() => removeRow(index)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors mt-1"
          >
            <Plus className="w-3.5 h-3.5" />
            إضافة منتج آخر
          </button>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            ملاحظات
          </label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات اختيارية..."
            className={inputClass}
          />
        </div>

        {/* Error / Success */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-xs">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="text-xs font-medium">تم صرف البضاعة للمندوب بنجاح ✓</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={isPending || success}
            id={`transfer-to-rep-submit-${repId}`}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
              "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 shadow-sm"
            )}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Truck className="w-4 h-4" />
            )}
            تأكيد الصرف
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

// ─── Return from Rep Modal ───────────────────────────────────
function ReturnFromRepModal({
  repId,
  products,
  warehouses,
  custodyItems,
  onClose,
}: {
  repId: string;
  products: Product[];
  warehouses: Warehouse[];
  custodyItems: CustodyItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState(
    warehouses.length === 1 ? warehouses[0].id : ""
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ productId: "", quantity: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Only show products that the rep actually has in custody
  const availableProducts = products.filter((p) =>
    custodyItems.some((c) => c.productId === p.id && c.currentQty > 0)
  );

  const addRow = () =>
    setItems((prev) => [...prev, { productId: "", quantity: "" }]);

  const removeRow = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const updateProduct = (index: number, productId: string) =>
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, productId } : item))
    );

  const updateQty = (index: number, quantity: string) =>
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity } : item))
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!warehouseId) {
      setError("اختر المخزن الهدف");
      return;
    }
    const validItems = items.filter(
      (it) => it.productId && Number(it.quantity) > 0
    );
    if (validItems.length === 0) {
      setError("أضف منتجاً واحداً على الأقل بكمية صحيحة");
      return;
    }

    // Client-side qty check
    for (const it of validItems) {
      const custody = custodyItems.find((c) => c.productId === it.productId);
      if (!custody || custody.currentQty < Number(it.quantity)) {
        setError(
          `الكمية المُدخلة لـ "${availableProducts.find((p) => p.id === it.productId)?.name}" أكبر من المتاح في العهدة (${custody?.currentQty ?? 0})`
        );
        return;
      }
    }

    startTransition(async () => {
      const result = await returnFromRep({
        salesRepId: repId,
        warehouseId,
        notes: notes || undefined,
        items: validItems.map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
        })),
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 1200);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <ModalBackdrop onClose={onClose}>
      {/* Header */}
      <div className="sticky top-0 flex items-center justify-between p-5 border-b border-border bg-background rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="font-bold text-base text-foreground">
              إرجاع بضاعة للمخزن
            </h2>
            <p className="text-xs text-muted-foreground">
              إعادة جزء من عهدة المندوب إلى المخزن
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Warehouse selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            المخزن المستلم *
          </label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className={selectClass}
          >
            <option value="">— اختر المخزن —</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>
                {wh.name}
              </option>
            ))}
          </select>
        </div>

        {availableProducts.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            <Boxes className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا توجد منتجات في عهدة المندوب</p>
          </div>
        ) : (
          <>
            {/* Products */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                المنتجات *
              </label>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <ItemRow
                    key={index}
                    products={availableProducts}
                    selectedProductId={item.productId}
                    quantity={item.quantity}
                    onProductChange={(id) => updateProduct(index, id)}
                    onQuantityChange={(qty) => updateQty(index, qty)}
                    onRemove={() => removeRow(index)}
                    maxQty={
                      item.productId
                        ? (custodyItems.find(
                            (c) => c.productId === item.productId
                          )?.currentQty ?? 0)
                        : undefined
                    }
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors mt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                إضافة منتج آخر
              </button>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                ملاحظات
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات اختيارية..."
                className={inputClass}
              />
            </div>
          </>
        )}

        {/* Error / Success */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-xs">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="text-xs font-medium">تم إرجاع البضاعة للمخزن بنجاح ✓</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={isPending || success || availableProducts.length === 0}
            id={`return-from-rep-submit-${repId}`}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
              "bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 shadow-sm"
            )}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            تأكيد الإرجاع
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

// ─── Main Component: Rep Custody Section ──────────────────────
export function RepCustodySection({
  repId,
  products,
  warehouses,
  custodyItems,
}: Props) {
  const [modal, setModal] = useState<"transfer" | "return" | null>(null);

  const totalItems = custodyItems.length;
  const totalUnits = custodyItems.reduce((s, c) => s + c.currentQty, 0);

  return (
    <>
      {/* Modals */}
      {modal === "transfer" && (
        <TransferToRepModal
          repId={repId}
          products={products}
          warehouses={warehouses}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "return" && (
        <ReturnFromRepModal
          repId={repId}
          products={products}
          warehouses={warehouses}
          custodyItems={custodyItems}
          onClose={() => setModal(null)}
        />
      )}

      {/* Section card */}
      <div className="section-card overflow-hidden">
        {/* Header */}
        <div className="section-card-header">
          <h3 className="section-card-title">
            <Package className="w-4 h-4 text-primary" />
            عهدة المندوب
            {totalItems > 0 && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({totalUnits} وحدة — {totalItems} منتج)
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button
              id={`transfer-to-rep-btn-${repId}`}
              onClick={() => setModal("transfer")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all",
                "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              )}
            >
              <Truck className="w-3.5 h-3.5" />
              صرف بضاعة
            </button>
            <button
              id={`return-from-rep-btn-${repId}`}
              onClick={() => setModal("return")}
              disabled={totalItems === 0}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all",
                "bg-amber-600 text-white hover:bg-amber-700 shadow-sm disabled:opacity-50"
              )}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              إرجاع بضاعة
            </button>
          </div>
        </div>

        {/* Custody Table */}
        {custodyItems.length === 0 ? (
          <div className="empty-state py-10">
            <Boxes className="empty-state-icon" />
            <p className="empty-state-title">لا توجد بضاعة في عهدة المندوب</p>
            <p className="empty-state-description">
              اضغط على &quot;صرف بضاعة&quot; لإضافة منتجات إلى عهدته
            </p>
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead className="data-table-header">
                <tr>
                  <th className="text-right">المنتج</th>
                  <th className="text-center">الرمز</th>
                  <th className="text-center">صُرف</th>
                  <th className="text-center">بِيع</th>
                  <th className="text-center">أُرجع</th>
                  <th className="text-center font-bold">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {custodyItems.map((item) => {
                  const pctSold =
                    item.issuedQty > 0
                      ? Math.round((item.soldQty / item.issuedQty) * 100)
                      : 0;
                  return (
                    <tr key={item.productId} className="data-table-row">
                      <td className="data-table-cell">
                        <p className="font-medium text-sm text-foreground">
                          {item.productName}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.productUnit}
                        </p>
                      </td>
                      <td className="data-table-cell text-center">
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.productSku}
                        </span>
                      </td>
                      <td className="data-table-cell text-center tabular-nums text-sm">
                        {item.issuedQty}
                      </td>
                      <td className="data-table-cell text-center">
                        <span className="tabular-nums text-sm text-blue-600 font-semibold">
                          {item.soldQty}
                        </span>
                        {pctSold > 0 && (
                          <span className="block text-[10px] text-muted-foreground">
                            {pctSold}%
                          </span>
                        )}
                      </td>
                      <td className="data-table-cell text-center tabular-nums text-sm text-amber-600">
                        {item.returnedQty}
                      </td>
                      <td className="data-table-cell text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded-full text-sm font-bold tabular-nums",
                            item.currentQty === 0
                              ? "bg-muted text-muted-foreground"
                              : item.currentQty <= 5
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          )}
                        >
                          {item.currentQty}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
