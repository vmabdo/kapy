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

export async function getLowStockItems() {
  const items = await prisma.stockItem.findMany({
    include: {
      product: { select: { name: true, sku: true, reorderLevel: true } },
      warehouse: { select: { name: true } },
    },
  });
  return items.filter((item) => item.quantity <= item.product.reorderLevel);
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
        include: { product: { select: { name: true, sku: true, unit: true } } },
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
