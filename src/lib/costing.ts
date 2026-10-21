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

/** Value one movement line: quantity × unit cost (with product cost fallback). */
export function resolveMovementItemValue(item: {
  quantity?: unknown;
  unitCost?: unknown;
  product?: { costPrice?: unknown; sellingPrice?: unknown } | null;
}): number {
  const quantity = Number(item.quantity ?? 0);
  const unitCost =
    item.unitCost !== null && item.unitCost !== undefined
      ? Number(item.unitCost)
      : resolveProductCost(item.product);

  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return 0;
  return quantity * unitCost;
}
