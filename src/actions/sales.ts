"use server";
import { handleActionError } from "@/lib/error-handler";

import { prisma } from "@/lib/prisma";
import { requireRole, requireAuth } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import {
  DiscountType,
  InvoiceStatus,
  InvoiceType,
  Prisma,
  UserRole,
  TransactionType,
  TransactionCategory,
} from "@prisma/client";
import { z } from "zod";
import { addDays, format } from "date-fns";
import { calculateDiscountAmount, calculateNetTotal } from "@/lib/utils";
import { getSystemSettings } from "@/queries/settings";

// ─── Schemas ──────────────────────────────────────────────────

const InvoiceItemSchema = z.object({
  productId: z.string().optional().default(""),
  quantity: z.coerce.number().optional().default(1),
  bonusQuantity: z.coerce.number().min(0).optional().default(0), // free boxes — stock deducted but not billed
  unitPrice: z.coerce.number().min(0).optional().default(0),
});

// Upfront itemized payment item (for CREDIT invoices)
const UpfrontPaymentItemSchema = z.object({
  productId: z.string().min(1),
  paidQuantity: z.coerce.number().min(0).optional().default(0),
  // unitPrice here is the discountedUnitPrice, computed client-side
  unitPrice: z.coerce.number().min(0).optional().default(0),
});

const CreateInvoiceSchema = z
  .object({
    pharmacyId: z.string().min(1, "اختر العميل"),
    salesRepId: z.string().nullable().optional(),
    type: z.nativeEnum(InvoiceType),
    notes: z.string().optional(),
    manualNumber: z.string().min(1, "رقم الفاتورة مطلوب"),
    discountType: z.nativeEnum(DiscountType).default(DiscountType.PERCENTAGE),
    discountValue: z.coerce.number().min(0).optional().default(0),
    paidAmount: z.coerce.number().min(0).optional().default(0),
    isLegacy: z.boolean().optional().default(false),
    /// LEGACY DEBT: total debt amount when isLegacy is true
    legacyDebtAmount: z.coerce.number().min(0).optional().default(0),
    issueDate: z.coerce.date().optional(),
    // Upfront itemized payment (only for CREDIT invoices — by product quantity)
    upfrontPaymentItems: z.array(UpfrontPaymentItemSchema).optional().default([]),
    items: z.array(InvoiceItemSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.isLegacy) {
      if ((data.legacyDebtAmount ?? 0) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["legacyDebtAmount"],
          message: "قيمة المديونية يجب أن تكون أكبر من 0",
        });
      }
    } else {
      if (!data.salesRepId || data.salesRepId.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["salesRepId"],
          message: "اختر المندوب",
        });
      }
      if (!data.items || data.items.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items"],
          message: "أضف منتجاً واحداً على الأقل",
        });
      } else {
        data.items.forEach((item, index) => {
          if (!item.productId || item.productId.trim() === "") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["items", index, "productId"],
              message: "اختر منتجاً",
            });
          }
          if (!item.quantity || Number(item.quantity) <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["items", index, "quantity"],
              message: "الكمية يجب أن تكون أكبر من 0",
            });
          }
        });
      }
    }
  });

const RecordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().min(0).default(0),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHECK"]).default("CASH"),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
  targetSalesRepId: z.string().optional(),
  salesRepId: z.string().optional(),
  // Itemized payment items (optional — only for "Pay by Products" mode)
  paymentItems: z
    .array(
      z.object({
        productId: z.string().min(1),
        invoiceItemId: z.string().min(1),
        paidQuantity: z.coerce.number().min(0),
        unitPrice: z.coerce.number().min(0),
      })
    )
    .optional(),
  // LEGACY DEBT: Dummy target items for rep target tracking (no stock touched)
  targetItems: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
        price: z.coerce.number().min(0),
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
      targetQuantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من 0"),
    })
  ).min(1, "أضف منتجاً واحداً على الأقل"),
});

type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

// ─── Reversal helpers ─────────────────────────────────────────

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Matches a document number only when it appears as a complete token.
 * This prevents `INV-20261022-1` from accidentally matching
 * `INV-20261022-10` inside a free-text description.
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

function resolveInvoiceStatusAfterPaymentReversal(
  paidAmount: number,
  remainingAmount: number
): InvoiceStatus {
  if (remainingAmount <= 0.005) return InvoiceStatus.PAID;
  if (paidAmount > 0.005) return InvoiceStatus.PARTIALLY_PAID;
  return InvoiceStatus.CONFIRMED;
}

/** Restores `pharmacy.currentBalance` by a payment amount. */
async function restoreClientDebtForPayment(
  tx: Prisma.TransactionClient,
  pharmacyId: string,
  amount: number
) {
  if (amount <= 0) return;
  await tx.pharmacy.update({
    where: { id: pharmacyId },
    data: { currentBalance: { increment: amount } },
  });
}

/**
 * Reverses the stored monthly-target progress that was awarded when a payment
 * was collected. Quantities are clamped at zero so deleting a payment can
 * never make a target negative, even if the target was edited afterwards.
 */
