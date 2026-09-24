"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { DiscountType, InvoiceStatus, InvoiceType, UserRole, TransactionType, TransactionCategory } from "@prisma/client";
import { z } from "zod";
import { addDays, format } from "date-fns";

// ─── Schemas ──────────────────────────────────────────────────

const InvoiceItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive("الكمية يجب أن تكون أكبر من 0"),
  unitPrice: z.coerce.number().positive("السعر يجب أن يكون أكبر من 0"),
});

const CreateInvoiceSchema = z.object({
  pharmacyId: z.string().min(1, "اختر العميل"),
  salesRepId: z.string().min(1, "اختر المندوب"),
  type: z.nativeEnum(InvoiceType),
  notes: z.string().optional(),
  manualNumber: z.string().min(1, "رقم الفاتورة مطلوب"),
  discountType: z.nativeEnum(DiscountType).default(DiscountType.PERCENTAGE),
  discountValue: z.coerce.number().min(0).default(0),
  // Amount paid now (only applicable for CREDIT invoices with upfront partial payment)
  amountPaidNow: z.coerce.number().min(0).default(0),
  items: z.array(InvoiceItemSchema).min(1, "أضف منتجاً واحداً على الأقل"),
});

const RecordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHECK"]).default("CASH"),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
  // Itemized payment items (optional — only for "Pay by Products" mode)
  paymentItems: z
    .array(
      z.object({
        productId: z.string().min(1),
        invoiceItemId: z.string().min(1),
        paidQuantity: z.coerce.number().int().positive(),
        unitPrice: z.coerce.number().positive(),
      })
    )
    .optional(),
});

// Schema for rep monthly product targets
const SetRepMonthlyTargetSchema = z.object({
  salesRepId: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      targetQuantity: z.coerce.number().int().positive("الكمية يجب أن تكون أكبر من 0"),
    })
  ).min(1, "أضف منتجاً واحداً على الأقل"),
});

type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

// ─── Actions ──────────────────────────────────────────────────

