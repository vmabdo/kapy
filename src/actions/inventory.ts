"use server";
import { handleActionError } from "@/lib/error-handler";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { decrementStockOrThrow } from "@/lib/stock";
import { revalidatePath } from "next/cache";
import {
  WarehouseType,
  StockMovementType,
  StockMovementSource,
  UserRole,
} from "@prisma/client";
import { resolveProductCost } from "@/lib/costing";
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
  costPrice: z.coerce.number().min(0).optional(),
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
  quantity: z.coerce.number().positive("الكمية يجب أن تكون موجبة"),
  // Keep an empty input as "not provided" so the product cost can be used.
  unitCost: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? undefined
        : Number(value),
    z.number().min(0, "التكلفة لا يمكن أن تكون سالبة").optional()
  ),
  expiryDate: z.string().optional(),
  batchNumber: z.string().optional(),
});

/**
 * Only these two operational movements are still created from the generic
 * stock-movement form. Rep dispatch/returns and the old generic adjustment
 * have been retired; opening balances and count corrections have dedicated
 * actions below.
 */
const ALLOWED_STOCK_MOVEMENT_TYPES = [
  StockMovementType.INBOUND,
  StockMovementType.OUTBOUND,
] as const;

const ALLOWED_STOCK_MOVEMENT_SOURCES = [
  StockMovementSource.SUPPLIER,
  StockMovementSource.WAREHOUSE,
] as const;

const CreateStockMovementSchema = z
  .object({
    movementType: z.enum(ALLOWED_STOCK_MOVEMENT_TYPES),
    source: z.enum(ALLOWED_STOCK_MOVEMENT_SOURCES),
    sourceWarehouseId: z.string().optional(),
    targetWarehouseId: z.string().optional(),
    supplierId: z.string().optional(),
    referenceNumber: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(StockMovementItemSchema).min(1, "يجب إضافة منتج واحد على الأقل"),
  })
  .superRefine((data, ctx) => {
    if (data.movementType === StockMovementType.INBOUND) {
      if (data.source !== StockMovementSource.SUPPLIER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["source"],
          message: "حركة الوارد يجب أن تكون من مورد فقط",
        });
      }
      if (!data.targetWarehouseId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetWarehouseId"],
          message: "اختر المخزن المستلم",
        });
      }
    }

    if (data.movementType === StockMovementType.OUTBOUND) {
      if (data.source !== StockMovementSource.WAREHOUSE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["source"],
          message: "حركة الصادر المتاحة هي التحويل بين المخازن فقط",
        });
      }
      if (!data.sourceWarehouseId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceWarehouseId"],
          message: "اختر المخزن المصدر",
        });
      }
      if (!data.targetWarehouseId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetWarehouseId"],
          message: "اختر المخزن الوجهة",
        });
      }
      if (
        data.sourceWarehouseId &&
        data.targetWarehouseId &&
        data.sourceWarehouseId === data.targetWarehouseId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetWarehouseId"],
          message: "لا يمكن التحويل إلى نفس المخزن",
        });
      }
    }
  });

// ─── Opening Stock Balance ────────────────────────────────────

const OpeningBalanceItemSchema = z.object({
  productId: z.string().min(1, "اختر منتجاً"),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  unitCost: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? undefined
        : Number(value),
    z
      .number({
        required_error: "تكلفة الوحدة مطلوبة",
        invalid_type_error: "تكلفة الوحدة غير صالحة",
      })
      .min(0, "التكلفة لا يمكن أن تكون سالبة")
  ),
});

const OpeningBalanceSchema = z
  .object({
    warehouseId: z.string().min(1, "اختر المخزن"),
    notes: z.string().trim().optional(),
    items: z
      .array(OpeningBalanceItemSchema)
      .min(1, "أضف منتجاً واحداً على الأقل"),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "productId"],
          message: "لا يمكن تكرار نفس المنتج في نفس الرصيد الافتتاحي",
        });
      }
      seen.add(item.productId);
    });
  });

// ─── Stock Count Correction (shortage / surplus) ─────────────

const StockCountCorrectionSchema = z.object({
  direction: z.enum(["SHORTAGE", "SURPLUS"]),
  warehouseId: z.string().min(1, "اختر المخزن"),
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce.number().positive("كمية الفرق يجب أن تكون أكبر من صفر"),
  reason: z.string().trim().min(2, "يرجى إدخال سبب التصحيح"),
});

// ─── Samples / Promotional Dispatch ───────────────────────────