async function reverseStoredRepTargetProgress(
  tx: Prisma.TransactionClient,
  salesRepId: string,
  paymentDate: Date,
  quantityByProduct: Map<string, number>
) {
  if (quantityByProduct.size === 0) return;

  const target = await tx.repMonthlyTarget.findUnique({
    where: {
      salesRepId_month_year: {
        salesRepId,
        month: paymentDate.getMonth() + 1,
        year: paymentDate.getFullYear(),
      },
    },
    include: { items: true },
  });
  if (!target) return;

  for (const [productId, quantity] of Array.from(
    quantityByProduct.entries()
  )) {
    if (quantity <= 0) continue;
    const targetItem = target.items.find(
      (item) => item.productId === productId
    );
    if (!targetItem) continue;

    await tx.repMonthlyTargetItem.update({
      where: { id: targetItem.id },
      data: {
        achievedQuantity: Math.max(
          0,
          Number(targetItem.achievedQuantity) - quantity
        ),
      },
    });
  }
}

/** Builds product -> quantity totals for a payment's regular item rows. */
function collectPaymentItemQuantities(
  paymentItems: Array<{ productId: string; paidQuantity: unknown }>
): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of paymentItems) {
    const quantity = Number(item.paidQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    quantities.set(
      item.productId,
      (quantities.get(item.productId) ?? 0) + quantity
    );
  }
  return quantities;
}

/** Reverses stored target progress for every payment of an invoice. */
async function reverseTargetsForInvoicePayments(
  tx: Prisma.TransactionClient,
  salesRepId: string | null,
  payments: Array<{
    paidAt: Date;
    paymentItems: Array<{ productId: string; paidQuantity: unknown }>;
    targetItems: Array<{
      productId: string;
      salesRepId: string;
      quantity: number;
    }>;
  }>
) {
  for (const payment of payments) {
    if (salesRepId && payment.paymentItems.length > 0) {
      await reverseStoredRepTargetProgress(
        tx,
        salesRepId,
        payment.paidAt,
        collectPaymentItemQuantities(payment.paymentItems)
      );
    }

    if (payment.targetItems.length > 0) {
      const byRep = new Map<string, Map<string, number>>();
      for (const targetItem of payment.targetItems) {
        const quantities = byRep.get(targetItem.salesRepId) ?? new Map();
        quantities.set(
          targetItem.productId,
          (quantities.get(targetItem.productId) ?? 0) +
            Number(targetItem.quantity)
        );
        byRep.set(targetItem.salesRepId, quantities);
      }

      for (const [repId, quantities] of Array.from(byRep.entries())) {
        await reverseStoredRepTargetProgress(
          tx,
          repId,
          payment.paidAt,
          quantities
        );
      }
    }
  }
}

/**
 * Revalidates every screen whose data depends on an invoice/payment/return.
 * Kept in one place so all reversal actions invalidate the same caches.
 */
