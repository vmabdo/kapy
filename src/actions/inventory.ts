"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import {
  WarehouseType,
  StockMovementType,
  StockMovementSource,
  UserRole,
} from "@prisma/client";
import { z } from "zod";

// ─── Supplier Schema ────────────────────────────────────────────
const CreateSupplierSchema = z.object({
  name: z.string().min(2, "اسم المورد مطلوب"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("البريد الإلكتروني غير صالح").optional().or(z.literal("")),
  address: z.string().optional(),
});

// ─── Schemas ──────────────────────────────────────────────────

const CreateWarehouseSchema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  type: z.nativeEnum(WarehouseType),
  governorateId: z.string().min(1, "المحافظة مطلوبة"),
  address: z.string().optional(),
});

const CreateProductSchema = z.object({
  name: z.string().min(2, "اسم المنتج مطلوب"),
  sku: z.string().min(1, "الرمز مطلوب"),
  categoryId: z.string().min(1, "الفئة مطلوبة"),
  unit: z.string().default("علبة"),
  packageSize: z.coerce.number().int().positive().default(1),
  sellingPrice: z.coerce.number().positive("السعر يجب أن يكون موجباً"),
  costPrice: z.coerce.number().optional(),
  vatRate: z.coerce.number().min(0).max(100).default(0),
  reorderLevel: z.coerce.number().int().min(0).default(0),
  requiresPrescription: z.boolean().default(false),
});

const CreateCategorySchema = z.object({
  name: z.string().min(2),
  nameEn: z.string().optional(),
});

const StockMovementItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive("الكمية يجب أن تكون موجبة"),
  unitCost: z.coerce.number().optional(),
  expiryDate: z.string().optional(),
  batchNumber: z.string().optional(),
});

const CreateStockMovementSchema = z.object({
  movementType: z.nativeEnum(StockMovementType),
  source: z.nativeEnum(StockMovementSource),
  sourceWarehouseId: z.string().optional(),
  targetWarehouseId: z.string().optional(),
  supplierId: z.string().optional(),
  salesRepId: z.string().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(StockMovementItemSchema).min(1, "يجب إضافة منتج واحد على الأقل"),
});

// ─── Result Types ──────────────────────────────────────────────

type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

// ─── Warehouse Actions ─────────────────────────────────────────

export async function createWarehouse(
  formData: z.infer<typeof CreateWarehouseSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    const data = CreateWarehouseSchema.parse(formData);

    // Enforce: only one MAIN warehouse allowed
    if (data.type === WarehouseType.MAIN) {
      const existing = await prisma.warehouse.findFirst({
        where: { type: WarehouseType.MAIN },
      });
      if (existing) {
        return { success: false, error: "يوجد مخزن رئيسي بالفعل. يُسمح بمخزن رئيسي واحد فقط." };
      }
    }

    const warehouse = await prisma.warehouse.create({ data });
    revalidatePath("/dashboard/inventory");
    return { success: true, data: { id: warehouse.id }, message: "تم إنشاء المخزن بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function toggleWarehouseActive(id: string): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    const wh = await prisma.warehouse.findUniqueOrThrow({ where: { id } });
    await prisma.warehouse.update({ where: { id }, data: { isActive: !wh.isActive } });
    revalidatePath("/dashboard/inventory");
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ" };
  }
}

// ─── Product Actions ───────────────────────────────────────────

