"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { InvoiceStatus, InvoiceType, UserRole } from "@prisma/client";
import { z } from "zod";
import { addDays } from "date-fns";

// ─── Schemas ──────────────────────────────────────────────────

const InvoiceItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive("الكمية يجب أن تكون أكبر من 0"),
  unitPrice: z.coerce.number().positive("السعر يجب أن يكون أكبر من 0"),
});

const CreateInvoiceSchema = z.object({
  pharmacyId: z.string().min(1, "اختر صيدلية"),
  salesRepId: z.string().min(1, "اختر المندوب"),
  type: z.nativeEnum(InvoiceType),
  notes: z.string().optional(),
  // Amount paid now (only applicable for CREDIT invoices with upfront partial payment)
  amountPaidNow: z.coerce.number().min(0).default(0),
  items: z.array(InvoiceItemSchema).min(1, "أضف منتجاً واحداً على الأقل"),
});

const RecordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  notes: z.string().optional(),
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

    // Calculate totals
    const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

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
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          pharmacyId: data.pharmacyId,
          salesRepId: data.salesRepId,
          type: data.type,
          status: initialStatus,
          subtotal: totalAmount,
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

      // 2. If there is an upfront payment (CASH or CREDIT with amountPaidNow > 0),
      //    create a Payment record for the treasury trail.
      if (amountPaidNow > 0) {
        await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            pharmacyId: data.pharmacyId,
            amount: amountPaidNow,
            method: "CASH",
            notes: isCash ? "دفع نقدي عند إصدار الفاتورة" : "دفعة مقدمة عند إصدار الفاتورة آجل",
          },
        });
      }

      // 3. Update Pharmacy Balance — only for the outstanding credit portion
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

        // Trigger alert if target reached
        const currentAchieved = Number(updatedTarget.achieved);
        const targetGoal = Number(updatedTarget.target);
        if (
          currentAchieved >= targetGoal &&
          currentAchieved - totalAmount < targetGoal // Only alert once when crossing threshold
        ) {
          await tx.alert.create({
            data: {
              type: "PHARMACY_TARGET_REACHED",
              pharmacyId: data.pharmacyId,
              title: "تحقيق الهدف الشهري!",
              message: `حققت صيدلية "${updatedTarget.pharmacy.name}" الهدف الشهري بنجاح (${targetGoal} ج.م)`,
            },
          });
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

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: data.invoiceId },
      });

      if (invoice.status === InvoiceStatus.PAID) {
        throw new Error("هذه الفاتورة مسددة بالكامل");
      }

      const currentPaid = Number(invoice.paidAmount);
      const currentRemaining = Number(invoice.remainingAmount);

      if (data.amount > currentRemaining) {
        throw new Error(`المبلغ المدفوع (${data.amount}) أكبر من المبلغ المتبقي (${currentRemaining})`);
      }

      const newPaidAmount = currentPaid + data.amount;
      const newRemainingAmount = currentRemaining - data.amount;
      const newStatus = newRemainingAmount <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

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
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          pharmacyId: invoice.pharmacyId,
          amount: data.amount,
          method: "CASH", // Default to cash for now
          referenceNo: data.notes,
        },
      });

      // 3. Update Pharmacy Balance (reduce debt)
      if (invoice.type === InvoiceType.CREDIT) {
        await tx.pharmacy.update({
          where: { id: invoice.pharmacyId },
          data: { currentBalance: { decrement: data.amount } },
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
