"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { recordInvoicePayment } from "@/actions/sales";
import { Banknote, Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface Props {
  invoiceId: string;
  remainingAmount: number;
}

const Schema = z.object({
  invoiceId: z.string(),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof Schema>;

export function PaymentForm({ invoiceId, remainingAmount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { invoiceId, amount: remainingAmount },
  });

  const watchAmount = watch("amount") || 0;
  const isOverAmount = watchAmount > remainingAmount;

  const onSubmit = (data: FormData) => {
    if (isOverAmount) return; // Prevent submission if over
    setServerError(null);
    startTransition(async () => {
      const result = await recordInvoicePayment(data);
      if (result.success) {
        setValue("amount", 0);
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  const inputClass = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  if (remainingAmount <= 0) return null; // Fully paid, hide form

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
        <Banknote className="w-4 h-4 text-green-600" />
        تسجيل دفعة (سداد)
      </h2>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium flex justify-between">
            المبلغ (ج.م)
            <span className="text-muted-foreground text-xs font-normal">المتبقي: {formatCurrency(remainingAmount.toString())}</span>
          </label>
          <input
            type="number"
            step="0.01"
            max={remainingAmount}
            {...register("amount")}
            className={cn(inputClass, isOverAmount && "border-red-500 focus:ring-red-500/30 text-red-600")}
          />
          {errors.amount && <p className="text-red-500 text-xs">{errors.amount.message}</p>}
          {isOverAmount && <p className="text-red-500 text-xs">المبلغ يتجاوز المتبقي</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">ملاحظات (المرجع)</label>
          <input {...register("notes")} placeholder="رقم إيصال، طريقة الدفع..." className={inputClass} />
        </div>

        {serverError && (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs">
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || isOverAmount}
          className="w-full flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
          تأكيد السداد
        </button>
      </form>
    </div>
  );
}
