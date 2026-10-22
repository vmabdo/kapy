"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteInvoice } from "@/actions/sales";
import { formatCurrency } from "@/lib/utils";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  remainingAmount: number;
  isLegacy: boolean;
  hasReturns: boolean;
}

export function DeleteInvoiceButton({
  invoiceId,
  invoiceNumber,
  total,
  remainingAmount,
  isLegacy,
  hasReturns,
}: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteInvoice(invoiceId);

      if (result.success) {
        toast.success(result.message ?? "تم حذف الفاتورة بنجاح");
        setIsOpen(false);
        router.push("/dashboard/sales");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
        className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors shadow-sm"
      >
        <Trash2 className="w-4 h-4" />
        حذف الفاتورة وإلغاء أثرها
      </button>

      <ConfirmDeleteDialog
        open={isOpen}
        title={`حذف الفاتورة ${invoiceNumber}`}
        confirmLabel="حذف الفاتورة نهائياً"
        isPending={isPending}
        error={error}
        onClose={() => {
          if (!isPending) setIsOpen(false);
        }}
        onConfirm={handleConfirm}
      >
        <p className="text-foreground">
          سيتم حذف الفاتورة بقيمة{" "}
          <span className="font-bold">{formatCurrency(total.toString())}</span>{" "}
          وعكس جميع آثارها المالية والمخزنية.
        </p>

        <ul className="list-disc pr-5 space-y-1.5 text-muted-foreground">
          {!isLegacy && (
            <li>إرجاع جميع كميات الأصناف (بما فيها البونص) إلى مخزن المحافظة.</li>
          )}
          {isLegacy && (
            <li>حذف سند المديونية السابقة (لا يوجد أثر مخزني له).</li>
          )}
          <li>حذف جميع الدفعات المسجلة وخصم مبالغها من الخزينة.</li>
          <li>
            إلغاء أثر المبلغ المتبقي{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(remainingAmount.toString())}
            </span>{" "}
            من مديونية العميل.
          </li>
          <li>حذف سجل الفاتورة وأصنافها نهائياً من النظام.</li>
        </ul>

        {hasReturns && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs leading-6">
            هذه الفاتورة تحتوي على مرتجعات. يجب حذف المرتجعات المرتبطة بها أولاً،
            ثم إعادة المحاولة.
          </div>
        )}
      </ConfirmDeleteDialog>
    </>
  );
}
