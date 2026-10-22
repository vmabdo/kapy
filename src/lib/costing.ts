/**
 * Shared inventory costing rules.
 *
 * Products may not have a cost price yet. In that case the rest of the
 * application historically used 60% of the selling price as a conservative
 * fallback, so we keep that behaviour in one place.
 */
export const FALLBACK_COST_RATE = 0.6;

export function resolveProductCost(product: {
  costPrice?: unknown;
  sellingPrice?: unknown;
} | null | undefined): number {
  if (!product) return 0;

  if (product.costPrice !== null && product.costPrice !== undefined) {
    const cost = Number(product.costPrice);
    if (Number.isFinite(cost)) return cost;
  }

  const sellingPrice = Number(product.sellingPrice ?? 0);
  return Number.isFinite(sellingPrice) ? sellingPrice * FALLBACK_COST_RATE : 0;
}

/**
 * Resolve a line's immutable cost snapshot.
 *
 * `historicalCost` is the field written by every new invoice/stock movement.
 * Rows created before the field existed have 0, so fall back to the line's
 * `unitCost`, then to the live product cost. The fallback is only for legacy
 * data and disappears as historical rows are backfilled.
 */
export function resolveHistoricalCost(
  item: {
    historicalCost?: unknown;
    unitCost?: unknown;
  },
  product?: { costPrice?: unknown; sellingPrice?: unknown } | null
): number {
  const historical = Number(item.historicalCost ?? 0);
  if (Number.isFinite(historical) && historical > 0) {
    return historical;
  }

  if (item.unitCost !== null && item.unitCost !== undefined) {
    const unitCost = Number(item.unitCost);
    if (Number.isFinite(unitCost) && unitCost >= 0) {
      return unitCost;
    }
  }

  return resolveProductCost(product);
}

/** Value one movement line: quantity × unit cost (with product cost fallback). */
export function resolveMovementItemValue(item: {
  quantity?: unknown;
  unitCost?: unknown;
  historicalCost?: unknown;
  product?: { costPrice?: unknown; sellingPrice?: unknown } | null;
}): number {
  const quantity = Number(item.quantity ?? 0);
  const unitCost = resolveHistoricalCost(item, item.product);

  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return 0;
  return quantity * unitCost;
}