function revalidateInvoiceRelatedPaths(options: {
  invoiceId?: string;
  pharmacyId?: string;
  salesRepIds?: Array<string | null | undefined>;
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

  for (const repId of Array.from(new Set(options.salesRepIds ?? []))) {
    if (repId) revalidatePath(`/dashboard/sales-reps/${repId}`);
  }
}

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

    // If legacy, strictly force items to []
    if (data.isLegacy) {
      data.items = [];
      data.upfrontPaymentItems = [];
    }

    // ── LEGACY vs STANDARD validation ──
    if (data.isLegacy) {
      if ((data.legacyDebtAmount ?? 0) <= 0) {
        return { success: false, error: "قيمة المديونية يجب أن تكون أكبر من 0" };
      }
    } else {
      if (!data.items || data.items.length === 0) {
        return { success: false, error: "أضف منتجاً واحداً على الأقل" };
      }
    }

    // Build invoice number: INV-YYYYMMDD-{manualNumber}
    const today = format(new Date(), "yyyyMMdd");
    const invoiceNumber = `INV-${today}-${data.manualNumber}`;

    // Check invoice number uniqueness
    const existing = await prisma.invoice.findUnique({ where: { invoiceNumber } });
    if (existing) {
      return { success: false, error: `رقم الفاتورة "${invoiceNumber}" موجود بالفعل. اختر رقماً مختلفاً.` };
    }

    // ── Fetch the client once — used for warehouse routing + ledger description ──
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: data.pharmacyId },
      select: { governorateId: true, name: true },
    });
    if (!pharmacy) {
      return { success: false, error: "العميل غير موجود" };
    }

    // ── For LEGACY invoices: no warehouse required ──
    let subWarehouse: { id: string; name: string } | null = null;

    if (!data.isLegacy) {
      // ── CRITICAL: Find SUB-warehouse in client's governorate ──
      subWarehouse = await prisma.warehouse.findFirst({
        where: {
          type: "SUB",
          governorateId: pharmacy.governorateId,
          isActive: true,
        },
      });

      if (!subWarehouse) {
        const governorate = await prisma.governorate.findUnique({
          where: { id: pharmacy.governorateId },
          select: { name: true },
        });
        return {
          success: false,
          error: `لا يوجد مخزن فرعي (SUB) في محافظة "${governorate?.name ?? pharmacy.governorateId}". يرجى إنشاء مخزن فرعي في نفس محافظة العميل أولاً.`,
        };
      }

      // ── Validate warehouse stock availability ──
      const productIds = data.items.map((i) => i.productId as string);
      const stockItems = await prisma.stockItem.findMany({
        where: { warehouseId: subWarehouse.id, productId: { in: productIds } },
        include: { product: { select: { name: true } } },
      });
      const stockItemMap = new Map(stockItems.map((si) => [si.productId, si]));

      for (const item of data.items) {
        const totalRequired = (item.quantity || 1) + (item.bonusQuantity ?? 0);
        const stockItem = stockItemMap.get(item.productId as string);
        const available = Number(stockItem?.quantity ?? 0) - Number(stockItem?.reservedQty ?? 0);
        if (available < totalRequired) {
          return {
            success: false,
            error: `المخزون غير كافٍ في مخزن "${subWarehouse.name}" للمنتج "${stockItem?.product?.name ?? item.productId}". المتاح: ${available}، المطلوب (بما في ذلك البونص): ${totalRequired}`,
          };
        }
      }
    }

    // ── Calculate totals ──
    // LEGACY: total is the raw debt amount, no items, no discount
    let subtotal: number;
    let discountAmount: number;
    let totalAmount: number;
    let itemsWithDiscountedPrice: Array<{
      productId: string;
      quantity: number;
      bonusQuantity: number;
      unitPrice: number;
      discountedUnitPrice: number;
    }> = [];

    if (data.isLegacy) {
      subtotal = data.legacyDebtAmount ?? 0;
      discountAmount = 0;
      totalAmount = subtotal;
      itemsWithDiscountedPrice = [];
    } else {
      // Calculate subtotal — only billed quantity * price (bonus boxes are free)
      subtotal = data.items.reduce(
        (sum, item) => sum + (item.quantity || 1) * (item.unitPrice || 0),
        0
      );

      // Calculate discount amount
      discountAmount = calculateDiscountAmount(
        subtotal,
        data.discountType,
        data.discountValue
      );

      totalAmount = calculateNetTotal(subtotal, discountAmount);

      // ── CRITICAL: Compute proportional discount factor per item ──
      const discountFactor = subtotal > 0 ? totalAmount / subtotal : 1;

      // Build items with discountedUnitPrice pre-calculated
      itemsWithDiscountedPrice = data.items.map((item) => ({
        productId: item.productId as string,
        quantity: item.quantity || 1,
        bonusQuantity: item.bonusQuantity ?? 0,
        unitPrice: item.unitPrice || 0,
        discountedUnitPrice: (item.unitPrice || 0) * discountFactor,
      }));
    }

    // Get settings for credit days
    const settings = await getSystemSettings();
    const creditDays = settings?.defaultCreditDays ?? 30;

    // LEGACY invoices are always CREDIT (آجلة)
    const effectiveType = data.isLegacy ? InvoiceType.CREDIT : data.type;

    let dueDate = null;
    if (effectiveType === InvoiceType.CREDIT) {
      dueDate = addDays(new Date(), creditDays);
    }

    // Determine initial payment state
    const isCash = effectiveType === InvoiceType.CASH;

    // Calculate upfront amount from itemized items (for CREDIT invoices)
    // Upfront uses discountedUnitPrice so the amount is accurate after discount
    let amountPaidNow = 0;
    const activeUpfrontItems = (data.upfrontPaymentItems ?? []).filter(
      (pi) => pi.paidQuantity > 0
    );

    if (isCash) {
      amountPaidNow = totalAmount;
    } else if (!data.isLegacy && activeUpfrontItems.length > 0) {
      // unitPrice in upfrontPaymentItems is already the discountedUnitPrice (set by client)
      amountPaidNow = activeUpfrontItems.reduce(
        (sum, pi) => sum + pi.paidQuantity * pi.unitPrice,
        0
      );
    }
    // LEGACY invoices always start with 0 paid (full amount is deferred)

    amountPaidNow = Math.min(amountPaidNow, totalAmount);
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
          salesRepId: data.isLegacy ? null : (data.salesRepId || null),
          type: effectiveType,
          status: initialStatus,
          subtotal,
          discountType: data.discountType,
          discountValue: data.discountValue,
          discountAmount,
          total: totalAmount,
          paidAmount: amountPaidNow,
          remainingAmount,
          creditDays: effectiveType === InvoiceType.CREDIT ? creditDays : null,
          dueDate,
          notes: data.notes,
          isLegacy: data.isLegacy,
          invoiceDate: data.isLegacy && data.issueDate ? data.issueDate : undefined,
          // LEGACY invoices have NO items — only a total debt amount
          ...(itemsWithDiscountedPrice.length > 0 && {
            items: {
              create: itemsWithDiscountedPrice.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                bonusQuantity: item.bonusQuantity ?? 0,
                unitPrice: item.unitPrice,
                discountedUnitPrice: (item as any).discountedUnitPrice ?? 0,
                lineTotal: item.quantity * item.unitPrice,
              })),
            },
          }),
        },
      });

      // 2. Deduct stock from the sub-warehouse of the client's governorate
      // IMPORTANT: Total physical deduction = quantity + bonusQuantity
      // LEGACY invoices NEVER deduct stock
      if (!data.isLegacy && subWarehouse) {
        for (const item of itemsWithDiscountedPrice) {
          const totalDeductQty = item.quantity + (item.bonusQuantity ?? 0);
          await tx.stockItem.update({
            where: {
              warehouseId_productId: {
                warehouseId: subWarehouse.id,
                productId: item.productId,
              },
            },
            data: { quantity: { decrement: totalDeductQty } },
          });
        }

        // 3. Record stock movement for audit trail (total boxes including bonus)
        await tx.stockMovement.create({
          data: {
            movementType: "OUTBOUND",
            source: "PHARMACY",
            sourceWarehouseId: subWarehouse.id,
            salesRepId: data.salesRepId || null,
            notes: `صرف للفاتورة ${invoiceNumber}`,
            items: {
              create: itemsWithDiscountedPrice.map((item) => ({
                productId: item.productId,
                quantity: item.quantity + (item.bonusQuantity ?? 0),
              })),
            },
          },
        });
      }

      // 4. If there is an upfront payment, create a Payment record
      if (amountPaidNow > 0) {
        const payment = await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            pharmacyId: data.pharmacyId,
            amount: amountPaidNow,
            method: "CASH",
            notes: isCash
              ? "دفع نقدي عند إصدار الفاتورة"
              : "دفعة مقدمة عند إصدار الفاتورة آجل",
          },
        });

        // 4.1 Add itemized payment items for upfront credit payment
        // unitPrice here already holds the discountedUnitPrice passed from the client
        if (!isCash && activeUpfrontItems.length > 0) {
          await tx.paymentItem.createMany({
            data: activeUpfrontItems.map((pi) => ({
              paymentId: payment.id,
              productId: pi.productId,
              paidQuantity: pi.paidQuantity,
              unitPrice: pi.unitPrice, // discountedUnitPrice
            })),
          });

          // 4.2 Update Rep Monthly Target achieved quantities on upfront payment
          if (!data.isLegacy && data.salesRepId) {
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
              for (const pi of activeUpfrontItems) {
                const targetItem = repMonthlyTarget.items.find(
                  (ti) => ti.productId === pi.productId
                );
                if (targetItem) {
                  await tx.repMonthlyTargetItem.update({
                    where: { id: targetItem.id },
                    data: { achievedQuantity: { increment: pi.paidQuantity } },
                  });
                }
              }
            }
          }
        }

        // 4.2 Sync with Treasury
        let treasury = await tx.treasury.findFirst();
        if (!treasury) {
          treasury = await tx.treasury.create({
            data: { name: "الخزينة الرئيسية", currentBalance: 0 },
          });
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
            description: `تحصيل دفعة لفاتورة رقم ${invoiceNumber} — ${pharmacy.name}`,
            paymentId: payment.id,
          },
        });
      }

      // 5. Update Client Balance — only for the outstanding credit portion
      if (effectiveType === InvoiceType.CREDIT && remainingAmount > 0) {
        await tx.pharmacy.update({
          where: { id: data.pharmacyId },
          data: { currentBalance: { increment: remainingAmount } },
        });
      }

      // 6. Update Pharmacy Target Progress
      if (!data.isLegacy) {
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
      }

      // NOTE: Rep Monthly Product Target achievedQuantity is updated ONLY upon actual
      // payment collection (see recordInvoicePayment), NOT at invoice creation.

      return invoice;
    });

    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/reports/daily");
    revalidatePath("/dashboard/treasury");
    revalidatePath(`/dashboard/pharmacies/${data.pharmacyId}`);
    return { success: true, data: { id: result.id }, message: "تم إصدار الفاتورة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}

/**
 * Quick-fix for a wrongly selected sales rep on an invoice.
 *
 * Changing the rep does not touch stock, treasury, client debt or the invoice
 * totals — it is a pure metadata correction.
 */
export async function updateInvoiceSalesRep(
  invoiceId: string,
  salesRepId: string | null
): Promise<ActionResult> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
    ]);

    if (!invoiceId || invoiceId.trim() === "") {
      throw new Error("معرف الفاتورة مطلوب");
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        pharmacyId: true,
        salesRepId: true,
        invoiceNumber: true,
      },
    });
    if (!invoice) {
      throw new Error("الفاتورة غير موجودة");
    }

    const newSalesRepId =
      salesRepId && salesRepId.trim() !== "" ? salesRepId.trim() : null;

    if (newSalesRepId) {
      const rep = await prisma.salesRep.findUnique({
        where: { id: newSalesRepId },
        select: { id: true },
      });
      if (!rep) {
        throw new Error("المندوب المحدد غير موجود");
      }
    }

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { salesRepId: newSalesRepId },
    });

    revalidateInvoiceRelatedPaths({
      invoiceId: invoice.id,
      pharmacyId: invoice.pharmacyId,
      salesRepIds: [invoice.salesRepId, newSalesRepId],
    });

    return {
      success: true,
      data: undefined,
      message: "تم تحديث مندوب الفاتورة بنجاح",
    };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
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
        include: {
          pharmacy: { select: { name: true } },
        },
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
        treasury = await tx.treasury.create({
          data: { name: "الخزينة الرئيسية", currentBalance: 0 },
        });
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
          description: `تحصيل دفعة لفاتورة رقم ${invoice.invoiceNumber} — ${invoice.pharmacy.name}`,
          paymentId: payment.id,
        },
      });

      // 3. If itemized, create PaymentItem records
      if (data.paymentItems && data.paymentItems.length > 0) {
        await tx.paymentItem.createMany({
          data: data.paymentItems.map((pi) => ({
            paymentId: payment.id,
            productId: pi.productId,
            paidQuantity: pi.paidQuantity,
            unitPrice: pi.unitPrice, // discountedUnitPrice passed from client
          })),
        });

        // 4. Update Rep Monthly Target achievedQuantity based on paid quantities
        // Targets are updated on PAYMENT, not on invoice creation
        if (invoice.salesRepId) {
          const repMonthlyTarget = await tx.repMonthlyTarget.findUnique({
            where: {
              salesRepId_month_year: {
                salesRepId: invoice.salesRepId,
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear(),
              },
            },
            include: { items: true },
          });

          if (repMonthlyTarget) {
            for (const pi of data.paymentItems) {
              const targetItem = repMonthlyTarget.items.find(
                (ti) => ti.productId === pi.productId
              );
              if (targetItem) {
                await tx.repMonthlyTargetItem.update({
                  where: { id: targetItem.id },
                  data: { achievedQuantity: { increment: pi.paidQuantity } },
                });
              }
            }
          }
        }
      }

      // 3.5 LEGACY DEBT: Save dummy target items for rep target tracking.
      // CRITICAL: These items NEVER touch stock. Strictly for target calculations.
      if (data.targetItems && data.targetItems.length > 0 && invoice.isLegacy) {
        const repId = data.targetSalesRepId || data.salesRepId;
        if (!repId) {
          throw new Error("يجب اختيار المندوب المستفيد من التارجت");
        }

        const rep = await tx.salesRep.findUnique({
          where: { id: repId },
          select: { id: true },
        });
        if (!rep) {
          throw new Error("المندوب المحدد غير موجود");
        }

        await tx.paymentTargetItem.createMany({
          data: data.targetItems.map((ti) => ({
            paymentId: payment.id,
            productId: ti.productId,
            salesRepId: repId,
            quantity: ti.quantity,
            price: ti.price,
          })),
        });

        // Update Rep Monthly Target achievedQuantity from legacy target items
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const legacyRepTarget = await tx.repMonthlyTarget.findUnique({
          where: {
            salesRepId_month_year: {
              salesRepId: repId,
              month: currentMonth,
              year: currentYear,
            },
          },
          include: { items: true },
        });

        if (legacyRepTarget) {
          for (const ti of data.targetItems) {
            const targetItem = legacyRepTarget.items.find(
              (item) => item.productId === ti.productId
            );
            if (targetItem) {
              await tx.repMonthlyTargetItem.update({
                where: { id: targetItem.id },
                data: { achievedQuantity: { increment: ti.quantity } },
              });
            }
          }
        }
      }

      // 5. Update Client Balance (reduce debt)
      if (invoice.type === InvoiceType.CREDIT) {
        await tx.pharmacy.update({
          where: { id: invoice.pharmacyId },
          data: { currentBalance: { decrement: amount } },
        });
      }
    });

    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/reports/daily");
    revalidatePath("/dashboard/treasury");
    revalidatePath(`/dashboard/sales/${data.invoiceId}`);
    const creditedRepId = data.targetSalesRepId || data.salesRepId;
    if (creditedRepId) {
      revalidatePath(`/dashboard/sales-reps/${creditedRepId}`);
    }
    return { success: true, data: undefined, message: "تم تسجيل الدفعة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}

/**
 * Reverses a single payment atomically.
 *
 * Effects:
 *  - Invoice paid/remaining amounts and status are restored.
 *  - The client's outstanding balance is increased by the payment amount.
 *  - The matching treasury cash-in is removed and the treasury balance is
 *    reduced by the exact same amount.
 *  - Payment target items (legacy rep-target tracking) are deleted.
 */
export async function deleteInvoicePayment(paymentId: string): Promise<ActionResult> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.ACCOUNTANT,
      UserRole.SALES_MANAGER,
    ]);

    if (!paymentId || paymentId.trim() === "") {
      throw new Error("معرف الدفعة مطلوب");
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          invoice: {
            include: {
              pharmacy: { select: { id: true, name: true } },
            },
          },
          paymentItems: true,
          targetItems: true,
        },
      });

      if (!payment) {
        throw new Error("الدفعة غير موجودة أو تم حذفها مسبقاً");
      }

      const invoice = payment.invoice;
      const amount = roundMoney(Number(payment.amount));

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("قيمة الدفعة غير صالحة ولا يمكن عكسها");
      }

      const newPaidAmount = roundMoney(
        Math.max(0, Number(invoice.paidAmount) - amount)
      );
      const newRemainingAmount = roundMoney(
        Number(invoice.remainingAmount) + amount
      );
      const newStatus = resolveInvoiceStatusAfterPaymentReversal(
        newPaidAmount,
        newRemainingAmount
      );

      // 1. Restore the invoice balances.
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
        },
      });

      // 2. Restore the client's debt.
      await restoreClientDebtForPayment(tx, invoice.pharmacyId, amount);

      // 3. Reverse the treasury impact. Payments always create a cash-in row;
      // if the row is missing (old data / manual cleanup) the balance is still
      // reduced by the payment amount so cash and documents stay aligned.
      const treasury = await tx.treasury.findFirst();
      if (treasury) {
        const newTreasuryBalance = roundMoney(
          Number(treasury.currentBalance) - amount
        );
        await tx.treasury.update({
          where: { id: treasury.id },
          data: { currentBalance: newTreasuryBalance },
        });
      }

      let treasuryTransaction = await tx.transaction.findFirst({
        where: { paymentId: payment.id },
      });

      // Fallback for old rows created before the `paymentId` link existed:
      // match the invoice number + exact payment amount in the ledger text.
      if (!treasuryTransaction) {
        const candidates = await tx.transaction.findMany({
          where: {
            type: TransactionType.CASH_IN,
            category: TransactionCategory.INVOICE_PAYMENT,
            amount,
            OR: [
              { description: { contains: invoice.invoiceNumber } },
              { referenceNo: { contains: invoice.invoiceNumber } },
            ],
          },
          orderBy: { transactedAt: "desc" },
        });

        treasuryTransaction =
          candidates.find(
            (transaction) =>
              containsExactReference(
                transaction.description,
                invoice.invoiceNumber
              ) ||
              containsExactReference(
                transaction.referenceNo,
                invoice.invoiceNumber
              )
          ) ?? null;
      }

      if (treasuryTransaction) {
        await tx.transaction.delete({ where: { id: treasuryTransaction.id } });
      }

      // 4. Reverse the stored target progress awarded by this payment, then
      // remove the rep-target rows linked to it (legacy debt).
      if (invoice.salesRepId && payment.paymentItems.length > 0) {
        await reverseStoredRepTargetProgress(
          tx,
          invoice.salesRepId,
          payment.paidAt,
          collectPaymentItemQuantities(payment.paymentItems)
        );
      }

      if (payment.targetItems.length > 0) {
        const byRep = new Map<string, Map<string, number>>();
        for (const targetItem of payment.targetItems) {
          const quantities = byRep.get(targetItem.salesRepId) ?? new Map();
          quantities.set(
            targetItem.productId,
            (quantities.get(targetItem.productId) ?? 0) +
              Number(targetItem.quantity)
          );
          byRep.set(targetItem.salesRepId, quantities);
        }

        for (const [repId, quantities] of Array.from(byRep.entries())) {
          await reverseStoredRepTargetProgress(
            tx,
            repId,
            payment.paidAt,
            quantities
          );
        }
      }

      await tx.paymentTargetItem.deleteMany({
        where: { paymentId: payment.id },
      });

      // 5. Remove the payment itself. PaymentItem rows cascade.
      await tx.payment.delete({ where: { id: payment.id } });

      return {
        invoiceId: invoice.id,
        pharmacyId: invoice.pharmacyId,
        salesRepId: invoice.salesRepId,
      };
    });

    revalidateInvoiceRelatedPaths({
      invoiceId: result.invoiceId,
      pharmacyId: result.pharmacyId,
      salesRepIds: [result.salesRepId],
    });

    return {
      success: true,
      data: undefined,
      message: "تم حذف الدفعة وعكس أثرها بنجاح",
    };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}

