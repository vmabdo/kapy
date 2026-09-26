"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import {
  StockMovementType,
  StockMovementSource,
  UserRole,
} from "@prisma/client";
import { z } from "zod";

// ─── Result type ──────────────────────────────────────────────
type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

// ─── Schemas ──────────────────────────────────────────────────

const CustodyItemSchema = z.object({
  productId: z.string().min(1, "المنتج مطلوب"),
  quantity: z.coerce
    .number()
    .int()
    .positive("الكمية يجب أن تكون أكبر من 0"),
});

const TransferToRepSchema = z.object({
  salesRepId: z.string().min(1, "المندوب مطلوب"),
  warehouseId: z.string().min(1, "المخزن مطلوب"),
  notes: z.string().optional(),
  items: z
    .array(CustodyItemSchema)
    .min(1, "يجب إضافة منتج واحد على الأقل"),
});

const ReturnFromRepSchema = z.object({
  salesRepId: z.string().min(1, "المندوب مطلوب"),
  warehouseId: z.string().min(1, "المخزن الهدف مطلوب"),
  notes: z.string().optional(),
  items: z
    .array(CustodyItemSchema)
    .min(1, "يجب إضافة منتج واحد على الأقل"),
});

// ─── Transfer Stock from Warehouse to Rep ─────────────────────
export async function transferToRep(
  formData: z.infer<typeof TransferToRepSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.WAREHOUSE_MANAGER,
      UserRole.SALES_MANAGER,
    ]);

    const data = TransferToRepSchema.parse(formData);

    // Pre-check: warehouse stock availability
    for (const item of data.items) {
      const stockItem = await prisma.stockItem.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: data.warehouseId,
            productId: item.productId,
          },
        },
        include: { product: { select: { name: true } } },
      });
      const available =
        (stockItem?.quantity ?? 0) - (stockItem?.reservedQty ?? 0);
      if (available < item.quantity) {
        return {
          success: false,
          error: `المخزون غير كافٍ للمنتج "${stockItem?.product.name ?? item.productId}". المتاح: ${available}، المطلوب: ${item.quantity}`,
        };
      }
    }

    // Atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create a RepInventory batch record
      const repInventory = await tx.repInventory.create({
        data: {
          salesRepId: data.salesRepId,
          warehouseId: data.warehouseId,
          notes: data.notes ?? null,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              issuedQty: item.quantity,
              soldQty: 0,
              returnedQty: 0,
              currentQty: item.quantity,
            })),
          },
        },
      });

      // 2. Deduct from warehouse StockItem
      for (const item of data.items) {
        await tx.stockItem.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: data.warehouseId,
              productId: item.productId,
            },
          },
          update: { quantity: { decrement: item.quantity } },
          create: {
            warehouseId: data.warehouseId,
            productId: item.productId,
            quantity: -item.quantity,
          },
        });
      }

      // 3. Record a StockMovement for audit trail
      const movement = await tx.stockMovement.create({
        data: {
          movementType: StockMovementType.OUTBOUND,
          source: StockMovementSource.SALES_REP,
          sourceWarehouseId: data.warehouseId,
          salesRepId: data.salesRepId,
          notes: data.notes
            ? `صرف للمندوب — ${data.notes}`
            : "صرف بضاعة للمندوب (عهدة)",
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
      });

      return { repInventory, movement };
    });

    revalidatePath(`/dashboard/sales-reps/${data.salesRepId}`);
    revalidatePath("/dashboard/inventory");
    return {
      success: true,
      data: { id: result.repInventory.id },
      message: "تم صرف البضاعة للمندوب بنجاح",
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "حدث خطأ غير متوقع",
    };
  }
}

