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

        // 3. ACCOUNTING: Deduct the return value from the legacy debt.
        // CRITICAL: This is NOT a treasury cash-in. It's an accounting reduction
        // of the legacy obligation. No money moves to the treasury.
        //
        // IMPORTANT: If the return is larger than the remaining balance, the
        // excess becomes a credit balance for the client (negative
        // currentBalance), exactly like a return on a standard CREDIT invoice.
        // The statement posts the full return amount as a credit, so the two
        // sides must use the same rule or the closing balance will drift.
        const currentRemaining = Number(invoice.remainingAmount);
        const currentPaid = Number(invoice.paidAmount);

        let newRemaining = currentRemaining;
        let newPaid = currentPaid;
        if (totalReturnAmount <= currentRemaining) {
          newRemaining -= totalReturnAmount;
        } else {
          const excess = totalReturnAmount - currentRemaining;
          newRemaining = 0;
          newPaid = Math.max(0, currentPaid - excess);
        }

        const newTotal = Math.max(0, Number(invoice.total) - totalReturnAmount);

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

        // Reduce the client's outstanding debt by the FULL return amount.
        // Over-returns intentionally produce a negative balance (client credit).
        await tx.pharmacy.update({
          where: { id: invoice.pharmacyId },
          data: { currentBalance: { decrement: totalReturnAmount } },
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

      // 3. Deduct from the invoice and adjust balances
      //
      // `invoice.total` is reduced for backward compatibility with the rest of
      // the app, but the account statement always reconstructs the ORIGINAL
      // gross amount from `subtotal - discountAmount` (frozen at creation).
      // Therefore the return is credited exactly once in the statement.
      const currentTotal = Number(invoice.total);
      const newTotal = Math.max(0, currentTotal - totalReturnAmount);

      let newRemaining = Number(invoice.remainingAmount);
      let newPaid = Number(invoice.paidAmount);

      if (invoice.type === InvoiceType.CREDIT) {
        // CREDIT return: always reduces the client's receivable balance.
        // If it exceeds the unpaid remaining amount, the excess becomes a
        // client credit (negative currentBalance) — never a cash refund here.
        if (totalReturnAmount <= newRemaining) {
          newRemaining -= totalReturnAmount;
        } else {
          const excess = totalReturnAmount - newRemaining;
          newRemaining = 0;
          newPaid = Math.max(0, newPaid - excess);
        }

        await tx.pharmacy.update({
          where: { id: invoice.pharmacyId },
          data: { currentBalance: { decrement: totalReturnAmount } },
        });
      } else {
        // CASH invoice: the client already paid in full, so this return is a
        // cash refund. It must NOT touch currentBalance and must NOT appear as
        // a debt-reducing credit in the account statement.
        newPaid = Math.max(0, newPaid - totalReturnAmount);
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