/**
 * Fully deletes an invoice and reverses every side effect.
 *
 * Returns are intentionally blocked: their stock/debt/cash impacts are
 * separate documents and must be deleted first, which keeps the reversal math
 * exact. Without returns, the invoice's current contribution to
 * `pharmacy.currentBalance` is exactly `remainingAmount`.
 */
export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
    ]);

    if (!invoiceId || invoiceId.trim() === "") {
      throw new Error("معرف الفاتورة مطلوب");
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: true,
          payments: {
            include: {
              paymentItems: true,
              targetItems: true,
            },
          },
          returns: { select: { id: true } },
          pharmacy: {
            select: {
              id: true,
              name: true,
              governorateId: true,
            },
          },
        },
      });

      if (!invoice) {
        throw new Error("الفاتورة غير موجودة أو تم حذفها مسبقاً");
      }

      if (invoice.returns.length > 0) {
        throw new Error(
          "يرجى حذف المرتجعات المرتبطة بهذه الفاتورة أولاً قبل حذف الفاتورة"
        );
      }

      // ── 1. Reverse stock (standard invoices only) ─────────────
      if (!invoice.isLegacy) {
        const movementCandidates = await tx.stockMovement.findMany({
          where: {
            movementType: "OUTBOUND",
            source: "PHARMACY",
            OR: [
              { notes: { contains: invoice.invoiceNumber } },
              { referenceNumber: { contains: invoice.invoiceNumber } },
            ],
          },
          select: {
            id: true,
            sourceWarehouseId: true,
            notes: true,
            referenceNumber: true,
          },
        });

        const invoiceMovements = movementCandidates.filter(
          (movement) =>
            containsExactReference(movement.notes, invoice.invoiceNumber) ||
            containsExactReference(
              movement.referenceNumber,
              invoice.invoiceNumber
            ) ||
            movement.referenceNumber === invoice.invoiceNumber
        );

        // Prefer the warehouse recorded on the original movement. Fall back to
        // the client's governorate SUB warehouse, then MAIN, for old invoices
        // whose movement row is missing.
        let warehouseId =
          invoiceMovements.find((movement) => movement.sourceWarehouseId)
            ?.sourceWarehouseId ?? null;

        if (!warehouseId) {
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
          warehouseId = subWarehouse?.id ?? mainWarehouse?.id ?? null;
        }

        if (!warehouseId) {
          throw new Error(
            "لا يوجد مخزن مرتبط بالفاتورة لاسترجاع الكميات إليه. يرجى مراجعة إعدادات المخازن."
          );
        }

        // Group by product in case the invoice contains duplicate lines.
        const quantityByProduct = new Map<string, number>();
        for (const item of invoice.items) {
          const quantity =
            Number(item.quantity) + Number(item.bonusQuantity ?? 0);
          if (!Number.isFinite(quantity) || quantity <= 0) continue;
          quantityByProduct.set(
            item.productId,
            (quantityByProduct.get(item.productId) ?? 0) + quantity
          );
        }

        for (const [productId, quantity] of Array.from(
          quantityByProduct.entries()
        )) {
          await tx.stockItem.upsert({
            where: {
              warehouseId_productId: { warehouseId, productId },
            },
            create: {
              warehouseId,
              productId,
              quantity,
            },
            update: {
              quantity: { increment: quantity },
            },
          });
        }

        if (invoiceMovements.length > 0) {
          await tx.stockMovement.deleteMany({
            where: { id: { in: invoiceMovements.map((movement) => movement.id) } },
          });
        }
      }

      // ── 2. Reverse client debt ───────────────────────────────
      // No returns exist (guarded above), so the invoice contributes exactly
      // its remaining amount to the client's current balance.
      const remainingAmount = roundMoney(Number(invoice.remainingAmount));
      if (remainingAmount !== 0) {
        await tx.pharmacy.update({
          where: { id: invoice.pharmacyId },
          data: { currentBalance: { decrement: remainingAmount } },
        });
      }

      // Reverse this invoice's contribution to the pharmacy monthly target.
      // Invoice creation only updates an existing target period, so a missing
      // period means there is nothing to reverse.
      if (!invoice.isLegacy) {
        const targetPeriod = await tx.pharmacyTargetPeriod.findFirst({
          where: {
            pharmacyId: invoice.pharmacyId,
            periodYear: invoice.createdAt.getFullYear(),
            periodMonth: invoice.createdAt.getMonth() + 1,
          },
        });

        if (targetPeriod) {
          await tx.pharmacyTargetPeriod.update({
            where: { id: targetPeriod.id },
            data: {
              achieved: Math.max(
                0,
                Number(targetPeriod.achieved) - Number(invoice.total)
              ),
            },
          });
        }
      }

      // ── 3. Reverse payments + treasury ───────────────────────
      await reverseTargetsForInvoicePayments(
        tx,
        invoice.salesRepId,
        invoice.payments
      );

      const paymentIds = invoice.payments.map((payment) => payment.id);

      const transactionCandidates = await tx.transaction.findMany({
        where: {
          OR: [
            ...(paymentIds.length > 0
              ? [{ paymentId: { in: paymentIds } }]
              : []),
            { description: { contains: invoice.invoiceNumber } },
            { referenceNo: { contains: invoice.invoiceNumber } },
          ],
        },
      });

      const invoiceTransactions = transactionCandidates.filter(
        (transaction) =>
          (transaction.paymentId !== null &&
            paymentIds.includes(transaction.paymentId)) ||
          containsExactReference(transaction.description, invoice.invoiceNumber) ||
          containsExactReference(transaction.referenceNo, invoice.invoiceNumber)
      );

      if (invoiceTransactions.length > 0) {
        // Reverse the net cash effect of the rows we are about to delete.
        let cashToRemove = 0;
        for (const transaction of invoiceTransactions) {
          const amount = Number(transaction.amount);
          if (
            transaction.type === TransactionType.CASH_IN ||
            transaction.type === TransactionType.TRANSFER_IN
          ) {
            cashToRemove += amount;
          } else if (
            transaction.type === TransactionType.CASH_OUT ||
            transaction.type === TransactionType.TRANSFER_OUT
          ) {
            cashToRemove -= amount;
          }
        }

        if (cashToRemove !== 0) {
          const treasury = await tx.treasury.findFirst();
          if (treasury) {
            await tx.treasury.update({
              where: { id: treasury.id },
              data: {
                currentBalance: roundMoney(
                  Number(treasury.currentBalance) - cashToRemove
                ),
              },
            });
          }
        }

        await tx.transaction.deleteMany({
          where: { id: { in: invoiceTransactions.map((transaction) => transaction.id) } },
        });
      }

      if (paymentIds.length > 0) {
        await tx.paymentTargetItem.deleteMany({
          where: { paymentId: { in: paymentIds } },
        });
        await tx.paymentItem.deleteMany({
          where: { paymentId: { in: paymentIds } },
        });
        await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
      }

      // ── 4. Clean up dependents and delete the invoice ────────
      await tx.alert.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoice.delete({ where: { id: invoice.id } });

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        pharmacyId: invoice.pharmacyId,
        salesRepId: invoice.salesRepId,
        paymentCount: invoice.payments.length,
      };
    });

    revalidateInvoiceRelatedPaths({
      invoiceId: result.invoiceId,
      pharmacyId: result.pharmacyId,
      salesRepIds: [result.salesRepId],
    });

    return {
      success: true,
      data: undefined,
      message: `تم حذف الفاتورة ${result.invoiceNumber} وعكس جميع آثارها بنجاح`,
    };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
  }
}

