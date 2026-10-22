"use client";

import { useMemo } from "react";
import { UserRound } from "lucide-react";
import {
  SearchableCombobox,
  type SearchableComboboxOption,
} from "@/components/ui/searchable-combobox";

export interface SalesRepOption {
  id: string;
  name: string;
  employeeCode: string;
}

interface SalesRepComboboxProps {
  salesReps: readonly SalesRepOption[];
  value: string;
  onChange: (salesRepId: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Searchable Sales Rep selector — filters by rep name or employee code as the
 * user types, and integrates with react-hook-form via `salesRepId`.
 */
export function SalesRepCombobox({
  salesReps,
  value,
  onChange,
  onBlur,
  invalid = false,
  disabled = false,
  className,
}: SalesRepComboboxProps) {
  const options = useMemo<SearchableComboboxOption[]>(
    () =>
      salesReps.map((rep) => ({
        value: rep.id,
        label: rep.name,
        description: rep.employeeCode,
        searchText: rep.employeeCode,
        icon: <UserRound className="h-3.5 w-3.5" />,
      })),
    [salesReps]
  );

  return (
    <SearchableCombobox
      id="invoice-sales-rep"
      options={options}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      invalid={invalid}
      disabled={disabled}
      placeholder={`ابحث واختر المندوب (${salesReps.length} متاح)`}
      searchPlaceholder="ابحث باسم المندوب أو كود الموظف..."
      emptyTitle="لا توجد نتائج مطابقة"
      emptyHint="جرّب البحث باسم المندوب أو كود الموظف"
      noOptionsTitle="لا يوجد مندوبون متاحون"
      noOptionsHint="أضف مندوب مبيعات أولاً أو فعّل مندوباً موجوداً"
      resultsNoun="مندوب"
      ariaLabel="مندوب المبيعات"
      listboxLabel="قائمة مندوبي المبيعات"
      className={className}
    />
  );
}
