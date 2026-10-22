"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteInvoicePayment } from "@/actions/sales";
import { formatCurrency } from "@/lib/utils";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

interface Props {
  paymentId: string;
  amount: number;
}

export function DeletePaymentButton({ paymentId, amount }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteInvoicePayment(paymentId);

      if (result.success) {
        toast.success(result.message ?? "تم حذف الدفعة بنجاح");
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
        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        title="حذف الدفعة"
        aria-label="حذف الدفعة"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <ConfirmDeleteDialog
        open={isOpen}
        title="حذف الدفعة وعكس أثرها"
        confirmLabel="حذف الدفعة"
        isPending={isPending}
        error={error}
        onClose={() => {
          if (!isPending) setIsOpen(false);
        }}
        onConfirm={handleConfirm}
      >
        <p className="text-foreground">
          سيتم حذف دفعة بقيمة{" "}
          <span className="font-bold text-red-600">
            {formatCurrency(amount.toString())}
          </span>
          .
        </p>

        <ul className="list-disc pr-5 space-y-1 text-muted-foreground">
          <li>سيتم خصم هذا المبلغ من رصيد الخزينة.</li>
          <li>سيتم إعادة المبلغ إلى مديونية العميل الحالية.</li>
          <li>سيتم إعادة حساب المبلغ المتبقي وحالة الفاتورة.</li>
          <li>سيتم إلغاء احتساب هذه الدفعة من مستهدفات المندوب.</li>
        </ul>
      </ConfirmDeleteDialog>
    </>
  );
}