export async function getRepMonthlyTarget(
  salesRepId: string,
  month: number,
  year: number
) {
  await requireAuth();
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

/**
 * Aggregates monthly target achievements (quantity & financial value) for a sales rep.
 * Includes both:
 * 1. Regular invoices (proportional collection value & paid quantity)
 * 2. Legacy debt invoices (PaymentTargetItem filtered directly by salesRepId)
 */
export async function getSalesRepTargetAchievements(
  salesRepId: string,
  month: number,
  year: number
) {
  await requireAuth();
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 1);

  // 1. Regular invoice payments
  const regularPayments = await prisma.payment.findMany({
    where: {
      invoice: {
        salesRepId,
        isLegacy: false,
        invoiceDate: { gte: startOfMonth },
      },
      paidAt: { gte: startOfMonth, lt: endOfMonth },
    },
    select: {
      amount: true,
      paymentItems: {
        select: {
          productId: true,
          paidQuantity: true,
          unitPrice: true,
        },
      },
      invoice: {
        select: {
          subtotal: true,
          discountAmount: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              discountedUnitPrice: true,
            },
          },
        },
      },
    },
  });

  // 2. Legacy debt target items directly filtered by salesRepId
  const legacyTargetItems = await prisma.paymentTargetItem.findMany({
    where: {
      salesRepId,
      payment: {
        paidAt: { gte: startOfMonth, lt: endOfMonth },
      },
    },
    select: {
      productId: true,
      quantity: true,
      price: true,
    },
  });

  const achievementsByProduct = new Map<string, { achievedQty: number; achievedValue: number }>();

  // Process regular payments
  for (const payment of regularPayments) {
    const originalNetTotal =
      Number(payment.invoice.subtotal) - Number(payment.invoice.discountAmount);
    if (originalNetTotal > 0) {
      const paymentRatio = Number(payment.amount) / originalNetTotal;

      for (const item of payment.invoice.items) {
        const itemNetLineValue =
          Number(item.quantity) * Number(item.discountedUnitPrice);
        const itemCollectedValue = itemNetLineValue * paymentRatio;

        const current = achievementsByProduct.get(item.productId) ?? {
          achievedQty: 0,
          achievedValue: 0,
        };
        current.achievedValue += itemCollectedValue;
        achievementsByProduct.set(item.productId, current);
      }
    }

    for (const pi of payment.paymentItems) {
      const current = achievementsByProduct.get(pi.productId) ?? {
        achievedQty: 0,
        achievedValue: 0,
      };
      current.achievedQty += Number(pi.paidQuantity);
      achievementsByProduct.set(pi.productId, current);
    }
  }

  // Process legacy target items
  for (const ti of legacyTargetItems) {
    const itemValue = ti.quantity * ti.price;
    const current = achievementsByProduct.get(ti.productId) ?? {
      achievedQty: 0,
      achievedValue: 0,
    };
    current.achievedQty += ti.quantity;
    current.achievedValue += itemValue;
    achievementsByProduct.set(ti.productId, current);
  }

  return achievementsByProduct;
}
