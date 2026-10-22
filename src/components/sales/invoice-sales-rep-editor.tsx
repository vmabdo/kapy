"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { updateInvoiceSalesRep } from "@/actions/sales";

interface SalesRepOption {
  id: string;
  name: string;
  employeeCode: string;
}

interface Props {
  invoiceId: string;
  currentSalesRepId: string | null;
  salesReps: SalesRepOption[];
}

/**
 * Inline editor for the invoice's assigned sales rep.
 * This only changes metadata — stock, debt and treasury are untouched.
 */
export function InvoiceSalesRepEditor({
  invoiceId,
  currentSalesRepId,
  salesReps,
}: Props) {
  const router = useRouter();
  const [selectedRepId, setSelectedRepId] = useState(currentSalesRepId ?? "");
  const [isPending, startTransition] = useTransition();

  const hasChanges = selectedRepId !== (currentSalesRepId ?? "");

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateInvoiceSalesRep(
        invoiceId,
        selectedRepId || null
      );

      if (result.success) {
        toast.success(result.message ?? "تم تحديث المندوب بنجاح");
        router.refresh();
      } else {
        toast.error("تعذر تحديث المندوب", { description: result.error });
      }
    });
  };

  return (
    <div className="print:hidden mt-3">
      <label className="text-xs text-muted-foreground block mb-1.5">
        تعديل المندوب
      </label>
      <div className="flex items-center gap-2">
        <select
          value={selectedRepId}
          onChange={(event) => setSelectedRepId(event.target.value)}
          disabled={isPending}
          className="min-w-0 flex-1 h-9 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
        >
          <option value="">بدون مندوب / مديونية عامة</option>
          {salesReps.map((rep) => (
            <option key={rep.id} value={rep.id}>
              {rep.name} ({rep.employeeCode})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !hasChanges}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="حفظ المندوب"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          حفظ
        </button>
      </div>
    </div>
  );
}
