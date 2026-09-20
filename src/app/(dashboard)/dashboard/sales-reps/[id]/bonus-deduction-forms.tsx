"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRepBonus, addRepDeduction } from "@/actions/reps";
import { Gift, Minus, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  repId: string;
}

const inputClass =
  "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all";

function getCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function BonusDeductionForms({ repId }: Props) {
  const router = useRouter();
  const [openSection, setOpenSection] = useState<"bonus" | "deduction" | null>(null);

  // Bonus state
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusReason, setBonusReason] = useState("");
  const [bonusError, setBonusError] = useState<string | null>(null);
  const [bonusSuccess, setBonusSuccess] = useState(false);
  const [isPendingBonus, startBonus] = useTransition();

  // Deduction state
  const [dedAmount, setDedAmount] = useState("");
  const [dedReason, setDedReason] = useState("");
  const [dedError, setDedError] = useState<string | null>(null);
  const [dedSuccess, setDedSuccess] = useState(false);
  const [isPendingDed, startDed] = useTransition();

  const { year, month } = getCurrentYearMonth();

  const handleBonus = (e: React.FormEvent) => {
    e.preventDefault();
    setBonusError(null);
    setBonusSuccess(false);
    const amount = parseFloat(bonusAmount);
    if (!amount || amount <= 0) { setBonusError("أدخل مبلغاً صحيحاً"); return; }

    startBonus(async () => {
      const result = await addRepBonus({
        salesRepId: repId,
        amount,
        reason: bonusReason || undefined,
        periodYear: year,
        periodMonth: month,
      });
      if (result.success) {
        setBonusSuccess(true);
        setBonusAmount("");
        setBonusReason("");
        setTimeout(() => { setBonusSuccess(false); router.refresh(); }, 1500);
      } else {
        setBonusError(result.error);
      }
    });
  };

  const handleDeduction = (e: React.FormEvent) => {
    e.preventDefault();
    setDedError(null);
    setDedSuccess(false);
    const amount = parseFloat(dedAmount);
    if (!amount || amount <= 0) { setDedError("أدخل مبلغاً صحيحاً"); return; }

    startDed(async () => {
      const result = await addRepDeduction({
        salesRepId: repId,
        amount,
        reason: dedReason || undefined,
        periodYear: year,
        periodMonth: month,
      });
      if (result.success) {
        setDedSuccess(true);
        setDedAmount("");
        setDedReason("");
        setTimeout(() => { setDedSuccess(false); router.refresh(); }, 1500);
      } else {
        setDedError(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* Bonus Section */}
      <div className="section-card overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === "bonus" ? null : "bonus")}
          className="w-full section-card-header hover:bg-muted/40 transition-colors"
        >
          <span className="section-card-title">
            <Gift className="w-4 h-4 text-emerald-500" />
            إضافة مكافأة
          </span>
          {openSection === "bonus" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {openSection === "bonus" && (
          <form onSubmit={handleBonus} className="p-4 space-y-3 border-t border-border/50">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">المبلغ (ج.م) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={bonusAmount}
                onChange={(e) => setBonusAmount(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">السبب</label>
              <input
                value={bonusReason}
                onChange={(e) => setBonusReason(e.target.value)}
                placeholder="تميز في الأداء، تجاوز الهدف..."
                className={inputClass}
              />
            </div>
            {bonusError && <p className="text-red-500 text-xs">{bonusError}</p>}
            {bonusSuccess && <p className="text-emerald-600 text-xs font-medium">✓ تم إضافة المكافأة بنجاح</p>}
            <button
              type="submit"
              disabled={isPendingBonus}
              id={`add-bonus-btn-${repId}`}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors",
                "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              )}
            >
              {isPendingBonus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
              تسجيل المكافأة
            </button>
          </form>
        )}
      </div>

      {/* Deduction Section */}
      <div className="section-card overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === "deduction" ? null : "deduction")}
          className="w-full section-card-header hover:bg-muted/40 transition-colors"
        >
          <span className="section-card-title">
            <Minus className="w-4 h-4 text-red-500" />
            تسجيل خصم
          </span>
          {openSection === "deduction" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {openSection === "deduction" && (
          <form onSubmit={handleDeduction} className="p-4 space-y-3 border-t border-border/50">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">المبلغ (ج.م) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={dedAmount}
                onChange={(e) => setDedAmount(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">السبب</label>
              <input
                value={dedReason}
                onChange={(e) => setDedReason(e.target.value)}
                placeholder="تأخر، غياب، عجز..."
                className={inputClass}
              />
            </div>
            {dedError && <p className="text-red-500 text-xs">{dedError}</p>}
            {dedSuccess && <p className="text-emerald-600 text-xs font-medium">✓ تم تسجيل الخصم بنجاح</p>}
            <button
              type="submit"
              disabled={isPendingDed}
              id={`add-deduction-btn-${repId}`}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors",
                "bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              )}
            >
              {isPendingDed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minus className="w-4 h-4" />}
              تسجيل الخصم
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
