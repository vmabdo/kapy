"use client";

import { useState, useTransition } from "react";
import { updateSystemPolicies } from "@/actions/settings";
import { Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  defaultCreditDays: number;
  lowStockThreshold: number;
}

const inputClass = cn(
  "w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm",
  "focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all"
);

export function SystemPoliciesForm({ defaultCreditDays, lowStockThreshold }: Props) {
  const [creditDays, setCreditDays] = useState(String(defaultCreditDays));
  const [threshold, setThreshold] = useState(String(lowStockThreshold));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const days = parseInt(creditDays);
    const thr = parseInt(threshold);
    if (isNaN(days) || days < 1 || days > 365) { setError("مهلة الائتمان يجب أن تكون بين 1 و 365 يوم"); return; }
    if (isNaN(thr) || thr < 0) { setError("حد المخزون يجب أن يكون 0 أو أكثر"); return; }

    startTransition(async () => {
      const result = await updateSystemPolicies({ defaultCreditDays: days, lowStockThreshold: thr });
      if (result.success) {
        setSuccess(result.message ?? "تم الحفظ بنجاح");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">مهلة الائتمان الافتراضية (أيام)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={creditDays}
            onChange={(e) => setCreditDays(e.target.value)}
            className={inputClass}
            id="credit-days-input"
          />
          <p className="text-[11px] text-muted-foreground">
            تُطبَّق تلقائياً على الفواتير الآجلة الجديدة
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">حد التنبيه لانخفاض المخزون (وحدات)</label>
          <input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className={inputClass}
            id="low-stock-threshold-input"
          />
          <p className="text-[11px] text-muted-foreground">
            يُرسَل تنبيه عند وصول المنتج لهذه الكمية
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 text-emerald-700 dark:text-emerald-400 text-sm">
          ✓ {success}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          id="save-policies-btn"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ الإعدادات
        </button>
      </div>
    </form>
  );
}
