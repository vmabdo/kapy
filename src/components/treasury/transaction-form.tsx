"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { TransactionType } from "@prisma/client";
import { recordTreasuryTransaction } from "@/actions/treasury";
import { Wallet, Loader2, ArrowDown, ArrowUp } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface Props {
  currentBalance: number;
}

const Schema = z.object({
  type: z.nativeEnum(TransactionType),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  category: z.string().min(1, "اختر تصنيف المعاملة"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof Schema>;

const CATEGORIES = {
  CASH_IN: ["مبيعات نقدية", "تحصيل مديونية", "رأس مال", "أخرى"],
  CASH_OUT: ["مصروفات تشغيل", "رواتب", "مدفوعات موردين", "إيجار", "أخرى"],
  TRANSFER_IN: ["تحويل داخلي"],
  TRANSFER_OUT: ["تحويل داخلي"],
};

export function TransactionForm({ currentBalance }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { type: TransactionType.CASH_IN },
  });

  const selectedType = watch("type");
  const watchAmount = watch("amount") || 0;
  const isOut = selectedType === TransactionType.CASH_OUT;
  const isOverBalance = isOut && watchAmount > currentBalance;

  const onSubmit = (data: FormData) => {
    if (isOverBalance) return;
    setServerError(null);
    startTransition(async () => {
      const result = await recordTreasuryTransaction(data);
      if (result.success) {
        reset(); // Clear form on success
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  };

  const inputClass = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" dir="rtl">
      {/* Type Toggle */}
      <div className="grid grid-cols-2 gap-2">
        <label className={cn(
          "flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors text-sm font-semibold",
          selectedType === TransactionType.CASH_IN
            ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
            : "border-border hover:bg-muted text-muted-foreground"
        )}>
          <input type="radio" value={TransactionType.CASH_IN} {...register("type")} className="sr-only" />
          <ArrowDown className="w-4 h-4" />
          إيداع (وارد)
        </label>
        <label className={cn(
          "flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors text-sm font-semibold",
          isOut
            ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
            : "border-border hover:bg-muted text-muted-foreground"
        )}>
          <input type="radio" value={TransactionType.CASH_OUT} {...register("type")} className="sr-only" />
          <ArrowUp className="w-4 h-4" />
          صرف (صادر)
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium flex justify-between">
          المبلغ (ج.م)
          {isOut && <span className="text-muted-foreground text-xs font-normal">الرصيد المتاح: {formatCurrency(currentBalance.toString())}</span>}
        </label>
        <input
          type="number" step="0.01"
          {...register("amount")}
          className={cn(inputClass, isOverBalance && "border-red-500 text-red-600 focus:ring-red-500/30")}
        />
        {errors.amount && <p className="text-red-500 text-xs">{errors.amount.message}</p>}
        {isOverBalance && <p className="text-red-500 text-xs">المبلغ المطلوب يتجاوز رصيد الخزينة المتاح</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">تصنيف المعاملة</label>
        <select {...register("category")} className={inputClass}>
          <option value="">اختر التصنيف...</option>
          {CATEGORIES[selectedType as keyof typeof CATEGORIES]?.map((cat: string) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        {errors.category && <p className="text-red-500 text-xs">{errors.category.message}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">المرجع (اختياري)</label>
        <input {...register("reference")} placeholder="رقم إيصال، أو سند قبض/صرف..." className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">البيان / ملاحظات (اختياري)</label>
        <textarea {...register("notes")} rows={2} className={cn(inputClass, "resize-none")} placeholder="تفاصيل إضافية..." />
      </div>

      {serverError && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || isOverBalance}
        className={cn(
          "w-full flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-colors",
          selectedType === TransactionType.CASH_IN ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
        )}
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
        تسجيل المعاملة
      </button>
    </form>
  );
}