const DispatchSamplesSchema = z
  .object({
    warehouseId: z.string().min(1, "اختر المخزن"),
    salesRepId: z.string().min(1, "اختر المندوب"),
    notes: z.string().trim().max(500, "الملاحظات طويلة جداً").optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, "اختر منتجاً"),
          quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
        })
      )
      .min(1, "أضف منتجاً واحداً على الأقل"),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "productId"],
          message: "لا يمكن تكرار نفس المنتج في نفس عملية الصرف",
        });
      }
      seen.add(item.productId);
    });
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
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
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

    // ── Warehouse validation ───────────────────────────────
    const targetWarehouse = data.targetWarehouseId
      ? await prisma.warehouse.findUnique({
          where: { id: data.targetWarehouseId },
          select: { id: true, name: true, type: true, isActive: true },
        })
      : null;

    if (!targetWarehouse || !targetWarehouse.isActive) {
      return { success: false, error: "المخزن الوجهة غير موجود أو غير مفعّل" };
    }

    if (
      data.movementType === StockMovementType.INBOUND &&
      targetWarehouse.type !== WarehouseType.MAIN
    ) {
      return {
        success: false,
        error:
          "المخازن الفرعية لا يمكنها الاستلام مباشرة من الموردين. يجب أن يتم الاستلام في المخزن الرئيسي أولاً.",
      };
    }

    const sourceWarehouse = data.sourceWarehouseId
      ? await prisma.warehouse.findUnique({
          where: { id: data.sourceWarehouseId },
          select: { id: true, name: true, type: true, isActive: true },
        })
      : null;

    if (data.movementType === StockMovementType.OUTBOUND) {
      if (!sourceWarehouse || !sourceWarehouse.isActive) {
        return { success: false, error: "المخزن المصدر غير موجود أو غير مفعّل" };
      }
      if (
        targetWarehouse.type === WarehouseType.SUB &&
        sourceWarehouse.type !== WarehouseType.MAIN
      ) {
        return {
          success: false,
          error:
            "المخازن الفرعية لا يمكنها استقبال تحويلات من مخازن فرعية أخرى. يجب أن يكون المصدر المخزن الرئيسي.",
        };
      }
    }

    // ── Product / cost validation ──────────────────────────
    const productIds = Array.from(
      new Set(data.items.map((item) => item.productId))
    );
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        isActive: true,
        costPrice: true,
        sellingPrice: true,
      },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    for (const productId of productIds) {
      const product = productMap.get(productId);
      if (!product) {
        return { success: false, error: "أحد المنتجات المختارة غير موجود" };
      }
      if (!product.isActive) {
        return {
          success: false,
          error: `المنتج "${product.name}" غير مفعّل ولا يمكن تسجيل حركة عليه`,
        };
      }
    }

    const normalizedItems = data.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const quantity = Number(item.quantity);
      // Supplier receipts may use the cost entered on the document. Internal
      // transfers are valued at the product's current cost.
      const unitCost =
        data.movementType === StockMovementType.INBOUND &&
        item.unitCost !== undefined
          ? Number(item.unitCost)
          : resolveProductCost(product);

      return {
        ...item,
        quantity,
        unitCost,
        lineTotal: quantity * unitCost,
      };
    });
    const totalCost = normalizedItems.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    );

    // Aggregate source deductions so duplicate product rows cannot each pass
    // the stock check independently. The actual conditional UPDATE happens
    // inside the transaction below.
    const sourceQuantitiesByProduct = new Map<string, number>();
    if (
      data.movementType === StockMovementType.OUTBOUND &&
      sourceWarehouse
    ) {
      for (const item of normalizedItems) {
        sourceQuantitiesByProduct.set(
          item.productId,
          (sourceQuantitiesByProduct.get(item.productId) ?? 0) + item.quantity
        );
      }
    }

    // ── Atomic transaction ─────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      const supplierId =
        data.source === StockMovementSource.SUPPLIER
          ? data.supplierId || null
          : null;

      const movement = await tx.stockMovement.create({
        data: {
          movementType: data.movementType,
          source: data.source,
          sourceWarehouseId:
            data.movementType === StockMovementType.OUTBOUND
              ? sourceWarehouse?.id ?? null
              : null,
          targetWarehouseId: targetWarehouse.id,
          supplierId,
          referenceNumber: data.referenceNumber || null,
          notes: data.notes || null,
          totalCost,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
              batchNumber: item.batchNumber || null,
            })),
          },
        },
      });

      // Warehouse-to-warehouse transfer: deduct the source atomically first.
      if (
        data.movementType === StockMovementType.OUTBOUND &&
        sourceWarehouse
      ) {
        for (const [productId, quantity] of Array.from(
          sourceQuantitiesByProduct.entries()
        )) {
          await decrementStockOrThrow(tx, {
            warehouseId: sourceWarehouse.id,
            productId,
            quantity,
            productName: productMap.get(productId)?.name,
          });
        }
      }

      // Supplier receipt or transfer destination: increment target.
      for (const item of normalizedItems) {
        await tx.stockItem.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: targetWarehouse.id,
              productId: item.productId,
            },
          },
          update: { quantity: { increment: item.quantity } },
          create: {
            warehouseId: targetWarehouse.id,
            productId: item.productId,
            quantity: item.quantity,
          },
        });
      }

      // Low-stock notifications only for movements that reduce a warehouse.
      if (
        data.movementType === StockMovementType.OUTBOUND &&
        sourceWarehouse
      ) {
        const stockItems = await tx.stockItem.findMany({
          where: {
            warehouseId: sourceWarehouse.id,
            productId: { in: productIds },
          },
          include: {
            product: { select: { name: true, reorderLevel: true } },
          },
        });

        const alertsToCreate = stockItems
          .filter(
            (stockItem) =>
              Number(stockItem.quantity) <= stockItem.product.reorderLevel
          )
          .map((stockItem) => ({
            type: "LOW_STOCK" as const,
            title: "تنبيه: مخزون منخفض",
            message: `المنتج "${stockItem.product.name}" وصل إلى مستوى إعادة الطلب (${stockItem.quantity} وحدة متبقية)`,
          }));

        if (alertsToCreate.length > 0) {
          await tx.alert.createMany({ data: alertsToCreate });
        }
      }

      return movement;
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/movements");
    revalidatePath("/dashboard/financial-statements");
    revalidatePath("/dashboard/reports");
    if (sourceWarehouse) {
      revalidatePath(`/dashboard/inventory/warehouses/${sourceWarehouse.id}`);
    }
    revalidatePath(`/dashboard/inventory/warehouses/${targetWarehouse.id}`);

    return {
      success: true,
      data: { id: result.id },
      message: "تمت حركة المخزون بنجاح",
    };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}