export async function createInvoice(
  formData: z.infer<typeof CreateInvoiceSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.SALES_REP,
    ]);

    const data = CreateInvoiceSchema.parse(formData);

    // Build invoice number: INV-YYYYMMDD-{manualNumber}
    const today = format(new Date(), "yyyyMMdd");
    const invoiceNumber = `INV-${today}-${data.manualNumber}`;

    // Check invoice number uniqueness
    const existing = await prisma.invoice.findUnique({ where: { invoiceNumber } });
    if (existing) {
      return { success: false, error: `رقم الفاتورة "${invoiceNumber}" موجود بالفعل. اختر رقماً مختلفاً.` };
    }

    // Calculate subtotal
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    // Calculate discount amount
    let discountAmount = 0;
    if (data.discountValue > 0) {
      if (data.discountType === DiscountType.PERCENTAGE) {
        discountAmount = (subtotal * data.discountValue) / 100;
      } else {
        discountAmount = data.discountValue;
      }
    }

    const totalAmount = Math.max(0, subtotal - discountAmount);

    // Get settings for credit days
    const settings = await prisma.appSettings.findFirst();
    const creditDays = settings?.defaultCreditDays ?? 30;

    let dueDate = null;
    if (data.type === InvoiceType.CREDIT) {
      dueDate = addDays(new Date(), creditDays);
    }

    // Determine initial payment state
    const isCash = data.type === InvoiceType.CASH;
    const amountPaidNow = isCash ? totalAmount : Math.min(data.amountPaidNow, totalAmount);
    const remainingAmount = totalAmount - amountPaidNow;

    let initialStatus: InvoiceStatus;
    if (remainingAmount <= 0) {
      initialStatus = InvoiceStatus.PAID;
    } else if (amountPaidNow > 0) {
      initialStatus = InvoiceStatus.PARTIALLY_PAID;
    } else {
      initialStatus = InvoiceStatus.CONFIRMED;
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Invoice
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          pharmacyId: data.pharmacyId,
          salesRepId: data.salesRepId,
          type: data.type,
          status: initialStatus,
          subtotal,
          discountType: data.discountType,
          discountValue: data.discountValue,
          discountAmount,
          total: totalAmount,
          paidAmount: amountPaidNow,
          remainingAmount,
          creditDays: data.type === InvoiceType.CREDIT ? creditDays : null,
          dueDate,
          notes: data.notes,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.quantity * item.unitPrice,
            })),
          },
        },
      });

      // 2. If there is an upfront payment, create a Payment record
      if (amountPaidNow > 0) {
        const payment = await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            pharmacyId: data.pharmacyId,
            amount: amountPaidNow,
            method: "CASH",
            notes: isCash ? "دفع نقدي عند إصدار الفاتورة" : "دفعة مقدمة عند إصدار الفاتورة آجل",
          },
        });

        // 2.1 Sync with Treasury
        let treasury = await tx.treasury.findFirst();
        if (!treasury) {
          treasury = await tx.treasury.create({ data: { name: "الخزينة الرئيسية", currentBalance: 0 } });
        }
        
        const newBalance = Number(treasury.currentBalance) + amountPaidNow;
        
        await tx.treasury.update({
          where: { id: treasury.id },
          data: { currentBalance: newBalance },
        });

        await tx.transaction.create({
          data: {
            treasuryId: treasury.id,
            type: TransactionType.CASH_IN,
            category: TransactionCategory.INVOICE_PAYMENT,
            amount: amountPaidNow,
            balanceAfter: newBalance,
            description: `تحصيل فاتورة رقم ${invoiceNumber}`,
            paymentId: payment.id,
          }
        });
      }

      // 3. Update Client Balance — only for the outstanding credit portion
      if (data.type === InvoiceType.CREDIT && remainingAmount > 0) {
        await tx.pharmacy.update({
          where: { id: data.pharmacyId },
          data: { currentBalance: { increment: remainingAmount } },
        });
      }

      // 4. Update Pharmacy Target Progress
      const currentMonth = new Date();
      const targetPeriod = await tx.pharmacyTargetPeriod.findFirst({
        where: {
          pharmacyId: data.pharmacyId,
          periodYear: currentMonth.getFullYear(),
          periodMonth: currentMonth.getMonth() + 1,
        },
      });

      if (targetPeriod) {
        const updatedTarget = await tx.pharmacyTargetPeriod.update({
          where: { id: targetPeriod.id },
          data: { achieved: { increment: totalAmount } },
          include: { pharmacy: { select: { name: true } } },
        });

        const currentAchieved = Number(updatedTarget.achieved);
        const targetGoal = Number(updatedTarget.target);
        if (
          currentAchieved >= targetGoal &&
          currentAchieved - totalAmount < targetGoal
        ) {
          await tx.alert.create({
            data: {
              type: "PHARMACY_TARGET_REACHED",
              pharmacyId: data.pharmacyId,
              title: "تحقيق الهدف الشهري!",
              message: `حققت "${updatedTarget.pharmacy.name}" الهدف الشهري بنجاح (${targetGoal} ج.م)`,
            },
          });
        }
      }

      // 5. Update Rep Monthly Product Targets (achievedQuantity)
      const now = new Date();
      const repMonthlyTarget = await tx.repMonthlyTarget.findUnique({
        where: {
          salesRepId_month_year: {
            salesRepId: data.salesRepId,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
        },
        include: { items: true },
      });

      if (repMonthlyTarget) {
        for (const invoiceItem of data.items) {
          const targetItem = repMonthlyTarget.items.find(
            (ti) => ti.productId === invoiceItem.productId
          );
          if (targetItem) {
            await tx.repMonthlyTargetItem.update({
              where: { id: targetItem.id },
              data: { achievedQuantity: { increment: invoiceItem.quantity } },
            });
          }
        }
      }

      return invoice;
    });

    revalidatePath("/dashboard/sales");
    revalidatePath(`/dashboard/pharmacies/${data.pharmacyId}`);
    return { success: true, data: { id: result.id }, message: "تم إصدار الفاتورة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function recordInvoicePayment(
  formData: z.infer<typeof RecordPaymentSchema>
): Promise<ActionResult> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.ACCOUNTANT,
      UserRole.SALES_MANAGER,
    ]);

    const data = RecordPaymentSchema.parse(formData);

    // If itemized, compute amount from the payment items
    let amount = data.amount;
    if (data.paymentItems && data.paymentItems.length > 0) {
      amount = data.paymentItems.reduce(
        (sum, pi) => sum + pi.paidQuantity * pi.unitPrice,
        0
      );
    }

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: data.invoiceId },
      });

      if (invoice.status === InvoiceStatus.PAID) {
        throw new Error("هذه الفاتورة مسددة بالكامل");
      }

      const currentPaid = Number(invoice.paidAmount);
      const currentRemaining = Number(invoice.remainingAmount);

      if (amount > currentRemaining + 0.01) {
        throw new Error(
          `المبلغ المدفوع (${amount.toFixed(2)}) أكبر من المبلغ المتبقي (${currentRemaining.toFixed(2)})`
        );
      }

      const newPaidAmount = currentPaid + amount;
      const newRemainingAmount = Math.max(0, currentRemaining - amount);
      const newStatus =
        newRemainingAmount <= 0.01
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID;

      // 1. Update Invoice
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
        },
      });

      // 2. Create Payment Record
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          pharmacyId: invoice.pharmacyId,
          amount,
          method: data.method ?? "CASH",
          referenceNo: data.referenceNo || null,
          notes: data.notes || null,
        },
      });

      // 2.1 Sync with Treasury
      let treasury = await tx.treasury.findFirst();
      if (!treasury) {
        treasury = await tx.treasury.create({ data: { name: "الخزينة الرئيسية", currentBalance: 0 } });
      }
      
      const newBalance = Number(treasury.currentBalance) + amount;
      
      await tx.treasury.update({
        where: { id: treasury.id },
        data: { currentBalance: newBalance },
      });

      await tx.transaction.create({
        data: {
          treasuryId: treasury.id,
          type: TransactionType.CASH_IN,
          category: TransactionCategory.INVOICE_PAYMENT,
          amount: amount,
          balanceAfter: newBalance,
          description: `تحصيل دفعة لفاتورة رقم ${invoice.invoiceNumber}`,
          paymentId: payment.id,
        }
      });

      // 3. If itemized, create PaymentItem records
      if (data.paymentItems && data.paymentItems.length > 0) {
        await tx.paymentItem.createMany({
          data: data.paymentItems.map((pi) => ({
            paymentId: payment.id,
            productId: pi.productId,
            paidQuantity: pi.paidQuantity,
            unitPrice: pi.unitPrice,
          })),
        });
      }

      // 4. Update Client Balance (reduce debt)
      if (invoice.type === InvoiceType.CREDIT) {
        await tx.pharmacy.update({
          where: { id: invoice.pharmacyId },
          data: { currentBalance: { decrement: amount } },
        });
      }
    });

    revalidatePath("/dashboard/sales");
    revalidatePath(`/dashboard/sales/${data.invoiceId}`);
    return { success: true, data: undefined, message: "تم تسجيل الدفعة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

// ─── Rep Monthly Product Targets ──────────────────────────────

export async function setRepMonthlyTarget(
  formData: z.infer<typeof SetRepMonthlyTargetSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);

    const data = SetRepMonthlyTargetSchema.parse(formData);

    const result = await prisma.$transaction(async (tx) => {
      // Upsert the parent target record
      const existing = await tx.repMonthlyTarget.findUnique({
        where: {
          salesRepId_month_year: {
            salesRepId: data.salesRepId,
            month: data.month,
            year: data.year,
          },
        },
      });

      let target;
      if (existing) {
        // Delete old items and re-create
        await tx.repMonthlyTargetItem.deleteMany({ where: { targetId: existing.id } });
        target = await tx.repMonthlyTarget.update({
          where: { id: existing.id },
          data: { notes: data.notes || null },
        });
      } else {
        target = await tx.repMonthlyTarget.create({
          data: {
            salesRepId: data.salesRepId,
            month: data.month,
            year: data.year,
            notes: data.notes || null,
          },
        });
      }

      // Create items
      await tx.repMonthlyTargetItem.createMany({
        data: data.items.map((item) => ({
          targetId: target.id,
          productId: item.productId,
          targetQuantity: item.targetQuantity,
          achievedQuantity: 0,
        })),
      });

      return target;
    });

    revalidatePath(`/dashboard/sales-reps/${data.salesRepId}`);
    revalidatePath("/dashboard/sales-reps");
    return { success: true, data: { id: result.id }, message: "تم حفظ الأهداف الشهرية بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function getRepMonthlyTarget(
  salesRepId: string,
  month: number,
  year: number
) {
  return prisma.repMonthlyTarget.findUnique({
    where: { salesRepId_month_year: { salesRepId, month, year } },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true } },
        },
      },
    },
  });
}
