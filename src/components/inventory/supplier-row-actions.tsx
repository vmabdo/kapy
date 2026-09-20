"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { updateSupplier, deleteSupplier } from "@/actions/inventory";
import { Pencil, Trash2, MoreHorizontal, Loader2, X, Truck, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const Schema = z.object({
  name: z.string().min(2, "اسم المورد مطلوب"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("البريد غير صالح").optional().or(z.literal("")),
  address: z.string().optional(),
});

type FormData = z.input<typeof Schema>;

interface SupplierData {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface Props {
  supplier: SupplierData;
}

const inputClass = cn(
  "w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm",
  "focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all"
);

export function SupplierRowActions({ supplier }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [showEdit, setShowEdit] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
    },
  });

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX - 80,
      });
    }
    setShowMenu(true);
  };

  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [showMenu]);

  const openEdit = () => {
    reset({
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
    });
    setShowMenu(false);
    setShowEdit(true);
    setErrorMsg(null);
  };

  const onEdit = (data: FormData) => {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await updateSupplier(supplier.id, data as any);
      if (result.success) {
        setSuccessMsg(result.message ?? "تم التحديث");
        setTimeout(() => {
          setShowEdit(false);
          setSuccessMsg(null);
          router.refresh();
        }, 900);
      } else {
        setErrorMsg(result.error);
      }
    });
  };

  const handleDelete = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deleteSupplier(supplier.id);
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
        id={`supplier-actions-${supplier.id}`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Fixed dropdown — outside overflow-hidden table */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className="fixed z-50 w-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden py-1"
            style={{ top: menuPos.top, left: menuPos.left }}
            dir="rtl"
          >
            <button
              onClick={openEdit}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors w-full"
            >
              <Pencil className="w-3.5 h-3.5 text-primary" />
              تعديل
            </button>
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

      {/* Edit Modal */}
      {showEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                تعديل بيانات المورد
              </h2>
              <button
                onClick={() => setShowEdit(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onEdit)} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">اسم المورد / المصنع *</label>
                <input {...register("name")} className={inputClass} />
                {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">مسؤول التواصل</label>
                  <input {...register("contactPerson")} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">رقم الهاتف</label>
                  <input {...register("phone")} className={inputClass} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">البريد الإلكتروني</label>
                <input {...register("email")} type="email" className={inputClass} />
                {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">العنوان</label>
                <input {...register("address")} className={inputClass} />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 text-red-700 text-sm">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 text-emerald-700 text-sm">
                  ✓ {successMsg}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
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
              هل أنت متأكد من حذف المورد <span className="font-semibold text-foreground">«{supplier.name}»</span>؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
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
