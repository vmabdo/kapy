"use client";

import { useMemo } from "react";
import { Package } from "lucide-react";
import {
  SearchableCombobox,
  type SearchableComboboxOption,
} from "@/components/ui/searchable-combobox";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

export interface ProductOption {
  id: string;
  name: string;
  nameEn?: string | null;
  sku: string;
  unit: string;
  sellingPrice: number;
  /** Available quantity (quantity - reservedQty) keyed by governorate id. */
  stockByGovernorate: Record<string, number>;
  /** Total available quantity across sub-warehouses, used before a client is picked. */
  totalStock: number;
}

interface ProductComboboxProps {
  products: readonly ProductOption[];
  value: string;
  onChange: (productId: string) => void;
  /** When set, the stock badge reflects the client's governorate sub-warehouse. */
  selectedGovernorateId?: string | null;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

function StockBadge({ stock, unit }: { stock: number; unit: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        stock > 0
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400"
          : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
      )}
      title={`${formatNumber(stock, "ar-EG", { maximumFractionDigits: 2 })} ${unit} متاح`}
    >
      متوفر: {formatNumber(stock, "ar-EG", { maximumFractionDigits: 2 })}
    </span>
  );
}

/**
 * Searchable Product selector for invoice item rows.
 *
 * Filters instantly by product name (Arabic or English), SKU, unit or price,
 * and shows the available stock for the selected client's governorate.
 */
export function ProductCombobox({
  products,
  value,
  onChange,
  selectedGovernorateId,
  onBlur,
  invalid = false,
  disabled = false,
  className,
}: ProductComboboxProps) {
  const options = useMemo<SearchableComboboxOption[]>(
    () =>
      products.map((product) => {
        const stock = selectedGovernorateId
          ? (product.stockByGovernorate[selectedGovernorateId] ?? 0)
          : product.totalStock;

        return {
          value: product.id,
          label: product.name,
          description: [
            product.sku,
            product.unit,
            formatCurrency(product.sellingPrice),
          ]
            .filter(Boolean)
            .join(" · "),
          searchText: [product.nameEn, product.unit]
            .filter(Boolean)
            .join(" "),
          icon: <Package className="h-3.5 w-3.5" />,
          badge: <StockBadge stock={stock} unit={product.unit} />,
        };
      }),
    [products, selectedGovernorateId]
  );

  return (
    <SearchableCombobox
      options={options}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      invalid={invalid}
      disabled={disabled}
      placeholder={`ابحث واختر المنتج (${products.length} متاح)`}
      searchPlaceholder="ابحث باسم المنتج أو الكود..."
      emptyTitle="لا توجد نتائج مطابقة"
      emptyHint="جرّب البحث باسم المنتج أو الكود أو السعر"
      noOptionsTitle="لا توجد منتجات متاحة"
      noOptionsHint="أضف منتجات إلى المخزون أولاً"
      resultsNoun="منتج"
      ariaLabel="المنتج"
      listboxLabel="قائمة المنتجات"
      className={className}
    />
  );
}
