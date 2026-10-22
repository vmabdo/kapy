"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSalesReturn } from "@/actions/returns";
import { formatCurrency } from "@/lib/utils";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

interface Props {
  returnId: string;
  returnNumber: string;
  amount: number;
  isCashRefund: boolean;
}

export function DeleteReturnButton({
  returnId,
  returnNumber,
  amount,
  isCashRefund,
}: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteSalesReturn(returnId);

      if (result.success) {
        toast.success(result.message ?? "تم حذف المرتجع بنجاح");
        setIsOpen(false);
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
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        title="حذف المرتجع"
      >
        <Trash2 className="w-3.5 h-3.5" />
        حذف المرتجع
      </button>

      <ConfirmDeleteDialog
        open={isOpen}
        title={`حذف المرتجع ${returnNumber}`}
        confirmLabel="حذف المرتجع"
        isPending={isPending}
        error={error}
        onClose={() => {
          if (!isPending) setIsOpen(false);
        }}
        onConfirm={handleConfirm}
      >
        <p className="text-foreground">
          سيتم عكس مرتجع بقيمة{" "}
          <span className="font-bold text-red-600">
            {formatCurrency(amount.toString())}
          </span>
          .
        </p>

        <ul className="list-disc pr-5 space-y-1 text-muted-foreground">
          <li>
            سيتم خصم كميات المرتجع من المخزون (مع التحقق من توفرها أولاً).
          </li>
          {isCashRefund ? (
            <li>سيتم إلغاء أثر رد المبلغ النقدي من الخزينة.</li>
          ) : (
            <li>سيتم إعادة المبلغ إلى مديونية العميل والمتبقي على الفاتورة.</li>
          )}
          <li>سيتم حذف مستند المرتجع نهائياً من سجل الفاتورة.</li>
        </ul>
      </ConfirmDeleteDialog>
    </>
  );
}
