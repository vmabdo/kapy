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
  id: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  threshold: number;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    reorderLevel: number;
    category: { name: string };
  };
  warehouse: {
    id: string;
    name: string;
    type: WarehouseType;
  };
}

interface LowStockRow {
  id: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  threshold: number;
  productName: string;
  productSku: string;
  productUnit: string;
  reorderLevel: number;
  categoryName: string;
  warehouseName: string;
  warehouseType: WarehouseType;
}

/**
 * Low-stock rows are filtered and joined in PostgreSQL. The previous version
 * loaded every stock item + product + warehouse into Node just to compare
 * `quantity` with the per-product reorder level, which could exhaust memory on
 * a large catalogue.
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
    SELECT
      si.id AS "id",
      si."warehouseId" AS "warehouseId",
      si."productId" AS "productId",
      si.quantity::float8 AS "quantity",
      CASE
        WHEN p."reorderLevel" > 0 THEN p."reorderLevel"
        ELSE ${fallbackThreshold}
      END AS "threshold",
      p.name AS "productName",
      p.sku AS "productSku",
      p.unit AS "productUnit",
      p."reorderLevel" AS "reorderLevel",
      c.name AS "categoryName",
      w.name AS "warehouseName",
      w.type::text AS "warehouseType"
    FROM "stock_items" si
    INNER JOIN "products" p ON p.id = si."productId"
    INNER JOIN "warehouses" w ON w.id = si."warehouseId"
    INNER JOIN "categories" c ON c.id = p."categoryId"
    WHERE p."isActive" = true
      AND si.quantity <= CASE
        WHEN p."reorderLevel" > 0 THEN p."reorderLevel"
        ELSE ${fallbackThreshold}
      END
    ORDER BY si.quantity ASC, p.name ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    warehouseId: row.warehouseId,
    productId: row.productId,
    quantity: Number(row.quantity) || 0,
    threshold: Number(row.threshold) || 0,
    product: {
      id: row.productId,
      name: row.productName,
      sku: row.productSku,
      unit: row.productUnit,
      reorderLevel: Number(row.reorderLevel) || 0,
      category: { name: row.categoryName },
    },
    warehouse: {
      id: row.warehouseId,
      name: row.warehouseName,
      type: row.warehouseType,
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