// ─── Return Stock from Rep to Warehouse ───────────────────────
export async function returnFromRep(
  formData: z.infer<typeof ReturnFromRepSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.WAREHOUSE_MANAGER,
      UserRole.SALES_MANAGER,
    ]);

    const data = ReturnFromRepSchema.parse(formData);

    // Pre-check: rep has enough custody qty for each product
    for (const item of data.items) {
      const available = await getRepProductCurrentQty(
        data.salesRepId,
        item.productId
      );
      if (available < item.quantity) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true },
        });
        return {
          success: false,
          error: `المندوب لا يملك كمية كافية من "${product?.name ?? item.productId}" في عهدته. المتاح: ${available}، المطلوب: ${item.quantity}`,
        };
      }
    }

    // Atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Deduct from rep's open RepInventoryItem records (FIFO across batches)
      for (const item of data.items) {
        let remaining = item.quantity;

        const openItems = await tx.repInventoryItem.findMany({
          where: {
            productId: item.productId,
            currentQty: { gt: 0 },
            repInventory: {
              salesRepId: data.salesRepId,
              closedAt: null,
            },
          },
          include: { repInventory: { select: { issuedAt: true } } },
          orderBy: { repInventory: { issuedAt: "asc" } },
        });

        for (const batchItem of openItems) {
          if (remaining <= 0) break;
          const deduct = Math.min(batchItem.currentQty, remaining);
          await tx.repInventoryItem.update({
            where: { id: batchItem.id },
            data: {
              returnedQty: { increment: deduct },
              currentQty: { decrement: deduct },
            },
          });
          remaining -= deduct;
        }
      }

      // 2. Increment warehouse StockItem
      for (const item of data.items) {
        await tx.stockItem.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: data.warehouseId,
              productId: item.productId,
            },
          },
          update: { quantity: { increment: item.quantity } },
          create: {
            warehouseId: data.warehouseId,
            productId: item.productId,
            quantity: item.quantity,
          },
        });
      }

      // 3. Record a StockMovement for audit trail
      const movement = await tx.stockMovement.create({
        data: {
          movementType: StockMovementType.RETURN_INBOUND,
          source: StockMovementSource.SALES_REP,
          targetWarehouseId: data.warehouseId,
          salesRepId: data.salesRepId,
          notes: data.notes
            ? `إرجاع من المندوب — ${data.notes}`
            : "إرجاع بضاعة من المندوب للمخزن",
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
      });

      return movement;
    });

    revalidatePath(`/dashboard/sales-reps/${data.salesRepId}`);
    revalidatePath("/dashboard/inventory");
    return {
      success: true,
      data: { id: result.id },
      message: "تم إرجاع البضاعة للمخزن بنجاح",
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "حدث خطأ غير متوقع",
    };
  }
}

// ─── Helper: aggregate a rep's current qty for one product ────
export async function getRepProductCurrentQty(
  salesRepId: string,
  productId: string
): Promise<number> {
  const result = await prisma.repInventoryItem.aggregate({
    where: {
      productId,
      repInventory: { salesRepId, closedAt: null },
    },
    _sum: { currentQty: true },
  });
  return result._sum.currentQty ?? 0;
}

// ─── Query: get aggregated rep custody inventory ───────────────
export async function getRepCustodyInventory(salesRepId: string) {
  const items = await prisma.repInventoryItem.findMany({
    where: {
      repInventory: { salesRepId, closedAt: null },
    },
    include: {
      product: {
        select: { id: true, name: true, sku: true, unit: true },
      },
      repInventory: {
        select: { issuedAt: true, warehouseId: true },
      },
    },
  });

  // Aggregate per product
  const aggregated = new Map<
    string,
    {
      productId: string;
      productName: string;
      productSku: string;
      productUnit: string;
      currentQty: number;
      issuedQty: number;
      soldQty: number;
      returnedQty: number;
    }
  >();

  for (const item of items) {
    const existing = aggregated.get(item.productId);
    if (existing) {
      existing.currentQty += item.currentQty;
      existing.issuedQty += item.issuedQty;
      existing.soldQty += item.soldQty;
      existing.returnedQty += item.returnedQty;
    } else {
      aggregated.set(item.productId, {
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        productUnit: item.product.unit,
        currentQty: item.currentQty,
        issuedQty: item.issuedQty,
        soldQty: item.soldQty,
        returnedQty: item.returnedQty,
      });
    }
  }

  return Array.from(aggregated.values());
}
