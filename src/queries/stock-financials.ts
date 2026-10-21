import { StockMovementSource, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveMovementItemValue, resolveProductCost } from "@/lib/costing";

/**
 * Small read-only query layer for the inventory-related figures that appear in
 * the financial statements, inventory dashboard and stock-movement ledger.
 *
 * Opening balances, shortages and surpluses are non-cash movements: they never
 * touch the treasury or supplier balances. Their value is kept on the movement
 * itself (`StockMovement.totalCost`) and is also derivable from its lines.
 */

interface MovementValueRow {
  totalCost: unknown;
  items: Array<{
    quantity: unknown;
    unitCost: unknown;
    product: { costPrice: unknown; sellingPrice: unknown };
  }>;
}

const movementValueSelect = {
  totalCost: true,
  items: {
    select: {
      quantity: true,
      unitCost: true,
      product: { select: { costPrice: true, sellingPrice: true } },
    },
  },
} as const;

function getMovementValue(movement: MovementValueRow): number {
  if (movement.totalCost !== null && movement.totalCost !== undefined) {
    const total = Number(movement.totalCost);
    if (Number.isFinite(total)) return total;
  }

  return movement.items.reduce(
    (sum, item) => sum + resolveMovementItemValue(item),
    0
  );
}

function dateFilter(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

/** Current value of all positive stock at product cost. */
export async function getInventoryValuation(): Promise<number> {
  const stockItems = await prisma.stockItem.findMany({
    where: { quantity: { gt: 0 } },
    select: {
      quantity: true,
      product: { select: { costPrice: true, sellingPrice: true } },
    },
  });

  return stockItems.reduce(
    (sum, item) =>
      sum + Number(item.quantity) * resolveProductCost(item.product),
    0
  );
}

/** All-time value of warehouse opening balances (opening inventory capital). */
export async function getOpeningStockValue(): Promise<number> {
  const [storedValue, missingValueMovements] = await Promise.all([
    prisma.stockMovement.aggregate({
      where: {
        movementType: StockMovementType.OPENING_BALANCE,
        totalCost: { not: null },
      },
      _sum: { totalCost: true },
    }),
    // Safe fallback for any legacy row that predates totalCost.
    prisma.stockMovement.findMany({
      where: {
        movementType: StockMovementType.OPENING_BALANCE,
        totalCost: null,
      },
      select: movementValueSelect,
    }),
  ]);

  return (
    Number(storedValue._sum.totalCost ?? 0) +
    missingValueMovements.reduce(
      (sum, movement) => sum + getMovementValue(movement),
      0
    )
  );
}

/** Cost value of shortage (loss) and surplus (gain) count corrections. */
export async function getStockAdjustmentTotals(
  from?: Date,
  to?: Date
): Promise<{ shortageValue: number; surplusValue: number }> {
  const movedAt = dateFilter(from, to);

  const baseWhere = {
    movementType: {
      in: [
        StockMovementType.ADJUSTMENT_IN,
        StockMovementType.ADJUSTMENT_OUT,
      ],
    },
    ...(movedAt ? { movedAt } : {}),
  };

  const [shortageStored, surplusStored, missingValueMovements] =
    await Promise.all([
      prisma.stockMovement.aggregate({
        where: {
          ...baseWhere,
          movementType: StockMovementType.ADJUSTMENT_OUT,
          totalCost: { not: null },
        },
        _sum: { totalCost: true },
      }),
      prisma.stockMovement.aggregate({
        where: {
          ...baseWhere,
          movementType: StockMovementType.ADJUSTMENT_IN,
          totalCost: { not: null },
        },
        _sum: { totalCost: true },
      }),
      prisma.stockMovement.findMany({
        where: { ...baseWhere, totalCost: null },
        select: {
          movementType: true,
          ...movementValueSelect,
        },
      }),
    ]);

  let shortageValue = Number(shortageStored._sum.totalCost ?? 0);
  let surplusValue = Number(surplusStored._sum.totalCost ?? 0);

  for (const movement of missingValueMovements) {
    const value = getMovementValue(movement);
    if (movement.movementType === StockMovementType.ADJUSTMENT_OUT) {
      shortageValue += value;
    } else {
      surplusValue += value;
    }
  }

  return { shortageValue, surplusValue };
}

/**
 * Cost value of free samples / promotional items dispatched in a period.
 *
 * These movements reduce inventory but are reported as a marketing expense,
 * not as an inventory shortage or a cash outflow.
 */
export async function getSamplesDispatchValue(
  from?: Date,
  to?: Date
): Promise<number> {
  const movedAt = dateFilter(from, to);
  const baseWhere = {
    movementType: StockMovementType.SAMPLES_DISPATCH,
    ...(movedAt ? { movedAt } : {}),
  };

  const [storedValue, missingValueMovements] = await Promise.all([
    prisma.stockMovement.aggregate({
      where: { ...baseWhere, totalCost: { not: null } },
      _sum: { totalCost: true },
    }),
    prisma.stockMovement.findMany({
      where: { ...baseWhere, totalCost: null },
      select: movementValueSelect,
    }),
  ]);

  return (
    Number(storedValue._sum.totalCost ?? 0) +
    missingValueMovements.reduce(
      (sum, movement) => sum + getMovementValue(movement),
      0
    )
  );
}

/** Value of regular supplier receipts in a period (not opening balances). */
export async function getPurchasesValue(from?: Date, to?: Date): Promise<number> {
  const movedAt = dateFilter(from, to);
  const baseWhere = {
    movementType: StockMovementType.INBOUND,
    source: StockMovementSource.SUPPLIER,
    ...(movedAt ? { movedAt } : {}),
  };

  const [storedValue, missingValueMovements] = await Promise.all([
    prisma.stockMovement.aggregate({
      where: { ...baseWhere, totalCost: { not: null } },
      _sum: { totalCost: true },
    }),
    prisma.stockMovement.findMany({
      where: { ...baseWhere, totalCost: null },
      select: movementValueSelect,
    }),
  ]);

  return (
    Number(storedValue._sum.totalCost ?? 0) +
    missingValueMovements.reduce(
      (sum, movement) => sum + getMovementValue(movement),
      0
    )
  );
}

export interface InventoryFinancialSummary {
  inventoryValue: number;
  openingStockValue: number;
  shortageValue: number;
  surplusValue: number;
  purchasesValue: number;
  samplesValue: number;
}

export async function getInventoryFinancialSummary(options?: {
  from?: Date;
  to?: Date;
}): Promise<InventoryFinancialSummary> {
  const { from, to } = options ?? {};

  const [
    inventoryValue,
    openingStockValue,
    adjustments,
    purchasesValue,
    samplesValue,
  ] = await Promise.all([
    getInventoryValuation(),
    getOpeningStockValue(),
    getStockAdjustmentTotals(from, to),
    getPurchasesValue(from, to),
    getSamplesDispatchValue(from, to),
  ]);

  return {
    inventoryValue,
    openingStockValue,
    shortageValue: adjustments.shortageValue,
    surplusValue: adjustments.surplusValue,
    purchasesValue,
    samplesValue,
  };
}
