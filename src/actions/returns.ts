"use server";
import { handleActionError } from "@/lib/error-handler";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { InvoiceStatus, InvoiceType, UserRole } from "@prisma/client";
import { z } from "zod";

// ─── Item schemas ─────────────────────────────────────────────

// Standard return item — must match an invoice item
const ReturnItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من 0"),
});

// LEGACY return item — free product selection + manual price
const LegacyReturnItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من 0"),
  unitPrice: z.coerce.number().min(0, "السعر يجب أن يكون 0 أو أكبر"),
});

// ─── Union schema ──────────────────────────────────────────────

const ProcessReturnSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().optional(),
  notes: z.string().optional(),
  // Standard items (used when invoice.isLegacy === false)
  items: z.array(ReturnItemSchema).optional().default([]),
  // LEGACY items — free product, free price, free quantity
  legacyItems: z.array(LegacyReturnItemSchema).optional().default([]),
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
        include: {
          items: true,
          pharmacy: { select: { governorateId: true, name: true } },
        },
      });

      // ── Find the SUB-warehouse in the client's governorate for returns ──
      const subWarehouse = await tx.warehouse.findFirst({
        where: {
          type: "SUB",
          governorateId: invoice.pharmacy.governorateId,
          isActive: true,
        },
      });

      // Fallback to MAIN warehouse if no SUB found
      const targetWarehouse =
        subWarehouse ??
        (await tx.warehouse.findFirst({ where: { type: "MAIN" } }));

      // Generate Return Number
      const returnCount = await tx.return.count();
      const returnNumber = `RET-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${returnCount + 1}`;

      // ══════════════════════════════════════════════════════════════
      // LEGACY INVOICE RETURN FLOW
      // ══════════════════════════════════════════════════════════════
      if (invoice.isLegacy) {
        const legacyItems = data.legacyItems ?? [];
        if (legacyItems.length === 0) {
          throw new Error("أضف منتجاً واحداً على الأقل للارتجاع");
        }

        // Calculate total return amount from manually-entered prices
        let totalReturnAmount = 0;
        const returnItemsData = legacyItems.map((item) => {
          const lineTotal = item.quantity * item.unitPrice;
          totalReturnAmount += lineTotal;
          return {
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal,
          };
        });

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

        // 2. INCREASE stock in pharmacy's governorate warehouse
        // LEGACY returns go back into the client's governorate warehouse
        if (targetWarehouse) {
          for (const item of legacyItems) {
            await tx.stockItem.upsert({
              where: {
                warehouseId_productId: {
                  warehouseId: targetWarehouse.id,
                  productId: item.productId,
                },
              },
              create: {
                warehouseId: targetWarehouse.id,
                productId: item.productId,
                quantity: item.quantity,
              },
              update: {
                quantity: { increment: item.quantity },
              },
            });
          }

          // Record stock movement for audit trail
          await tx.stockMovement.create({
            data: {
              movementType: "RETURN_INBOUND",
              source: "PHARMACY",
              targetWarehouseId: targetWarehouse.id,
              notes: `مرتجع مديونية سابقة رقم ${returnNumber} من ${invoice.pharmacy.name}`,
              items: {
                create: legacyItems.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                })),
              },
            },
          });
        }

        // 3. ACCOUNTING: Deduct return value from invoice remaining balance ONLY.
        // CRITICAL: This is NOT a treasury cash-in. It's an accounting reduction
        // of the legacy debt. No money moves to the treasury.
        const currentRemaining = Number(invoice.remainingAmount);
        const newRemaining = Math.max(0, currentRemaining - totalReturnAmount);
        const newPaid = Number(invoice.paidAmount);

        let newStatus = invoice.status;
        const newTotal = Math.max(0, Number(invoice.total) - totalReturnAmount);
        if (newTotal <= 0) {
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
            remainingAmount: newRemaining,
            status: newStatus,
          },
        });

        // Also reduce the pharmacy's outstanding debt (balance) since the return
        // effectively cancels part of their legacy obligation
        await tx.pharmacy.update({
          where: { id: invoice.pharmacyId },
          data: { currentBalance: { decrement: Math.min(totalReturnAmount, currentRemaining) } },
        });

        // NOTE: CRITICAL — Returns NEVER affect rep targets.
        // We do NOT touch RepMonthlyTargetItem achievedQuantity here.

        return returnRecord;
      }

      // ══════════════════════════════════════════════════════════════
      // STANDARD INVOICE RETURN FLOW (unchanged)
      // ══════════════════════════════════════════════════════════════
      const standardItems = data.items ?? [];
      if (standardItems.length === 0) {
        throw new Error("أضف منتجاً واحداً على الأقل للارتجاع");
      }

      let totalReturnAmount = 0;
      const returnItemsData = [];

      for (const returnItem of standardItems) {
        // Find the corresponding item in the invoice to get its discountedUnitPrice
        const invItem = invoice.items.find((i) => i.productId === returnItem.productId);
        if (!invItem) {
          throw new Error(`المنتج غير موجود في الفاتورة`);
        }
        if (returnItem.quantity > Number(invItem.quantity)) {
          throw new Error(`الكمية المرتجعة أكبر من الكمية المباعة للمنتج`);
        }

        // CRITICAL: Use discountedUnitPrice — this is the effective price per unit
        // after the invoice discount was applied, stored at invoice creation time.
        const effectiveUnitPrice = Number(invItem.discountedUnitPrice) > 0
          ? Number(invItem.discountedUnitPrice)
          : Number(invItem.unitPrice); // fallback for legacy invoices without discountedUnitPrice

        const discountedLineTotal = returnItem.quantity * effectiveUnitPrice;

        totalReturnAmount += discountedLineTotal;

        returnItemsData.push({
          productId: returnItem.productId,
          quantity: returnItem.quantity,
          unitPrice: effectiveUnitPrice,
          lineTotal: discountedLineTotal,
        });
      }

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

      // 2. Return items to the client's governorate warehouse
      if (targetWarehouse) {
        for (const item of standardItems) {
          await tx.stockItem.upsert({
            where: {
              warehouseId_productId: {
                warehouseId: targetWarehouse.id,
                productId: item.productId,
              },
            },
            create: {
              warehouseId: targetWarehouse.id,
              productId: item.productId,
              quantity: item.quantity,
            },
            update: {
              quantity: { increment: item.quantity },
            },
          });
        }

        // Record the stock movement for audit trail
        await tx.stockMovement.create({
          data: {
            movementType: "RETURN_INBOUND",
            source: "PHARMACY",
            targetWarehouseId: targetWarehouse.id,
            notes: `مرتجع رقم ${returnNumber} من ${invoice.pharmacy.name}`,
            items: {
              create: standardItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
        });
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
            data: { currentBalance: { decrement: totalReturnAmount } },
          });
        } else {
          // The return is bigger than the remaining balance
          const difference = totalReturnAmount - newRemaining;

          // Reduce pharmacy debt by the remaining amount
          if (newRemaining > 0) {
            await tx.pharmacy.update({
              where: { id: invoice.pharmacyId },
              data: { currentBalance: { decrement: newRemaining } },
            });
          }

          newRemaining = 0;
          newPaid -= difference;

          // Credit the pharmacy's balance (acts as credit/wallet)
          await tx.pharmacy.update({
            where: { id: invoice.pharmacyId },
            data: { currentBalance: { decrement: difference } },
          });
        }
      } else {
        // Cash invoice
        newPaid -= totalReturnAmount;
      }

      // Update invoice status
      let newStatus = invoice.status;
      if (newTotal <= 0) {
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
    return { success: false, error: handleActionError(e) };
  }
}