// ─── Opening Stock Balance Action ──────────────────────────────

/**
 * Records the physical stock a warehouse starts with.
 *
 * Financial treatment: increases inventory (asset) and opening inventory
 * capital. It deliberately creates NO treasury transaction and NO supplier
 * payable.
 */
export async function createOpeningStockBalance(
  formData: z.infer<typeof OpeningBalanceSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.WAREHOUSE_MANAGER,
    ]);

    const data = OpeningBalanceSchema.parse(formData);

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
      select: { id: true, name: true, isActive: true },
    });
    if (!warehouse || !warehouse.isActive) {
      return { success: false, error: "المخزن غير موجود أو غير مفعّل" };
    }

    const productIds = Array.from(
      new Set(data.items.map((item) => item.productId))
    );
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, isActive: true },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    for (const productId of productIds) {
      const product = productMap.get(productId);
      if (!product) {
        return { success: false, error: "أحد المنتجات المختارة غير موجود" };
      }
      if (!product.isActive) {
        return {
          success: false,
          error: `المنتج "${product.name}" غير مفعّل ولا يمكن إدخال رصيد افتتاحي له`,
        };
      }
    }

    const normalizedItems = data.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unitCost: Number(item.unitCost),
      lineTotal: Number(item.quantity) * Number(item.unitCost),
    }));
    const totalCost = normalizedItems.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    );

    const result = await prisma.$transaction(async (tx) => {
      const openingCount = await tx.stockMovement.count({
        where: { movementType: StockMovementType.OPENING_BALANCE },
      });
      const referenceNumber = `OPB-${new Date().getFullYear()}-${String(
        openingCount + 1
      ).padStart(4, "0")}`;

      const movement = await tx.stockMovement.create({
        data: {
          movementType: StockMovementType.OPENING_BALANCE,
          source: StockMovementSource.WAREHOUSE,
          targetWarehouseId: warehouse.id,
          referenceNumber,
          notes: data.notes || "رصيد افتتاحي للمخزن",
          totalCost,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
            })),
          },
        },
      });

      for (const item of normalizedItems) {
        await tx.stockItem.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: warehouse.id,
              productId: item.productId,
            },
          },
          update: { quantity: { increment: item.quantity } },
          create: {
            warehouseId: warehouse.id,
            productId: item.productId,
            quantity: item.quantity,
          },
        });

        // Keep the product's cost in sync with the cost used to value the
        // opening stock. Without this the balance-sheet valuation would use a
        // different unit cost than the opening-capital report.
        if (item.unitCost > 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { costPrice: item.unitCost },
          });
        }
      }

      return movement;
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/movements");
    revalidatePath(`/dashboard/inventory/warehouses/${warehouse.id}`);
    revalidatePath("/dashboard/financial-statements");
    revalidatePath("/dashboard/reports");

    return {
      success: true,
      data: { id: result.id },
      message: "تم إدخال الرصيد الافتتاحي للمخزن بنجاح",
    };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}

