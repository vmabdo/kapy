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
import { addDays } from "date-fns";
import { calculateDiscountAmount } from "@/lib/utils";
import {
  getZonedDateKey,
  getZonedMonthRange,
  getZonedYearMonth,
} from "@/lib/datetime";
import { getSystemSettings } from "@/queries/settings";
import { decrementStockOrThrow } from "@/lib/stock";
import { getOrCreateTreasury } from "@/lib/treasury";
import { resolveProductCost } from "@/lib/costing";

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
const SetRepMonthlyTargetSchema = z
  .object({
    /** Existing target being edited. New targets leave this empty. */
    targetId: z.string().optional(),
    salesRepId: z.string().min(1),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2020),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          targetQuantity: z.coerce
            .number()
            .positive("الكمية يجب أن تكون أكبر من 0"),
        })
      )
      .min(1, "أضف منتجاً واحداً على الأقل"),
  })
  .superRefine((data, ctx) => {
    const productIds = new Set<string>();
    data.items.forEach((item, index) => {
      if (productIds.has(item.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "productId"],
          message: "لا يمكن تكرار نفس المنتج في الأهداف",
        });
      }
      productIds.add(item.productId);
    });
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

  const paymentPeriod = getZonedYearMonth(paymentDate);
  const target = await tx.repMonthlyTarget.findUnique({
    where: {
      salesRepId_month_year: {
        salesRepId,
        month: paymentPeriod.month,
        year: paymentPeriod.year,
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
    const session = await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.SALES_REP,
    ]);

    const data = CreateInvoiceSchema.parse(formData);

    // Sales reps can only issue standard invoices for their own rep profile.
    // Never trust the posted salesRepId or allow legacy-debt creation here.
    if (session.user.role === UserRole.SALES_REP) {
      if (data.isLegacy) {
        throw new Error("غير مصرح للمندوب بإنشاء فواتير مديونية سابقة");
      }
      if (!session.user.salesRepId) {
        throw new Error("حساب المندوب غير مرتبط بملف مندوب");
      }
      data.salesRepId = session.user.salesRepId;
    }

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
    // Use the Cairo calendar date, not the server's UTC date.
    const today = getZonedDateKey(new Date()).replaceAll("-", "");
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

    const isCash = effectiveType === InvoiceType.CASH;

    const result = await prisma.$transaction(async (tx) => {
      // ── Server-side financial source of truth ─────────────────────
      // Never trust prices, line totals, discounts or payment amounts sent by
      // the browser. Recompute them from the current product records inside
      // the same transaction that writes the invoice.
      const requestedQuantities = new Map<
        string,
        { quantity: number; bonusQuantity: number }
      >();

      for (const item of data.items) {
        const productId = item.productId as string;
        const quantity = Number(item.quantity);
        const bonusQuantity = Number(item.bonusQuantity ?? 0);

        if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("بيانات أحد أصناف الفاتورة غير صالحة");
        }
        if (!Number.isFinite(bonusQuantity) || bonusQuantity < 0) {
          throw new Error("كمية البونص يجب أن تكون 0 أو أكبر");
        }

        const existing = requestedQuantities.get(productId);
        requestedQuantities.set(productId, {
          quantity: (existing?.quantity ?? 0) + quantity,
          bonusQuantity: (existing?.bonusQuantity ?? 0) + bonusQuantity,
        });
      }

      const requestedProductIds = Array.from(requestedQuantities.keys());
      const productRecords = data.isLegacy
        ? []
        : await tx.product.findMany({
            where: { id: { in: requestedProductIds } },
            select: {
              id: true,
              name: true,
              isActive: true,
              sellingPrice: true,
              costPrice: true,
            },
          });
      const productMap = new Map(
        productRecords.map((product) => [product.id, product])
      );

      let serverSubtotal = 0;
      let serverDiscountAmount = 0;
      let serverTotalAmount = 0;
      let serverRemainingAmount = 0;
      let serverAmountPaidNow = 0;
      let serverItems: Array<{
        productId: string;
        quantity: number;
        bonusQuantity: number;
        unitPrice: number;
        discountedUnitPrice: number;
        historicalCost: number;
      }> = [];
      let serverUpfrontItems: Array<{
        productId: string;
        paidQuantity: number;
        unitPrice: number;
      }> = [];

      if (data.isLegacy) {
        serverSubtotal = roundMoney(Number(data.legacyDebtAmount ?? 0));
        serverDiscountAmount = 0;
        serverTotalAmount = serverSubtotal;
      } else {
        const pricedItems = requestedProductIds.map((productId) => {
          const product = productMap.get(productId);
          if (!product) {
            throw new Error("أحد المنتجات المختارة غير موجود");
          }
          if (!product.isActive) {
            throw new Error(`المنتج "${product.name}" غير مفعّل`);
          }

          const unitPrice = Number(product.sellingPrice);
          if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error(`سعر المنتج "${product.name}" غير صالح`);
          }

          const requested = requestedQuantities.get(productId)!;
          return {
            productId,
            quantity: requested.quantity,
            bonusQuantity: requested.bonusQuantity,
            unitPrice,
            // Immutable snapshot for historical COGS.
            historicalCost: resolveProductCost(product),
          };
        });

        serverSubtotal = roundMoney(
          pricedItems.reduce(
            (sum, item) => sum + item.quantity * item.unitPrice,
            0
          )
        );

        if (
          data.discountType === DiscountType.PERCENTAGE &&
          data.discountValue > 100
        ) {
          throw new Error("نسبة الخصم لا يمكن أن تتجاوز 100%");
        }

        if (
          data.discountType === DiscountType.FIXED &&
          data.discountValue > serverSubtotal + 0.005
        ) {
          throw new Error("قيمة الخصم الثابت لا يمكن أن تتجاوز إجمالي الفاتورة");
        }

        serverDiscountAmount = Math.min(
          serverSubtotal,
          Math.max(
            0,
            roundMoney(
              calculateDiscountAmount(
                serverSubtotal,
                data.discountType,
                data.discountValue
              )
            )
          )
        );
        serverTotalAmount = roundMoney(
          Math.max(0, serverSubtotal - serverDiscountAmount)
        );

        const discountFactor =
          serverSubtotal > 0 ? serverTotalAmount / serverSubtotal : 1;

        serverItems = pricedItems.map((item) => ({
          ...item,
          discountedUnitPrice:
            Math.round(
              (item.unitPrice * discountFactor + Number.EPSILON) * 10000
            ) / 10000,
        }));

        const itemByProductId = new Map(
          serverItems.map((item) => [item.productId, item])
        );
        const upfrontQuantities = new Map<string, number>();

        if (!isCash) {
          for (const upfront of data.upfrontPaymentItems ?? []) {
            const paidQuantity = Number(upfront.paidQuantity);
            if (!Number.isFinite(paidQuantity) || paidQuantity <= 0) continue;

            const invoiceItem = itemByProductId.get(upfront.productId);
            if (!invoiceItem) {
              throw new Error("أحد منتجات الدفعة المقدمة غير موجود في الفاتورة");
            }

            const alreadyEntered =
              upfrontQuantities.get(upfront.productId) ?? 0;
            if (
              alreadyEntered + paidQuantity >
              invoiceItem.quantity + 1e-9
            ) {
              throw new Error(
                `الكمية المدفوعة مقدماً من "${upfront.productId}" أكبر من الكمية المباعة`
              );
            }

            upfrontQuantities.set(
              upfront.productId,
              alreadyEntered + paidQuantity
            );

            serverUpfrontItems.push({
              productId: upfront.productId,
              paidQuantity,
              unitPrice: invoiceItem.discountedUnitPrice,
            });
            serverAmountPaidNow +=
              paidQuantity * invoiceItem.discountedUnitPrice;
          }
        }

        if (isCash) {
          serverAmountPaidNow = serverTotalAmount;
        } else {
          serverAmountPaidNow = roundMoney(serverAmountPaidNow);
          if (serverAmountPaidNow > serverTotalAmount + 0.005) {
            throw new Error("الدفعة المقدمة أكبر من إجمالي الفاتورة");
          }
          serverAmountPaidNow = Math.min(
            serverTotalAmount,
            serverAmountPaidNow
          );
        }
      }

      serverRemainingAmount = roundMoney(
        Math.max(0, serverTotalAmount - serverAmountPaidNow)
      );

      const serverInitialStatus: InvoiceStatus =
        serverRemainingAmount <= 0.005
          ? InvoiceStatus.PAID
          : serverAmountPaidNow > 0.005
            ? InvoiceStatus.PARTIALLY_PAID
            : InvoiceStatus.CONFIRMED;

      // 1. Create Invoice
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          pharmacyId: data.pharmacyId,
          salesRepId: data.isLegacy ? null : (data.salesRepId || null),
          type: effectiveType,
          status: serverInitialStatus,
          subtotal: serverSubtotal,
          discountType: data.discountType,
          discountValue: data.discountValue,
          discountAmount: serverDiscountAmount,
          total: serverTotalAmount,
          paidAmount: serverAmountPaidNow,
          remainingAmount: serverRemainingAmount,
          creditDays: effectiveType === InvoiceType.CREDIT ? creditDays : null,
          dueDate,
          notes: data.notes,
          isLegacy: data.isLegacy,
          invoiceDate: data.isLegacy && data.issueDate ? data.issueDate : undefined,
          // LEGACY invoices have NO items — only a total debt amount
          ...(serverItems.length > 0 && {
            items: {
              create: serverItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                bonusQuantity: item.bonusQuantity,
                unitPrice: item.unitPrice,
                discountedUnitPrice: item.discountedUnitPrice,
                lineTotal: roundMoney(item.quantity * item.unitPrice),
                historicalCost: roundMoney(item.historicalCost),
              })),
            },
          }),
        },
      });

      // 2. Deduct stock from the sub-warehouse of the client's governorate
      // IMPORTANT: Total physical deduction = quantity + bonusQuantity
      // LEGACY invoices NEVER deduct stock.
      // Each deduction is a conditional atomic UPDATE, so concurrent invoices
      // cannot both consume the same stock.
      if (!data.isLegacy && subWarehouse) {
        for (const item of serverItems) {
          const totalDeductQty = item.quantity + item.bonusQuantity;
          const productName = productMap.get(item.productId)?.name;

          await decrementStockOrThrow(tx, {
            warehouseId: subWarehouse.id,
            productId: item.productId,
            quantity: totalDeductQty,
            productName,
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
              create: serverItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity + item.bonusQuantity,
                unitCost: roundMoney(item.historicalCost),
                historicalCost: roundMoney(item.historicalCost),
              })),
            },
          },
        });
      }

      // 4. If there is an upfront payment, create a Payment record
      if (serverAmountPaidNow > 0) {
        const payment = await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            pharmacyId: data.pharmacyId,
            amount: serverAmountPaidNow,
            method: "CASH",
            notes: isCash
              ? "دفع نقدي عند إصدار الفاتورة"
              : "دفعة مقدمة عند إصدار الفاتورة آجل",
          },
        });

        // 4.1 Add itemized payment items for upfront credit payment
        if (!isCash && serverUpfrontItems.length > 0) {
          await tx.paymentItem.createMany({
            data: serverUpfrontItems.map((pi) => ({
              paymentId: payment.id,
              productId: pi.productId,
              paidQuantity: pi.paidQuantity,
              unitPrice: roundMoney(pi.unitPrice),
            })),
          });

          // 4.2 Update Rep Monthly Target achieved quantities on upfront payment
          if (!data.isLegacy && data.salesRepId) {
            const currentPeriod = getZonedYearMonth(new Date());
            const repMonthlyTarget = await tx.repMonthlyTarget.findUnique({
              where: {
                salesRepId_month_year: {
                  salesRepId: data.salesRepId,
                  month: currentPeriod.month,
                  year: currentPeriod.year,
                },
              },
              include: { items: true },
            });

            if (repMonthlyTarget) {
              for (const pi of serverUpfrontItems) {
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

        // 4.2 Sync with Treasury using an atomic increment.
        const treasury = await getOrCreateTreasury(tx);
        const updatedTreasury = await tx.treasury.update({
          where: { id: treasury.id },
          data: { currentBalance: { increment: serverAmountPaidNow } },
          select: { currentBalance: true },
        });

        await tx.transaction.create({
          data: {
            treasuryId: treasury.id,
            type: TransactionType.CASH_IN,
            category: TransactionCategory.INVOICE_PAYMENT,
            amount: serverAmountPaidNow,
            balanceAfter: updatedTreasury.currentBalance,
            description: `تحصيل دفعة لفاتورة رقم ${invoiceNumber} — ${pharmacy.name}`,
            paymentId: payment.id,
          },
        });
      }

      // 5. Update Client Balance — only for the outstanding credit portion
      if (effectiveType === InvoiceType.CREDIT && serverRemainingAmount > 0) {
        await tx.pharmacy.update({
          where: { id: data.pharmacyId },
          data: { currentBalance: { increment: serverRemainingAmount } },
        });
      }

      // 6. Update Pharmacy Target Progress
      if (!data.isLegacy) {
        const currentPeriod = getZonedYearMonth(new Date());
        const targetPeriod = await tx.pharmacyTargetPeriod.findFirst({
          where: {
            pharmacyId: data.pharmacyId,
            periodYear: currentPeriod.year,
            periodMonth: currentPeriod.month,
          },
        });

        if (targetPeriod) {
          const updatedTarget = await tx.pharmacyTargetPeriod.update({
            where: { id: targetPeriod.id },
            data: { achieved: { increment: serverTotalAmount } },
            include: { pharmacy: { select: { name: true } } },
          });

          const currentAchieved = Number(updatedTarget.achieved);
          const targetGoal = Number(updatedTarget.target);
          if (
            currentAchieved >= targetGoal &&
            currentAchieved - serverTotalAmount < targetGoal
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

    await prisma.$transaction(async (tx) => {
      // Serialize payments (and returns) for this invoice. The conditional
      // UPDATE below remains the final overpayment guard; this lock also makes
      // the itemized prior-paid-quantity check safe.
      await tx.$queryRaw`
        SELECT id FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE
      `;

      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: data.invoiceId },
        include: {
          pharmacy: { select: { name: true } },
          items: true,
        },
      });

      if (
        invoice.status === InvoiceStatus.PAID ||
        invoice.status === InvoiceStatus.CANCELLED ||
        invoice.status === InvoiceStatus.DRAFT
      ) {
        throw new Error("لا يمكن تسجيل دفعة على هذه الفاتورة في وضعها الحالي");
      }

      const invoiceQuantityByProduct = new Map<string, number>();
      for (const item of invoice.items) {
        invoiceQuantityByProduct.set(
          item.productId,
          (invoiceQuantityByProduct.get(item.productId) ?? 0) +
            Number(item.quantity)
        );
      }

      const invoiceSubtotal = Number(invoice.subtotal);
      const invoiceNetTotal = Math.max(
        0,
        invoiceSubtotal - Number(invoice.discountAmount)
      );
      const invoiceDiscountFactor =
        invoiceSubtotal > 0 ? invoiceNetTotal / invoiceSubtotal : 1;

      const priorPaidRows = await tx.paymentItem.groupBy({
        by: ["productId"],
        where: { payment: { invoiceId: invoice.id } },
        _sum: { paidQuantity: true },
      });
      const priorPaidByProduct = new Map(
        priorPaidRows.map((row) => [
          row.productId,
          Number(row._sum.paidQuantity ?? 0),
        ])
      );

      const requestedPaidByProduct = new Map<string, number>();
      const validatedPaymentItems: Array<{
        productId: string;
        paidQuantity: number;
        unitPrice: number;
      }> = [];

      // Itemized mode: the server recalculates the amount from immutable
      // invoice-item prices. Client-supplied unitPrice is ignored.
      let amount = roundMoney(Number(data.amount));

      if (data.paymentItems && data.paymentItems.length > 0) {
        let itemizedAmount = 0;

        for (const paymentItem of data.paymentItems) {
          const paidQuantity = Number(paymentItem.paidQuantity);
          if (!Number.isFinite(paidQuantity) || paidQuantity <= 0) continue;

          const invoiceItem = invoice.items.find(
            (item) => item.id === paymentItem.invoiceItemId
          );
          if (
            !invoiceItem ||
            invoiceItem.productId !== paymentItem.productId
          ) {
            throw new Error("أحد أصناف الدفعة لا ينتمي إلى هذه الفاتورة");
          }

          const alreadyPaid = priorPaidByProduct.get(invoiceItem.productId) ?? 0;
          const alreadyRequested =
            requestedPaidByProduct.get(invoiceItem.productId) ?? 0;
          const invoiceQuantity =
            invoiceQuantityByProduct.get(invoiceItem.productId) ?? 0;

          if (
            alreadyPaid + alreadyRequested + paidQuantity >
            invoiceQuantity + 1e-9
          ) {
            throw new Error(
              `الكمية المدفوعة من المنتج "${invoiceItem.productId}" أكبر من الكمية المتبقية غير المدفوعة`
            );
          }

          requestedPaidByProduct.set(
            invoiceItem.productId,
            alreadyRequested + paidQuantity
          );

          const storedDiscountedPrice = Number(
            invoiceItem.discountedUnitPrice
          );
          const effectivePrice =
            storedDiscountedPrice > 0
              ? storedDiscountedPrice
              : Number(invoiceItem.unitPrice) * invoiceDiscountFactor;

          itemizedAmount += paidQuantity * effectivePrice;
          validatedPaymentItems.push({
            productId: invoiceItem.productId,
            paidQuantity,
            unitPrice: roundMoney(effectivePrice),
          });
        }

        if (validatedPaymentItems.length === 0) {
          throw new Error("حدد كمية لمنتج واحد على الأقل");
        }

        amount = roundMoney(itemizedAmount);
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("قيمة الدفعة يجب أن تكون أكبر من 0");
      }

      const currentRemaining = Number(invoice.remainingAmount);
      if (amount > currentRemaining + 0.005) {
        throw new Error(
          `المبلغ المدفوع (${amount.toFixed(2)}) أكبر من المبلغ المتبقي (${currentRemaining.toFixed(2)})`
        );
      }

      // Atomic conditional balance update. The database rejects the update if
      // another payment already consumed the remaining balance.
      const updatedInvoice = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          status: {
            notIn: [
              InvoiceStatus.PAID,
              InvoiceStatus.CANCELLED,
              InvoiceStatus.DRAFT,
            ],
          },
          remainingAmount: { gte: amount },
        },
        data: {
          paidAmount: { increment: amount },
          remainingAmount: { decrement: amount },
        },
      });

      if (updatedInvoice.count !== 1) {
        throw new Error(
          "تغيّر رصيد الفاتورة أثناء تسجيل الدفعة. يرجى إعادة المحاولة."
        );
      }

      const updatedBalances = await tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { remainingAmount: true },
      });

      const newStatus =
        Number(updatedBalances.remainingAmount) <= 0.005
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: newStatus },
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

      // 2.1 Sync with Treasury using an atomic increment.
      const treasury = await getOrCreateTreasury(tx);
      const updatedTreasury = await tx.treasury.update({
        where: { id: treasury.id },
        data: { currentBalance: { increment: amount } },
        select: { currentBalance: true },
      });

      await tx.transaction.create({
        data: {
          treasuryId: treasury.id,
          type: TransactionType.CASH_IN,
          category: TransactionCategory.INVOICE_PAYMENT,
          amount: amount,
          balanceAfter: updatedTreasury.currentBalance,
          description: `تحصيل دفعة لفاتورة رقم ${invoice.invoiceNumber} — ${invoice.pharmacy.name}`,
          paymentId: payment.id,
        },
      });

      // 3. If itemized, create server-validated PaymentItem records
      if (validatedPaymentItems.length > 0) {
        await tx.paymentItem.createMany({
          data: validatedPaymentItems.map((pi) => ({
            paymentId: payment.id,
            productId: pi.productId,
            paidQuantity: pi.paidQuantity,
            unitPrice: pi.unitPrice,
          })),
        });

        // 4. Update Rep Monthly Target achievedQuantity based on paid quantities
        // Targets are updated on PAYMENT, not on invoice creation
        if (invoice.salesRepId) {
          const currentPeriod = getZonedYearMonth(new Date());
          const repMonthlyTarget = await tx.repMonthlyTarget.findUnique({
            where: {
              salesRepId_month_year: {
                salesRepId: invoice.salesRepId,
                month: currentPeriod.month,
                year: currentPeriod.year,
              },
            },
            include: { items: true },
          });

          if (repMonthlyTarget) {
            for (const pi of validatedPaymentItems) {
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
        const currentPeriod = getZonedYearMonth(new Date());
        const legacyRepTarget = await tx.repMonthlyTarget.findUnique({
          where: {
            salesRepId_month_year: {
              salesRepId: repId,
              month: currentPeriod.month,
              year: currentPeriod.year,
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

      // Serialize with new payments/returns for this invoice.
      await tx.$queryRaw`
        SELECT id FROM invoices WHERE id = ${invoice.id} FOR UPDATE
      `;

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("قيمة الدفعة غير صالحة ولا يمكن عكسها");
      }

      // 1. Atomically restore the invoice balances. The guard prevents paid
      // amount from becoming negative if another reversal already ran.
      const reversedInvoice = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          paidAmount: { gte: amount },
        },
        data: {
          paidAmount: { decrement: amount },
          remainingAmount: { increment: amount },
        },
      });

      if (reversedInvoice.count !== 1) {
        throw new Error(
          "تغيّر رصيد الفاتورة أثناء حذف الدفعة. يرجى إعادة المحاولة."
        );
      }

      const refreshedInvoice = await tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { paidAmount: true, remainingAmount: true },
      });

      const newStatus = resolveInvoiceStatusAfterPaymentReversal(
        Number(refreshedInvoice.paidAmount),
        Number(refreshedInvoice.remainingAmount)
      );

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: newStatus },
      });

      // 2. Restore the client's debt.
      await restoreClientDebtForPayment(tx, invoice.pharmacyId, amount);

      // 3. Reverse the treasury impact atomically.
      const treasury = await getOrCreateTreasury(tx);
      await tx.treasury.update({
        where: { id: treasury.id },
        data: { currentBalance: { decrement: amount } },
      });

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
        const invoicePeriod = getZonedYearMonth(invoice.createdAt);
        const targetPeriod = await tx.pharmacyTargetPeriod.findFirst({
          where: {
            pharmacyId: invoice.pharmacyId,
            periodYear: invoicePeriod.year,
            periodMonth: invoicePeriod.month,
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
          const treasury = await getOrCreateTreasury(tx);
          await tx.treasury.update({
            where: { id: treasury.id },
            data: { currentBalance: { decrement: cashToRemove } },
          });
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
      // Resolve the target explicitly when the edit form sends an id. This
      // prevents a manipulated month/year from silently writing to another
      // period, and lets us verify the target still belongs to the same rep.
      const existing = data.targetId
        ? await tx.repMonthlyTarget.findUnique({
            where: { id: data.targetId },
            include: { items: true },
          })
        : await tx.repMonthlyTarget.findUnique({
            where: {
              salesRepId_month_year: {
                salesRepId: data.salesRepId,
                month: data.month,
                year: data.year,
              },
            },
            include: { items: true },
          });

      if (data.targetId) {
        if (!existing) {
          throw new Error("الهدف المطلوب غير موجود أو تم حذفه مسبقاً");
        }
        if (
          existing.salesRepId !== data.salesRepId ||
          existing.month !== data.month ||
          existing.year !== data.year
        ) {
          throw new Error(
            "لا يمكن تغيير فترة هدف مسجل. يرجى تحديث الفترة الصحيحة أو إنشاء هدف جديد."
          );
        }
      }

      const requestedProductIds = new Set(
        data.items.map((item) => item.productId)
      );

      if (
        existing?.items.some(
          (item) =>
            !requestedProductIds.has(item.productId) &&
            Number(item.achievedQuantity) > 0
        )
      ) {
        throw new Error(
          "لا يمكن حذف منتج له كمية محققة. يمكنك تعديل الكمية المستهدفة مع الحفاظ على الإنجاز."
        );
      }

      let targetId: string;

      if (existing) {
        const target = await tx.repMonthlyTarget.update({
          where: { id: existing.id },
          data: { notes: data.notes || null },
        });
        targetId = target.id;
      } else {
        const target = await tx.repMonthlyTarget.create({
          data: {
            salesRepId: data.salesRepId,
            month: data.month,
            year: data.year,
            notes: data.notes || null,
          },
        });
        targetId = target.id;
      }

      // Upsert each line and update ONLY targetQuantity. achievedQuantity is
      // accumulated by payments; it must never be reset when a manager edits
      // the plan for an existing month.
      for (const item of data.items) {
        await tx.repMonthlyTargetItem.upsert({
          where: {
            targetId_productId: {
              targetId,
              productId: item.productId,
            },
          },
          create: {
            targetId,
            productId: item.productId,
            targetQuantity: item.targetQuantity,
          },
          update: {
            targetQuantity: item.targetQuantity,
          },
        });
      }

      // Only remove lines that the manager deliberately removed and that had
      // no achievement (guarded above).
      await tx.repMonthlyTargetItem.deleteMany({
        where: {
          targetId,
          productId: { notIn: Array.from(requestedProductIds) },
        },
      });

      return { id: targetId };
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
  const session = await requireAuth();
  if (
    session.user.role === UserRole.SALES_REP &&
    salesRepId !== session.user.salesRepId
  ) {
    throw new Error("Unauthorized / غير مصرح لك بالقيام بهذا الإجراء");
  }
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
  const session = await requireAuth();
  if (
    session.user.role === UserRole.SALES_REP &&
    salesRepId !== session.user.salesRepId
  ) {
    throw new Error("Unauthorized / غير مصرح لك بالقيام بهذا الإجراء");
  }
  const { start: startOfMonth, endExclusive: endOfMonth } =
    getZonedMonthRange(year, month);

  // 1. Regular invoice payments
  const regularPayments = await prisma.payment.findMany({
    where: {
      invoice: {
        salesRepId,
        isLegacy: false,
        invoiceDate: { gte: startOfMonth, lt: endOfMonth },
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
