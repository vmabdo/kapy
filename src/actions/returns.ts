"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { InvoiceStatus, InvoiceType, UserRole } from "@prisma/client";
import { z } from "zod";

const ReturnItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive("الكمية يجب أن تكون أكبر من 0"),
});

const ProcessReturnSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(ReturnItemSchema).min(1, "أضف منتجاً واحداً على الأقل"),
});

export async function processInvoiceReturn(
  formData: z.infer<typeof ProcessReturnSchema>
) {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.ACCOUNTANT,
    ]);

    const data = ProcessReturnSchema.parse(formData);

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: data.invoiceId },
        include: { items: true },
      });

      // Calculate the total return value and build return items
      let totalReturnAmount = 0;
      const returnItemsData = [];

      for (const returnItem of data.items) {
        // Find the corresponding item in the invoice to get its original price
        const invItem = invoice.items.find((i) => i.productId === returnItem.productId);
        if (!invItem) {
          throw new Error(`المنتج غير موجود في الفاتورة`);
        }
        if (returnItem.quantity > invItem.quantity) {
          throw new Error(`الكمية المرتجعة أكبر من الكمية المباعة للمنتج`);
        }

        const lineTotal = returnItem.quantity * Number(invItem.unitPrice);
        
        // Calculate proportional discount if there's a percentage discount on the invoice
        let discountedLineTotal = lineTotal;
        if (invoice.discountType === "PERCENTAGE" && Number(invoice.discountValue) > 0) {
          discountedLineTotal = lineTotal - (lineTotal * Number(invoice.discountValue) / 100);
        } else if (invoice.discountType === "FIXED" && Number(invoice.discountValue) > 0) {
           // Fixed discount distribution across all items based on value
           const subtotal = Number(invoice.subtotal);
           if(subtotal > 0) {
              const proportion = lineTotal / subtotal;
              discountedLineTotal = lineTotal - (Number(invoice.discountValue) * proportion);
           }
        }

        totalReturnAmount += discountedLineTotal;

        returnItemsData.push({
          productId: returnItem.productId,
          quantity: returnItem.quantity,
          unitPrice: Number(invItem.unitPrice),
          lineTotal: discountedLineTotal,
        });
      }

      // Generate Return Number
      const returnCount = await tx.return.count();
      const returnNumber = `RET-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${returnCount + 1}`;

      // 1. Create Return Record
      const returnRecord = await tx.return.create({
        data: {
          returnNumber,
          invoiceId: invoice.id,
          pharmacyId: invoice.pharmacyId,
          reason: data.reason,
          notes: data.notes,
          totalAmount: totalReturnAmount,
          items: {
            create: returnItemsData,
          },
        },
      });

      // 2. Return items to stock (assuming main warehouse for returns if none specified)
      const mainWarehouse = await tx.warehouse.findFirst({
        where: { type: "MAIN" },
      });

      if (mainWarehouse) {
        for (const item of data.items) {
          await tx.stockItem.upsert({
            where: {
              warehouseId_productId: {
                warehouseId: mainWarehouse.id,
                productId: item.productId,
              },
            },
            create: {
              warehouseId: mainWarehouse.id,
              productId: item.productId,
              quantity: item.quantity,
            },
            update: {
              quantity: { increment: item.quantity },
            },
          });
        }
      }

      // 3. Deduct from Invoice total and adjust balances
      const currentTotal = Number(invoice.total);
      const newTotal = currentTotal - totalReturnAmount;
      
      let newRemaining = Number(invoice.remainingAmount);
      let newPaid = Number(invoice.paidAmount);

      if (invoice.type === InvoiceType.CREDIT) {
        // First deduct from remaining balance
        if (totalReturnAmount <= newRemaining) {
          newRemaining -= totalReturnAmount;
          
          // Also reduce the pharmacy's debt
          await tx.pharmacy.update({
            where: { id: invoice.pharmacyId },
            data: { currentBalance: { decrement: totalReturnAmount } }
          });
        } else {
          // The return is bigger than the remaining balance (means they overpaid or it's fully paid)
          const difference = totalReturnAmount - newRemaining;
          
          // Reduce pharmacy debt by the remaining amount
          if (newRemaining > 0) {
             await tx.pharmacy.update({
              where: { id: invoice.pharmacyId },
              data: { currentBalance: { decrement: newRemaining } }
            });
          }
          
          newRemaining = 0;
          newPaid -= difference;
          
          // The difference should technically be refunded from Treasury or credited to the pharmacy's wallet.
          // For now, we will credit the pharmacy's balance negatively (acting as credit/wallet)
          await tx.pharmacy.update({
            where: { id: invoice.pharmacyId },
            data: { currentBalance: { decrement: difference } }
          });
        }
      } else {
        // Cash invoice
        newPaid -= totalReturnAmount;
        // Should ideally refund from treasury
      }

      // Update invoice status
      let newStatus = invoice.status;
      if (newTotal === 0) {
        newStatus = InvoiceStatus.CANCELLED;
      } else if (newRemaining <= 0.01) {
        newStatus = InvoiceStatus.PAID;
      } else if (newPaid > 0) {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          total: newTotal,
          remainingAmount: Math.max(0, newRemaining),
          paidAmount: Math.max(0, newPaid),
          status: newStatus,
        },
      });

      return returnRecord;
    });

    revalidatePath("/dashboard/sales");
    revalidatePath(`/dashboard/sales/${data.invoiceId}`);
    return { success: true, message: "تم تسجيل المرتجع بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}