// ─── Stock Count Correction Action ─────────────────────────────

/**
 * Records a physical-count shortage or surplus.
 *
 * Financial treatment: shortage is an inventory loss (expense), surplus is an
 * inventory gain. Neither movement touches treasury cash or supplier debt.
 */
export async function createStockCountCorrection(
  formData: z.infer<typeof StockCountCorrectionSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.WAREHOUSE_MANAGER,
    ]);

    const data = StockCountCorrectionSchema.parse(formData);

    const [warehouse, product] = await Promise.all([
      prisma.warehouse.findUnique({
        where: { id: data.warehouseId },
        select: { id: true, name: true, isActive: true },
      }),
      prisma.product.findUnique({
        where: { id: data.productId },
        select: {
          id: true,
          name: true,
          isActive: true,
          costPrice: true,
          sellingPrice: true,
          reorderLevel: true,
        },
      }),
    ]);

    if (!warehouse || !warehouse.isActive) {
      return { success: false, error: "المخزن غير موجود أو غير مفعّل" };
    }
    if (!product || !product.isActive) {
      return { success: false, error: "المنتج غير موجود أو غير مفعّل" };
    }

    const quantity = Number(data.quantity);
    const unitCost = resolveProductCost(product);
    const totalCost = quantity * unitCost;
    const isShortage = data.direction === "SHORTAGE";
    const movementType = isShortage
      ? StockMovementType.ADJUSTMENT_OUT
      : StockMovementType.ADJUSTMENT_IN;

    const result = await prisma.$transaction(async (tx) => {
      const movementCount = await tx.stockMovement.count({
        where: { movementType },
      });
      const referenceNumber = `${isShortage ? "SHR" : "SRP"}-${new Date().getFullYear()}-${String(
        movementCount + 1
      ).padStart(4, "0")}`;

      const movement = await tx.stockMovement.create({
        data: {
          movementType,
          source: StockMovementSource.WAREHOUSE,
          sourceWarehouseId: isShortage ? warehouse.id : null,
          targetWarehouseId: isShortage ? null : warehouse.id,
          referenceNumber,
          notes: data.reason,
          totalCost,
          items: {
            create: {
              productId: product.id,
              quantity,
              unitCost,
            },
          },
        },
      });

      let finalQuantity: number;

      if (isShortage) {
        await decrementStockOrThrow(tx, {
          warehouseId: warehouse.id,
          productId: product.id,
          quantity,
          productName: product.name,
        });

        const current = await tx.stockItem.findUniqueOrThrow({
          where: {
            warehouseId_productId: {
              warehouseId: warehouse.id,
              productId: product.id,
            },
          },
          select: { quantity: true },
        });

        finalQuantity = Number(current.quantity);
      } else {
        const updated = await tx.stockItem.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: warehouse.id,
              productId: product.id,
            },
          },
          update: { quantity: { increment: quantity } },
          create: {
            warehouseId: warehouse.id,
            productId: product.id,
            quantity,
          },
          select: { quantity: true },
        });

        finalQuantity = Number(updated.quantity);
      }

      if (isShortage && finalQuantity <= product.reorderLevel) {
        await tx.alert.create({
          data: {
            type: "LOW_STOCK",
            title: "تنبيه: مخزون منخفض بعد تصحيح الجرد",
            message: `المنتج "${product.name}" وصل إلى مستوى إعادة الطلب (${finalQuantity} وحدة متبقية)`,
          },
        });
      }

      return movement;
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/movements");
    revalidatePath(`/dashboard/inventory/warehouses/${warehouse.id}`);
    revalidatePath("/dashboard/financial-statements");
    revalidatePath("/dashboard/reports");

    return {
      success: true,
      data: { id: result.id },
      message: isShortage
        ? "تم تسجيل نقص المخزون بنجاح"
        : "تم تسجيل زيادة المخزون بنجاح",
    };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}

// ─── Samples / Promotional Dispatch Action ────────────────────

