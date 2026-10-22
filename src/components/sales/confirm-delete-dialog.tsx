"use client";

import { AlertTriangle, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  confirmLabel?: string;
  isPending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}

/**
 * Shared destructive-action confirmation modal.
 * Renders in a portal so it always appears above the invoice layout.
 */
export function ConfirmDeleteDialog({
  open,
  title,
  confirmLabel = "تأكيد الحذف",
  isPending,
  error,
  onClose,
  onConfirm,
  children,
}: ConfirmDeleteDialogProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <div
        className="bg-card w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl border border-border"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="font-semibold text-base">{title}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                لا يمكن التراجع عن هذا الإجراء بعد تأكيده.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-2 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm leading-7">
          {children}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-xs leading-6">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 min-w-[130px]"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {isPending ? "جارٍ التنفيذ..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
