"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteProduct } from "@/actions/inventory";
import { Pencil, Trash2, MoreHorizontal, Loader2, X } from "lucide-react";

interface Props {
  productId: string;
  productName: string;
}

export function ProductRowActions({ productId, productName }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // Recalculate position whenever menu opens
  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX - 80, // align right-ish
      });
    }
    setShowMenu(true);
  };

  // Close menu on scroll
  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [showMenu]);

  const handleDelete = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deleteProduct(productId);
      if (result.success) {
        setShowConfirm(false);
        router.refresh();
      } else {
        setErrorMsg(result.error);
        setShowConfirm(false);
      }
    });
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="الإجراءات"
        id={`product-actions-${productId}`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Fixed dropdown — renders outside overflow-hidden table */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className="fixed z-50 w-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden py-1"
            style={{ top: menuPos.top, left: menuPos.left }}
            dir="rtl"
          >
            <Link
              href={`/dashboard/inventory/products/${productId}/edit`}
              onClick={() => setShowMenu(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors w-full"
            >
              <Pencil className="w-3.5 h-3.5 text-primary" />
              تعديل
            </Link>
            <button
              onClick={() => { setShowMenu(false); setShowConfirm(true); }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors w-full"
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف
            </button>
          </div>
        </>
      )}

      {/* Error Toast */}
      {errorMsg && (
        <div className="fixed bottom-6 left-6 z-50 max-w-sm p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 shadow-lg flex items-start gap-3">
          <p className="text-sm text-red-700 dark:text-red-400 flex-1">{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-6" dir="rtl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base">تأكيد الحذف</h3>
                <p className="text-xs text-muted-foreground">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              هل أنت متأكد من حذف المنتج <span className="font-semibold text-foreground">«{productName}»</span>؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
