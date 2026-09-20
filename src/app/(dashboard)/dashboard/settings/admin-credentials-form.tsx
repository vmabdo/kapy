"use client";

import { useState, useTransition } from "react";
import { updateAdminCredentials } from "@/actions/settings";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
}

const inputClass = cn(
  "w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm",
  "focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all"
);

export function AdminCredentialsForm({ userId }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword.trim()) { setError("أدخل كلمة المرور الحالية"); return; }
    if (!newEmail.trim() && !newPassword.trim()) { setError("أدخل بريداً إلكترونياً جديداً أو كلمة مرور جديدة"); return; }
    if (newPassword && newPassword !== confirmPassword) { setError("كلمة المرور الجديدة وتأكيدها غير متطابقتين"); return; }
    if (newPassword && newPassword.length < 6) { setError("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل"); return; }

    startTransition(async () => {
      const result = await updateAdminCredentials({
        userId,
        currentPassword,
        newEmail: newEmail || undefined,
        newPassword: newPassword || undefined,
      });

      if (result.success) {
        setSuccess(result.message ?? "تم التحديث بنجاح");
        setCurrentPassword("");
        setNewEmail("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Current Password — always required for security */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">كلمة المرور الحالية *</label>
        <div className="relative">
          <input
            type={showCurrent ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="أدخل كلمة مرورك الحالية"
            className={cn(inputClass, "pl-10")}
            id="current-password-input"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="border-t border-border/50 pt-4 space-y-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          ما تريد تغييره (اترك فارغاً إذا لا تريد التغيير)
        </p>

        {/* New email */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">البريد الإلكتروني الجديد</label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@kapypharma.com"
            className={inputClass}
            id="new-email-input"
            autoComplete="email"
          />
        </div>

        {/* New password */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">كلمة المرور الجديدة</label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="6 أحرف على الأقل"
              className={cn(inputClass, "pl-10")}
              id="new-password-input"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Confirm new password */}
        {newPassword && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">تأكيد كلمة المرور الجديدة</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="أعد إدخال كلمة المرور الجديدة"
              className={cn(
                inputClass,
                confirmPassword && confirmPassword !== newPassword
                  ? "border-red-400 focus:ring-red-400/25"
                  : ""
              )}
              id="confirm-password-input"
            />
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-red-500 text-xs">كلمتا المرور غير متطابقتين</p>
            )}
          </div>
        )}
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
          id="save-credentials-btn"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          تحديث بيانات الحساب
        </button>
      </div>
    </form>
  );
}