export async function createProduct(
  formData: z.infer<typeof CreateProductSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER]);
    const data = CreateProductSchema.parse(formData);

    const existing = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (existing) return { success: false, error: `الرمز "${data.sku}" مستخدم بالفعل` };

    const product = await prisma.product.create({ data });
    revalidatePath("/dashboard/inventory");
    return { success: true, data: { id: product.id }, message: "تم إضافة المنتج بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function updateProduct(
  id: string,
  formData: Partial<z.infer<typeof CreateProductSchema>>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER]);
    await prisma.product.update({ where: { id }, data: formData });
    revalidatePath("/dashboard/inventory");
    revalidatePath(`/dashboard/inventory/products/${id}`);
    return { success: true, data: undefined, message: "تم تحديث المنتج بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ" };
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER]);

    // Constraint check: stock movements
    const movementItemCount = await prisma.stockMovementItem.count({
      where: { productId: id },
    });
    if (movementItemCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذا المنتج — مرتبط بـ ${movementItemCount} حركة مخزون. قم بأرشفته عوضاً عن الحذف.`,
      };
    }

    // Constraint check: invoices
    const invoiceItemCount = await prisma.invoiceItem.count({
      where: { productId: id },
    });
    if (invoiceItemCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذا المنتج — مرتبط بـ ${invoiceItemCount} فاتورة مبيعات. قم بإلغاء تفعيله عوضاً عن الحذف.`,
      };
    }

    await prisma.product.delete({ where: { id } });
    revalidatePath("/dashboard/inventory/products");
    return { success: true, data: undefined, message: "تم حذف المنتج بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

// ─── Category Actions ──────────────────────────────────────────

export async function createCategory(
  formData: z.infer<typeof CreateCategorySchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER]);
    const data = CreateCategorySchema.parse(formData);
    const cat = await prisma.category.create({ data });
    revalidatePath("/dashboard/inventory");
    return { success: true, data: { id: cat.id } };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ" };
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER]);

    const productCount = await prisma.product.count({ where: { categoryId: id } });
    if (productCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذه الفئة — تحتوي على ${productCount} منتج. انقل المنتجات لفئة أخرى أولاً.`,
      };
    }

    await prisma.category.delete({ where: { id } });
    revalidatePath("/dashboard/inventory");
    return { success: true, data: undefined, message: "تم حذف الفئة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ" };
  }
}

// ─── Stock Movement Action (core business logic) ───────────────

export async function createStockMovement(
  formData: z.infer<typeof CreateStockMovementSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.WAREHOUSE_MANAGER,
      UserRole.SALES_MANAGER,
    ]);

    const data = CreateStockMovementSchema.parse(formData);

    // ── Business rule enforcement ──────────────────────────
    // Rule 1: Only MAIN warehouse can receive from supplier
    if (data.source === StockMovementSource.SUPPLIER && data.targetWarehouseId) {
      const targetWh = await prisma.warehouse.findUniqueOrThrow({
        where: { id: data.targetWarehouseId },
      });
      if (targetWh.type !== WarehouseType.MAIN) {
        return {
          success: false,
          error: "المخازن الفرعية لا يمكنها الاستلام مباشرة من الموردين. يجب أن يتم الاستلام في المخزن الرئيسي أولاً.",
        };
      }
    }

    // Rule 2: Sub-warehouse can only receive transfers FROM the main warehouse
    if (data.source === StockMovementSource.WAREHOUSE && data.targetWarehouseId) {
      const targetWh = await prisma.warehouse.findUniqueOrThrow({
        where: { id: data.targetWarehouseId },
      });
      if (targetWh.type === WarehouseType.SUB && data.sourceWarehouseId) {
        const sourceWh = await prisma.warehouse.findUniqueOrThrow({
          where: { id: data.sourceWarehouseId },
        });
        if (sourceWh.type !== WarehouseType.MAIN) {
          return {
            success: false,
            error: "المخازن الفرعية لا يمكنها استقبال تحويلات من مخازن فرعية أخرى. يجب أن يكون المصدر المخزن الرئيسي.",
          };
        }
      }
    }

    // Rule 3: Sufficient stock check for OUTBOUND movements
    if (
      data.movementType === StockMovementType.OUTBOUND ||
      data.movementType === StockMovementType.RETURN_OUTBOUND
    ) {
      const sourceId = data.sourceWarehouseId;
      if (sourceId) {
        for (const item of data.items) {
          const stockItem = await prisma.stockItem.findUnique({
            where: { warehouseId_productId: { warehouseId: sourceId, productId: item.productId } },
          });
          const available = (stockItem?.quantity ?? 0) - (stockItem?.reservedQty ?? 0);
          if (available < item.quantity) {
            const product = await prisma.product.findUnique({ where: { id: item.productId } });
            return {
              success: false,
              error: `المخزون غير كافٍ للمنتج "${product?.name ?? item.productId}". المتاح: ${available}، المطلوب: ${item.quantity}`,
            };
          }
        }
      }
    }

    // ── Atomic transaction ─────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the movement record
      // BUG FIX: Only pass supplierId when source is actually SUPPLIER.
      // Passing an empty string or stale value causes a FK constraint violation.
      const supplierId =
        data.source === StockMovementSource.SUPPLIER
          ? data.supplierId || null
          : null;

      const movement = await tx.stockMovement.create({
        data: {
          movementType: data.movementType,
          source: data.source,
          sourceWarehouseId: data.sourceWarehouseId || null,
          targetWarehouseId: data.targetWarehouseId || null,
          supplierId,
          salesRepId: data.salesRepId || null,
          referenceNumber: data.referenceNumber || null,
          notes: data.notes || null,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost ?? null,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
              batchNumber: item.batchNumber || null,
            })),
          },
        },
      });

      // 2. Update stock balances (upsert StockItem for each product)
      const isInbound =
        data.movementType === StockMovementType.INBOUND ||
        data.movementType === StockMovementType.RETURN_INBOUND;
      const isOutbound =
        data.movementType === StockMovementType.OUTBOUND ||
        data.movementType === StockMovementType.RETURN_OUTBOUND;

      for (const item of data.items) {
        // ── Determine movement direction ─────────────────────
        // Internal transfer (warehouse-to-warehouse): OUTBOUND at source + INBOUND at target
        const isInternalTransfer =
          data.source === StockMovementSource.WAREHOUSE &&
          data.movementType === StockMovementType.OUTBOUND &&
          !!data.sourceWarehouseId &&
          !!data.targetWarehouseId;

        // Standard inbound (supplier receipt, rep return)
        const isInbound =
          (data.movementType === StockMovementType.INBOUND ||
           data.movementType === StockMovementType.RETURN_INBOUND) &&
          !isInternalTransfer;

        // Standard outbound (issue to rep) — NOT internal transfer
        const isOutbound =
          (data.movementType === StockMovementType.OUTBOUND ||
           data.movementType === StockMovementType.RETURN_OUTBOUND) &&
          !isInternalTransfer;

        // ── Source warehouse: always decrement for transfers & outbound ──
        if ((isInternalTransfer || isOutbound) && data.sourceWarehouseId) {
          await tx.stockItem.upsert({
            where: {
              warehouseId_productId: {
                warehouseId: data.sourceWarehouseId,
                productId: item.productId,
              },
            },
            update: { quantity: { decrement: item.quantity } },
            create: {
              warehouseId: data.sourceWarehouseId,
              productId: item.productId,
              quantity: -item.quantity,
            },
          });
        }

        // ── Target warehouse: always increment for transfers & inbound ──
        if ((isInternalTransfer || isInbound) && data.targetWarehouseId) {
          await tx.stockItem.upsert({
            where: {
              warehouseId_productId: {
                warehouseId: data.targetWarehouseId,
                productId: item.productId,
              },
            },
            update: { quantity: { increment: item.quantity } },
            create: {
              warehouseId: data.targetWarehouseId,
              productId: item.productId,
              quantity: item.quantity,
            },
          });
        }

        // ── ADJUSTMENT — direct delta on target or source ────
        if (data.movementType === StockMovementType.ADJUSTMENT) {
          const whId = data.targetWarehouseId ?? data.sourceWarehouseId;
          if (whId) {
            await tx.stockItem.upsert({
              where: { warehouseId_productId: { warehouseId: whId, productId: item.productId } },
              update: { quantity: { increment: item.quantity } },
              create: { warehouseId: whId, productId: item.productId, quantity: item.quantity },
            });
          }
        }
      }

      // 3. Check for low stock alerts (fires for any movement that reduces source stock)
      const sourceReduces =
        data.movementType === StockMovementType.OUTBOUND ||
        data.movementType === StockMovementType.RETURN_OUTBOUND;
      if (sourceReduces && data.sourceWarehouseId) {
        for (const item of data.items) {
          const stockItem = await tx.stockItem.findUnique({
            where: {
              warehouseId_productId: {
                warehouseId: data.sourceWarehouseId!,
                productId: item.productId,
              },
            },
            include: { product: { select: { name: true, reorderLevel: true } } },
          });
          if (
            stockItem &&
            stockItem.quantity <= stockItem.product.reorderLevel
          ) {
            await tx.alert.create({
              data: {
                type: "LOW_STOCK",
                title: "تنبيه: مخزون منخفض",
                message: `المنتج "${stockItem.product.name}" وصل إلى مستوى إعادة الطلب (${stockItem.quantity} وحدة متبقية)`,
              },
            });
          }
        }
      }

      return movement;
    });

    revalidatePath("/dashboard/inventory");
    return { success: true, data: { id: result.id }, message: "تمت حركة المخزون بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

// ─── Supplier Actions ──────────────────────────────────────────

export async function createSupplier(
  formData: z.infer<typeof CreateSupplierSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER]);
    const data = CreateSupplierSchema.parse(formData);

    const supplier = await prisma.supplier.create({
      data: {
        name: data.name,
        contactPerson: data.contactPerson || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
      },
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/suppliers");
    return { success: true, data: { id: supplier.id }, message: "تم إضافة المورد بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function updateSupplier(
  id: string,
  formData: z.infer<typeof CreateSupplierSchema>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER]);
    const data = CreateSupplierSchema.parse(formData);

    await prisma.supplier.update({
      where: { id },
      data: {
        name: data.name,
        contactPerson: data.contactPerson || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
      },
    });

    revalidatePath("/dashboard/inventory/suppliers");
    return { success: true, data: undefined, message: "تم تحديث بيانات المورد بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);

    // Constraint check: stock movements
    const movementCount = await prisma.stockMovement.count({
      where: { supplierId: id },
    });
    if (movementCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذا المورد — مرتبط بـ ${movementCount} حركة مخزون. قم بأرشفته عوضاً عن الحذف.`,
      };
    }

    await prisma.supplier.delete({ where: { id } });
    revalidatePath("/dashboard/inventory/suppliers");
    return { success: true, data: undefined, message: "تم حذف المورد بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}
