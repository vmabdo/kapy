import { Prisma } from "@prisma/client";

interface DecrementStockInput {
  warehouseId: string;
  productId: string;
  quantity: number;
  productName?: string;
}

/**
 * Atomically decrements a stock balance only when enough physical stock still
 * exists. The conditional UPDATE is the source of truth; the pre-transaction
 * checks in the UI/actions are only advisory.
 *
 * Returns normally when the deduction succeeded. Throws when the row is
 * missing or another transaction consumed the stock first.
 */
export async function decrementStockOrThrow(
  tx: Prisma.TransactionClient,
  input: DecrementStockInput
): Promise<void> {
  const { warehouseId, productId, quantity, productName } = input;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("كمية الخصم من المخزون يجب أن تكون أكبر من 0");
  }

  const updated = await tx.stockItem.updateMany({
    where: {
      warehouseId,
      productId,
      quantity: { gte: quantity },
    },
    data: {
      quantity: { decrement: quantity },
    },
  });

  if (updated.count !== 1) {
    const current = await tx.stockItem.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
      select: { quantity: true },
    });

    const available = current ? Number(current.quantity) : 0;
    const label = productName ? ` "${productName}"` : "";

    throw new Error(
      `المخزون غير كافٍ للمنتج${label}. المتاح حالياً: ${available}، المطلوب: ${quantity}. ` +
        "Insufficient stock due to concurrent transaction."
    );
  }
}
