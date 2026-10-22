import { prisma } from "@/lib/prisma";
import { StockMovementSource, StockMovementType, WarehouseType } from "@prisma/client";

// ─── Warehouses ───────────────────────────────────────────────

export async function getAllWarehouses() {
  return prisma.warehouse.findMany({
    where: { isActive: true },
    include: {
      governorate: { select: { name: true } },
      managers: { select: { name: true, phone: true }, take: 1 },
      stockItems: {
        select: { quantity: true },
      },
      _count: { select: { stockItems: true } },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

export async function getWarehouseById(id: string) {
  return prisma.warehouse.findUnique({
    where: { id },
    include: {
      governorate: true,
      managers: true,
      stockItems: {
        include: {
          product: {
            include: { category: { select: { name: true } } },
          },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
}

export async function getMainWarehouse() {
  return prisma.warehouse.findFirst({
    where: { type: WarehouseType.MAIN, isActive: true },
  });
}

// ─── Products ─────────────────────────────────────────────────

export async function getAllProducts(warehouseId?: string) {
  return prisma.product.findMany({
    where: { isActive: true },
    include: {
      category: { select: { name: true } },
      stockItems: warehouseId
        ? { where: { warehouseId }, select: { quantity: true, reservedQty: true, warehouseId: true } }
        : { select: { quantity: true, reservedQty: true, warehouseId: true } },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Light-weight catalogue used by invoice/return detail forms. Avoids loading
 * every warehouse balance when only product labels and selling prices are
 * needed.
 */
export async function getProductOptions() {
  return prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      sellingPrice: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      suppliers: { include: { supplier: { select: { name: true } } } },
      stockItems: { include: { warehouse: { select: { name: true, type: true } } } },
    },
  });
}

export async function getAllCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function getAllSuppliers() {
  return prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function getAllSuppliersWithCount() {
  return prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { stockMovements: true, products: true } },
    },
  });
}

// ─── Stock Items (balances) ────────────────────────────────────

export async function getStockByWarehouse(warehouseId: string) {
  return prisma.stockItem.findMany({
    where: { warehouseId },
    include: {
      product: {
        include: { category: { select: { name: true } } },
      },
    },
    orderBy: { product: { name: "asc" } },
  });
}

export interface LowStockItem {
  /** Product id — low-stock detection is product-level, not per warehouse. */
  id: string;
  productId: string;
  /** Sum of quantity across every warehouse. */
  quantity: number;
  threshold: number;
  /** Number of warehouse balance rows that contribute to the total. */
  warehouseCount: number;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    reorderLevel: number;
    category: { name: string };
  };
}

interface LowStockRow {
  id: string;
  productId: string;
  quantity: number;
  threshold: number;
  warehouseCount: number;
  productName: string;
  productSku: string;
  productUnit: string;
  reorderLevel: number;
  categoryName: string;
}

/**
 * Products whose *aggregated* stock has reached their reorder level.
 *
 * Stock is tracked per warehouse, but low-stock status is a product-level
 * decision: a product with 100 units in the main warehouse and 0 in a sub
 * warehouse is healthy. Aggregating in PostgreSQL avoids both the per-row false
 * positives and loading the full product/stock catalogue into Node.
 *
 * `fallbackThreshold` is used for products whose reorderLevel is 0 (the
 * low-stock report exposes a global setting for those products).
 */
export async function getLowStockItems(options?: {
  fallbackThreshold?: number;
}): Promise<LowStockItem[]> {
  const fallbackThreshold = Math.max(
    0,
    Math.trunc(Number(options?.fallbackThreshold) || 0)
  );

  const rows = await prisma.$queryRaw<LowStockRow[]>`
    WITH stock_totals AS (
      SELECT
        si."productId" AS "productId",
        SUM(si.quantity)::float8 AS "quantity",
        COUNT(*)::int AS "warehouseCount"
      FROM "stock_items" si
      GROUP BY si."productId"
    ),
    product_stock AS (
      SELECT
        p.id AS "id",
        p.id AS "productId",
        COALESCE(st."quantity", 0)::float8 AS "quantity",
        CASE
          WHEN p."reorderLevel" > 0 THEN p."reorderLevel"
          ELSE ${fallbackThreshold}::int
        END AS "threshold",
        COALESCE(st."warehouseCount", 0)::int AS "warehouseCount",
        p.name AS "productName",
        p.sku AS "productSku",
        p.unit AS "productUnit",
        p."reorderLevel" AS "reorderLevel",
        c.name AS "categoryName"
      FROM "products" p
      INNER JOIN "categories" c ON c.id = p."categoryId"
      LEFT JOIN stock_totals st ON st."productId" = p.id
      WHERE p."isActive" = true
    )
    SELECT
      "id",
      "productId",
      "quantity",
      "threshold",
      "warehouseCount",
      "productName",
      "productSku",
      "productUnit",
      "reorderLevel",
      "categoryName"
    FROM product_stock
    WHERE "threshold" > 0
      AND "quantity" <= "threshold"
    ORDER BY "quantity" ASC, "productName" ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    quantity: Number(row.quantity) || 0,
    threshold: Number(row.threshold) || 0,
    warehouseCount: Number(row.warehouseCount) || 0,
    product: {
      id: row.productId,
      name: row.productName,
      sku: row.productSku,
      unit: row.productUnit,
      reorderLevel: Number(row.reorderLevel) || 0,
      category: { name: row.categoryName },
    },
  }));
}

/** Lightweight balances used by inventory operation forms. */
export async function getStockLevels() {
  return prisma.stockItem.findMany({
    select: {
      warehouseId: true,
      productId: true,
      quantity: true,
      reservedQty: true,
    },
    orderBy: [{ warehouseId: "asc" }, { productId: "asc" }],
  });
}

// ─── Stock Movements ──────────────────────────────────────────

export async function getStockMovements(filters?: {
  warehouseId?: string;
  movementType?: StockMovementType;
  source?: StockMovementSource;
  from?: Date;
  to?: Date;
  take?: number;
  skip?: number;
}) {
  const { warehouseId, movementType, source, from, to, take = 50, skip = 0 } = filters ?? {};

  return prisma.stockMovement.findMany({
    where: {
      ...(warehouseId && {
        OR: [
          { sourceWarehouseId: warehouseId },
          { targetWarehouseId: warehouseId },
        ],
      }),
      ...(movementType && { movementType }),
      ...(source && { source }),
      ...(from && { movedAt: { gte: from } }),
      ...(to && { movedAt: { lte: to } }),
    },
    include: {
      sourceWarehouse: { select: { name: true } },
      targetWarehouse: { select: { name: true } },
      supplier: { select: { name: true } },
      salesRep: { select: { name: true } },
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              unit: true,
              costPrice: true,
              sellingPrice: true,
            },
          },
        },
      },
    },
    orderBy: { movedAt: "desc" },
    take,
    skip,
  });
}

export async function getStockMovementById(id: string) {
  return prisma.stockMovement.findUnique({
    where: { id },
    include: {
      sourceWarehouse: true,
      targetWarehouse: true,
      supplier: true,
      salesRep: { select: { name: true, employeeCode: true } },
      items: {
        include: { product: { include: { category: { select: { name: true } } } } },
      },
    },
  });
}

// ─── Governorates (for forms) ─────────────────────────────────

export async function getAllGovernorates() {
  return prisma.governorate.findMany({ orderBy: { name: "asc" } });
}
