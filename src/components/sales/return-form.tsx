"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { processInvoiceReturn } from "@/actions/returns";
import { Undo2, Plus, Trash2, X } from "lucide-react";
import { z } from "zod";
import { formatCurrency } from "@/lib/utils";
import { createPortal } from "react-dom";

const ReturnItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive("الكمية يجب أن تكون أكبر من 0"),
});

export const ProcessReturnSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(ReturnItemSchema).min(1, "أضف منتجاً واحداً على الأقل"),
});

type ReturnFormData = z.input<typeof ProcessReturnSchema>;

interface Props {
  invoiceId: string;
  invoiceItems: {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export function ReturnForm({ invoiceId, invoiceItems }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ReturnFormData>({
    resolver: zodResolver(ProcessReturnSchema),
    defaultValues: {
      invoiceId,
      reason: "",
      notes: "",
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const onSubmit = async (data: ReturnFormData) => {
    setServerError(null);
    const result = await processInvoiceReturn(data as any);
    if (result.success) {
      setIsOpen(false);
      form.reset();
    } else {
      setServerError(result.error || "حدث خطأ غير متوقع");
    }
  };

  const availableItems = invoiceItems.filter(
    (item) => !fields.find((field) => field.productId === item.productId)
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
      >
        <Undo2 className="w-4 h-4" />
        إضافة مرتجع للفاتورة
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-card w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl border border-border">
            
            <div className="flex justify-between items-center p-5 border-b border-border">
              <div>
                <h2 className="font-semibold text-lg">تسجيل مرتجع مبيعات</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  حدد المنتجات والكميات المرتجعة. سيتم استرجاع المنتجات إلى رصيد المخزن الرئيسي وخصم قيمتها من الفاتورة.
                </p>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-muted rounded-full">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5">
              {serverError && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
                  {serverError}
                </div>
              )}

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">المنتجات المرتجعة</h3>
                    {availableItems.length > 0 && (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted"
                        onClick={() => {
                          if (availableItems[0]) {
                            append({ productId: availableItems[0].productId, quantity: 1 });
                          }
                        }}
                      >
                        <Plus className="w-3 h-3" />
                        إضافة منتج للارتجاع
                      </button>
                    )}
                  </div>

                  {fields.length === 0 && (
                    <div className="text-center p-6 bg-muted/30 rounded-xl border border-border border-dashed">
                      <p className="text-sm text-muted-foreground">لم يتم اختيار أي منتجات للارتجاع</p>
                    </div>
                  )}
                  {form.formState.errors.items && fields.length === 0 && (
                     <p className="text-xs text-red-500 mt-1">{form.formState.errors.items.message}</p>
                  )}

                  {fields.map((field, index) => {
                    const selectedProductId = form.watch(`items.${index}.productId`);
                    const originalItem = invoiceItems.find((i) => i.productId === selectedProductId);
                    const maxQuantity = originalItem?.quantity || 1;
                    
                    const prodError = form.formState.errors.items?.[index]?.productId?.message;
                    const qtyError = form.formState.errors.items?.[index]?.quantity?.message;

                    return (
                      <div key={field.id} className="grid grid-cols-12 gap-3 items-end bg-muted/20 p-3 rounded-lg border border-border/50">
                        <div className="col-span-12 sm:col-span-6 space-y-1">
                          <label className="text-xs font-medium">المنتج</label>
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                            {...form.register(`items.${index}.productId`)}
                          >
                            <option value="">اختر المنتج</option>
                            {invoiceItems.map((item) => (
                              <option 
                                key={item.productId} 
                                value={item.productId}
                                disabled={
                                  item.productId !== selectedProductId && 
                                  fields.some(f => f.productId === item.productId)
                                }
                              >
                                {item.productName} (السعر: {formatCurrency(item.unitPrice.toString())})
                              </option>
                            ))}
                          </select>
                          {prodError && <p className="text-[10px] text-red-500">{prodError}</p>}
                        </div>
                        
                        <div className="col-span-9 sm:col-span-4 space-y-1">
                          <div className="flex justify-between">
                            <label className="text-xs font-medium">الكمية المرتجعة</label>
                            <span className="text-[10px] text-muted-foreground">أقصى حد: {maxQuantity}</span>
                          </div>
                          <input 
                            type="number" 
                            min={1} 
                            max={maxQuantity}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                            {...form.register(`items.${index}.quantity`)}
                          />
                          {qtyError && <p className="text-[10px] text-red-500">{qtyError}</p>}
                        </div>
                        
                        <div className="col-span-3 sm:col-span-2">
                          <button
                            type="button"
                            className="h-9 w-full flex justify-center items-center rounded-lg text-red-500 hover:bg-red-50"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">سبب الارتجاع (اختياري)</label>
                    <input 
                      type="text" 
                      placeholder="مثال: منتج تالف، خطأ في الطلبية..."
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                      {...form.register("reason")}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">ملاحظات إضافية (اختياري)</label>
                    <textarea 
                      placeholder="أي ملاحظات أخرى حول المرتجع..." 
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                      {...form.register("notes")}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <button 
                    type="button" 
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted"
                  >
                    إلغاء
                  </button>
                  <button 
                    type="submit" 
                    disabled={form.formState.isSubmitting}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {form.formState.isSubmitting ? "جاري الحفظ..." : "تأكيد المرتجع"}
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
}
