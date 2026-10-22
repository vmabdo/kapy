-- One-time backfill for historical cost snapshots.
-- Run immediately after `prisma db push` (before new invoices/movements are
-- created). Existing rows have historicalCost = 0 because the columns are new.
--
-- The best available approximation for old rows is the product's current cost
-- (or the shared 60%-of-selling-price fallback). New rows written by the
-- application always store an immutable snapshot at transaction time.

UPDATE invoice_items AS ii
SET "historicalCost" = COALESCE(p."costPrice", p."sellingPrice" * 0.6, 0)
FROM products AS p
WHERE ii."productId" = p.id
  AND ii."historicalCost" = 0;

UPDATE stock_movement_items AS smi
SET "historicalCost" = COALESCE(
  smi."unitCost",
  p."costPrice",
  p."sellingPrice" * 0.6,
  0
)
FROM products AS p
WHERE smi."productId" = p.id
  AND smi."historicalCost" = 0;