/**
 * Issues free medical samples / promotional items to a sales representative.
 *
 * Financial treatment: reduces inventory and is reported as a marketing and
 * promotional operating expense. It deliberately creates NO treasury
 * transaction and does NOT affect the rep's sales targets or commissions.
 */
export async function dispatchSamples(
  formData: z.infer<typeof DispatchSamplesSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.WAREHOUSE_MANAGER,
      UserRole.SALES_MANAGER,
    ]);

    const data = DispatchSamplesSchema.parse(formData);

    const [warehouse, salesRep] = await Promise.all([
      prisma.warehouse.findUnique({
        where: { id: data.warehouseId },
        select: { id: true, name: true, isActive: true },
      }),
      prisma.salesRep.findUnique({
        where: { id: data.salesRepId },
        select: { id: true, name: true, isActive: true },
      }),
    ]);

    if (!warehouse || !warehouse.isActive) {
      return { success: false, error: "المخزن غير موجود أو غير مفعّل" };
    }
    if (!salesRep || !salesRep.isActive) {
      return { success: false, error: "المندوب غير موجود أو غير مفعّل" };
    }

    const productIds = Array.from(
      new Set(data.items.map((item) => item.productId))
    );
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        isActive: true,
        costPrice: true,
        sellingPrice: true,
      },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    for (const productId of productIds) {
      const product = productMap.get(productId);
      if (!product) {
        return { success: false, error: "أحد المنتجات المختارة غير موجود" };
      }
      if (!product.isActive) {
        return {
          success: false,
          error: `المنتج "${product.name}" غير مفعّل ولا يمكن صرف عينات منه`,
        };
      }
    }

    const normalizedItems = data.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const quantity = Number(item.quantity);
      const unitCost = resolveProductCost(product);

      return {
        productId: item.productId,
        productName: product.name,
        quantity,
        unitCost,
        lineTotal: quantity * unitCost,
      };
    });
    const totalCost = normalizedItems.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    );

    const samplesByProduct = new Map<string, number>();
    for (const item of normalizedItems) {
      samplesByProduct.set(
        item.productId,
        (samplesByProduct.get(item.productId) ?? 0) + item.quantity
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const movementCount = await tx.stockMovement.count({
        where: { movementType: StockMovementType.SAMPLES_DISPATCH },
      });
      const referenceNumber = `SMP-${new Date().getFullYear()}-${String(
        movementCount + 1
      ).padStart(4, "0")}`;

      const movement = await tx.stockMovement.create({
        data: {
          movementType: StockMovementType.SAMPLES_DISPATCH,
          source: StockMovementSource.WAREHOUSE,
          sourceWarehouseId: warehouse.id,
          salesRepId: salesRep.id,
          referenceNumber,
          notes:
            data.notes && data.notes.length > 0
              ? data.notes
              : "صرف عينات طبية / دعاية مجانية",
          totalCost,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
            })),
          },
        },
      });

      for (const [productId, quantity] of Array.from(
        samplesByProduct.entries()
      )) {
        await decrementStockOrThrow(tx, {
          warehouseId: warehouse.id,
          productId,
          quantity,
          productName: productMap.get(productId)?.name,
        });
      }

      const updatedStockItems = await tx.stockItem.findMany({
        where: {
          warehouseId: warehouse.id,
          productId: { in: productIds },
        },
        select: {
          quantity: true,
          product: { select: { name: true, reorderLevel: true } },
        },
      });

      const alertsToCreate = updatedStockItems
        .filter(
          (stockItem) =>
            Number(stockItem.quantity) <= stockItem.product.reorderLevel
        )
        .map((stockItem) => ({
          type: "LOW_STOCK" as const,
          title: "تنبيه: مخزون منخفض بعد صرف العينات",
          message: `المنتج "${stockItem.product.name}" وصل إلى مستوى إعادة الطلب (${stockItem.quantity} وحدة متبقية)`,
        }));

      if (alertsToCreate.length > 0) {
        await tx.alert.createMany({ data: alertsToCreate });
      }

      return movement;
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/movements");
    revalidatePath(`/dashboard/inventory/warehouses/${warehouse.id}`);
    revalidatePath("/dashboard/financial-statements");
    revalidatePath("/dashboard/reports");
    revalidatePath("/dashboard/sales-reps");
    revalidatePath(`/dashboard/sales-reps/${salesRep.id}`);

    return {
      success: true,
      data: { id: result.id },
      message: `تم صرف العينات للمندوب ${salesRep.name} بنجاح`,
    };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
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
    return { success: false, error: handleActionError(e) };
  }
}
