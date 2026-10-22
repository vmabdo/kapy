"use server";
import { handleActionError } from "@/lib/error-handler";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { decrementStockOrThrow } from "@/lib/stock";
import { getOrCreateTreasury } from "@/lib/treasury";
import { revalidatePath } from "next/cache";
import {
  InvoiceStatus,
  InvoiceType,
  TransactionType,
  UserRole,
} from "@prisma/client";
import { z } from "zod";

// ─── Reversal helpers ─────────────────────────────────────────

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Matches a return number only when it appears as a complete token.
 * Prevents RET-202610-1 from matching RET-202610-10.
 */
function containsExactReference(
  value: string | null | undefined,
  reference: string
): boolean {
  if (!value) return false;
  if (value === reference) return true;

  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`).test(value);
}

function resolveInvoiceStatus(
  total: number,
  paidAmount: number,
  remainingAmount: number
): InvoiceStatus {
  if (total <= 0.005) return InvoiceStatus.CANCELLED;
  if (remainingAmount <= 0.005) return InvoiceStatus.PAID;
  if (paidAmount > 0.005) return InvoiceStatus.PARTIALLY_PAID;
  return InvoiceStatus.CONFIRMED;
}

function revalidateReturnRelatedPaths(options: {
  invoiceId?: string;
  pharmacyId?: string;
}) {
  revalidatePath("/dashboard/sales");
  if (options.invoiceId) {
    revalidatePath(`/dashboard/sales/${options.invoiceId}`);
  }
  if (options.pharmacyId) {
    revalidatePath("/dashboard/pharmacies");
    revalidatePath(`/dashboard/pharmacies/${options.pharmacyId}`);
    revalidatePath(`/dashboard/pharmacies/${options.pharmacyId}/statement`);
    revalidatePath("/dashboard/companies");
    revalidatePath(`/dashboard/companies/${options.pharmacyId}`);
    revalidatePath(`/dashboard/companies/${options.pharmacyId}/statement`);
  }
  revalidatePath("/dashboard/treasury");
  revalidatePath("/dashboard/reps");
  revalidatePath("/dashboard/sales-reps");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/reports/daily");
}

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
      // Serialize all returns for this invoice. This row lock makes the
      // cumulative-quantity check below safe against simultaneous requests.
      await tx.$queryRaw`
        SELECT id FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE
      `;

      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: data.invoiceId },
        include: {
          items: true,
          pharmacy: { select: { governorateId: true, name: true } },
        },
      });

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new Error("لا يمكن تسجيل مرتجع على فاتورة ملغاة بالكامل");
      }

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
          const lineTotal = roundMoney(item.quantity * item.unitPrice);
          totalReturnAmount = roundMoney(totalReturnAmount + lineTotal);
          return {
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal,
          };
        });

        // A legacy invoice has no item rows, so cap returns by its original
        // monetary value. This prevents repeated "returns" from creating
        // unlimited stock/client credit.
        const priorLegacyReturns = await tx.return.aggregate({
          where: { invoiceId: invoice.id },
          _sum: { totalAmount: true },
        });
        const originalLegacyDebt = roundMoney(
          Number(invoice.subtotal) - Number(invoice.discountAmount)
        );
        const alreadyReturned = roundMoney(
          Number(priorLegacyReturns._sum.totalAmount ?? 0)
        );
        const returnableAmount = roundMoney(
          Math.max(0, originalLegacyDebt - alreadyReturned)
        );

        if (totalReturnAmount > returnableAmount + 0.005) {
          throw new Error(
            `قيمة المرتجع (${totalReturnAmount.toFixed(2)}) أكبر من المتبقي القابل للارتجاع (${returnableAmount.toFixed(2)})`
          );
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

        let newStatus: InvoiceStatus = invoice.status;
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

      // Cumulative quantities already returned for this invoice.
      const priorReturnItems = await tx.returnItem.findMany({
        where: { return: { invoiceId: invoice.id } },
        select: { productId: true, quantity: true },
      });
      const priorReturnedByProduct = new Map<string, number>();
      for (const item of priorReturnItems) {
        priorReturnedByProduct.set(
          item.productId,
          (priorReturnedByProduct.get(item.productId) ?? 0) +
            Number(item.quantity)
        );
      }

      // Aggregate invoice rows by product so duplicate lines are handled
      // correctly. The weighted net value preserves the invoice-level
      // discount when the return is posted.
      const invoiceSubtotal = Number(invoice.subtotal);
      const invoiceNetTotal = Math.max(
        0,
        invoiceSubtotal - Number(invoice.discountAmount)
      );
      const invoiceDiscountFactor =
        invoiceSubtotal > 0 ? invoiceNetTotal / invoiceSubtotal : 1;

      const invoiceItemsByProduct = new Map<
        string,
        { quantity: number; netValue: number }
      >();
      for (const item of invoice.items) {
        const quantity = Number(item.quantity);
        const storedDiscountedPrice = Number(item.discountedUnitPrice);
        const effectiveUnitPrice =
          storedDiscountedPrice > 0
            ? storedDiscountedPrice
            : Number(item.unitPrice) * invoiceDiscountFactor;

        const existing = invoiceItemsByProduct.get(item.productId);
        invoiceItemsByProduct.set(item.productId, {
          quantity: (existing?.quantity ?? 0) + quantity,
          netValue:
            (existing?.netValue ?? 0) + quantity * effectiveUnitPrice,
        });
      }

      // Aggregate the request as well: two rows for the same product must not
      // each pass the limit independently.
      const requestedByProduct = new Map<string, number>();
      for (const item of standardItems) {
        requestedByProduct.set(
          item.productId,
          (requestedByProduct.get(item.productId) ?? 0) + item.quantity
        );
      }

      let totalReturnAmount = 0;
      const returnItemsData: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }> = [];

      for (const [productId, quantity] of Array.from(
        requestedByProduct.entries()
      )) {
        const invoiceItem = invoiceItemsByProduct.get(productId);
        if (!invoiceItem) {
          throw new Error("المنتج غير موجود في الفاتورة");
        }

        const alreadyReturned = priorReturnedByProduct.get(productId) ?? 0;
        const remainingQuantity = invoiceItem.quantity - alreadyReturned;

        if (quantity > remainingQuantity + 1e-9) {
          throw new Error(
            `الكمية المرتجعة من المنتج أكبر من الكمية المتبقية. ` +
              `المتاح للارتجاع: ${Math.max(0, remainingQuantity)}، المطلوب: ${quantity}`
          );
        }

        const effectiveUnitPrice =
          invoiceItem.quantity > 0
            ? invoiceItem.netValue / invoiceItem.quantity
            : 0;
        const lineTotal = roundMoney(quantity * effectiveUnitPrice);

        totalReturnAmount = roundMoney(totalReturnAmount + lineTotal);
        returnItemsData.push({
          productId,
          quantity,
          unitPrice: roundMoney(effectiveUnitPrice),
          lineTotal,
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
        for (const item of returnItemsData) {
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
              create: returnItemsData.map((item) => ({
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
      let newStatus: InvoiceStatus = invoice.status;
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

/**
 * Atomically reverses and deletes a sales return.
 *
 * Stock that the return originally added must still be in the warehouse. If it
 * has already been sold/transferred, the deletion is rejected instead of
 * pushing stock negative.
 *
 * Credit/debt returns restore the invoice receivable and the client balance.
 * Cash refunds restore the invoice paid amount and remove the treasury outflow
 * (when one exists).
 */
export async function deleteSalesReturn(
  returnId: string
): Promise<{ success: true; message: string } | { success: false; error: string }> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.ACCOUNTANT,
    ]);

    if (!returnId || returnId.trim() === "") {
      throw new Error("معرف المرتجع مطلوب");
    }

    const result = await prisma.$transaction(async (tx) => {
      const returnHeader = await tx.return.findUnique({
        where: { id: returnId },
        select: { invoiceId: true },
      });

      if (!returnHeader) {
        throw new Error("المرتجع غير موجود أو تم حذفه مسبقاً");
      }

      // Serialize deletion with new returns for the same invoice.
      await tx.$queryRaw`
        SELECT id FROM invoices WHERE id = ${returnHeader.invoiceId} FOR UPDATE
      `;

      const salesReturn = await tx.return.findUnique({
        where: { id: returnId },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true } },
            },
          },
          invoice: {
            include: {
              pharmacy: {
                select: { id: true, name: true, governorateId: true },
              },
            },
          },
        },
      });

      if (!salesReturn) {
        throw new Error("المرتجع غير موجود أو تم حذفه مسبقاً");
      }

      const invoice = salesReturn.invoice;
      const totalAmount = roundMoney(Number(salesReturn.totalAmount));

      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        throw new Error("قيمة المرتجع غير صالحة ولا يمكن عكسها");
      }

      // ── 1. Reverse the stock that was added by this return ───
      const movementCandidates = await tx.stockMovement.findMany({
        where: {
          movementType: "RETURN_INBOUND",
          OR: [
            { notes: { contains: salesReturn.returnNumber } },
            { referenceNumber: { contains: salesReturn.returnNumber } },
          ],
        },
        select: {
          id: true,
          targetWarehouseId: true,
          notes: true,
          referenceNumber: true,
        },
        orderBy: { movedAt: "desc" },
      });

      const returnMovement = movementCandidates.find(
        (movement) =>
          containsExactReference(movement.notes, salesReturn.returnNumber) ||
          containsExactReference(
            movement.referenceNumber,
            salesReturn.returnNumber
          )
      );

      // Prefer the warehouse recorded on the original RETURN_INBOUND movement.
      // Old/incomplete rows fall back to the same routing used when the return
      // was created (client governorate SUB warehouse, then MAIN).
      let stockWarehouseId = returnMovement?.targetWarehouseId ?? null;

      if (!stockWarehouseId) {
        const subWarehouse = await tx.warehouse.findFirst({
          where: {
            type: "SUB",
            governorateId: invoice.pharmacy.governorateId,
            isActive: true,
          },
          select: { id: true },
        });
        const mainWarehouse = subWarehouse
          ? null
          : await tx.warehouse.findFirst({
              where: { type: "MAIN" },
              select: { id: true },
            });
        stockWarehouseId = subWarehouse?.id ?? mainWarehouse?.id ?? null;
      }

      if (stockWarehouseId) {
        // Group by product in case duplicate lines were recorded.
        const quantityByProduct = new Map<
          string,
          { quantity: number; productName: string }
        >();

        for (const item of salesReturn.items) {
          const quantity = Number(item.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) continue;

          const existing = quantityByProduct.get(item.productId);
          quantityByProduct.set(item.productId, {
            quantity: (existing?.quantity ?? 0) + quantity,
            productName: item.product.name,
          });
        }

        for (const [productId, entry] of Array.from(
          quantityByProduct.entries()
        )) {
          try {
            await decrementStockOrThrow(tx, {
              warehouseId: stockWarehouseId,
              productId,
              quantity: entry.quantity,
              productName: entry.productName,
            });
          } catch {
            throw new Error(
              `لا يمكن حذف المرتجع: الكمية المتاحة من "${entry.productName}" أقل من الكمية التي أدخلها المرتجع (${entry.quantity}). قم بتعديل المخزون أولاً.`
            );
          }
        }
      }

      if (returnMovement) {
        await tx.stockMovement.delete({ where: { id: returnMovement.id } });
      }

      // ── 2. Reverse treasury impact (cash refunds) ────────────
      const transactionCandidates = await tx.transaction.findMany({
        where: {
          OR: [
            { returnId: salesReturn.id },
            { description: { contains: salesReturn.returnNumber } },
            { referenceNo: { contains: salesReturn.returnNumber } },
          ],
        },
      });

      const returnTransactions = transactionCandidates.filter(
        (transaction) =>
          transaction.returnId === salesReturn.id ||
          containsExactReference(
            transaction.description,
            salesReturn.returnNumber
          ) ||
          containsExactReference(
            transaction.referenceNo,
            salesReturn.returnNumber
          )
      );

      if (returnTransactions.length > 0) {
        let cashToRestore = 0;
        for (const transaction of returnTransactions) {
          const amount = Number(transaction.amount);
          if (
            transaction.type === TransactionType.CASH_OUT ||
            transaction.type === TransactionType.TRANSFER_OUT
          ) {
            cashToRestore += amount;
          } else if (
            transaction.type === TransactionType.CASH_IN ||
            transaction.type === TransactionType.TRANSFER_IN
          ) {
            cashToRestore -= amount;
          }
        }

        if (cashToRestore !== 0) {
          const treasury = await getOrCreateTreasury(tx);
          await tx.treasury.update({
            where: { id: treasury.id },
            data: { currentBalance: { increment: cashToRestore } },
          });
        }

        await tx.transaction.deleteMany({
          where: {
            id: { in: returnTransactions.map((transaction) => transaction.id) },
          },
        });
      }

      // ── 3. Restore invoice + client balances ─────────────────
      const isCashRefund =
        invoice.type === InvoiceType.CASH && !invoice.isLegacy;

      const currentTotal = Number(invoice.total);
      const currentPaid = Number(invoice.paidAmount);
      const currentRemaining = Number(invoice.remainingAmount);

      let restoredTotal = roundMoney(Math.max(0, currentTotal + totalAmount));
      let newPaid: number;
      let newRemaining: number;

      if (isCashRefund) {
        // The client already paid in full; the return reduced the paid amount.
        // Restoring the return restores the paid amount as well.
        newPaid = roundMoney(
          Math.min(restoredTotal, Math.max(0, currentPaid + totalAmount))
        );
        newRemaining = roundMoney(Math.max(0, restoredTotal - newPaid));
      } else {
        // Credit / legacy debt: the return reduced the receivable and the
        // client balance. Both are restored by exactly the return amount.
        newPaid = roundMoney(Math.max(0, currentPaid));
        newRemaining = roundMoney(
          Math.max(0, currentRemaining + totalAmount)
        );

        // Keep the accounting identity total = paid + remaining even for
        // over-returns recorded by older app versions.
        restoredTotal = Math.max(
          restoredTotal,
          roundMoney(newPaid + newRemaining)
        );

        await tx.pharmacy.update({
          where: { id: invoice.pharmacyId },
          data: { currentBalance: { increment: totalAmount } },
        });
      }

      const newStatus = resolveInvoiceStatus(
        restoredTotal,
        newPaid,
        newRemaining
      );

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          total: restoredTotal,
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          status: newStatus,
        },
      });

      await tx.return.delete({ where: { id: salesReturn.id } });

      return {
        invoiceId: invoice.id,
        pharmacyId: invoice.pharmacyId,
        returnNumber: salesReturn.returnNumber,
      };
    });

    revalidateReturnRelatedPaths({
      invoiceId: result.invoiceId,
      pharmacyId: result.pharmacyId,
    });

    return {
      success: true,
      message: `تم حذف المرتجع ${result.returnNumber} وعكس أثره بنجاح`,
    };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}
