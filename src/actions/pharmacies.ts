"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const CreatePharmacySchema = z.object({
  name: z.string().min(2, "اسم الصيدلية مطلوب"),
  licenseNumber: z.string().optional(),
  taxNumber: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  governorateId: z.string().min(1, "اختر المحافظة"),
  assignedRepId: z.string().optional(),
  creditLimit: z.coerce.number().min(0).default(50000),
  targetAmount: z.coerce.number().min(0).default(10000),
});

const UpdatePharmacySchema = z.object({
  name: z.string().min(2, "اسم الصيدلية مطلوب"),
  licenseNumber: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  governorateId: z.string().min(1, "اختر المحافظة"),
  creditLimit: z.coerce.number().min(0).default(50000),
  salesTarget: z.coerce.number().min(0).default(10000),
  isActive: z.boolean().default(true),
});

type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function createPharmacy(
  formData: z.infer<typeof CreatePharmacySchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);

    const data = CreatePharmacySchema.parse(formData);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create pharmacy
      const pharmacy = await tx.pharmacy.create({
        data: {
          name: data.name,
          licenseNumber: data.licenseNumber,
          address: data.address,
          phone: data.phone,
          governorateId: data.governorateId,
          creditLimit: data.creditLimit,
          salesTarget: data.targetAmount,
          currentBalance: 0,
          isActive: true,
          ...(data.assignedRepId
            ? {
                assignedReps: {
                  create: [{ salesRepId: data.assignedRepId }],
                },
              }
            : {}),
        },
      });

      // 2. Initialize current month's target tracking
      const now = new Date();
      await tx.pharmacyTargetPeriod.create({
        data: {
          pharmacyId: pharmacy.id,
          periodYear: now.getFullYear(),
          periodMonth: now.getMonth() + 1,
          target: data.targetAmount,
          achieved: 0,
        },
      });

      return pharmacy;
    });

    revalidatePath("/dashboard/pharmacies");
    return { success: true, data: { id: result.id }, message: "تم تسجيل الصيدلية بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function updatePharmacy(
  id: string,
  formData: z.infer<typeof UpdatePharmacySchema>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);

    const data = UpdatePharmacySchema.parse(formData);

    await prisma.pharmacy.update({
      where: { id },
      data: {
        name: data.name,
        licenseNumber: data.licenseNumber || null,
        address: data.address || null,
        phone: data.phone || null,
        governorateId: data.governorateId,
        creditLimit: data.creditLimit,
        salesTarget: data.salesTarget,
        isActive: data.isActive,
      },
    });

    revalidatePath("/dashboard/pharmacies");
    revalidatePath(`/dashboard/pharmacies/${id}`);
    return { success: true, data: undefined, message: "تم تحديث بيانات الصيدلية بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

export async function deletePharmacy(id: string): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);

    // Constraint check: invoices
    const invoiceCount = await prisma.invoice.count({ where: { pharmacyId: id } });
    if (invoiceCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذه الصيدلية — مرتبطة بـ ${invoiceCount} فاتورة. قم بإلغاء تفعيلها عوضاً عن الحذف.`,
      };
    }

    // Constraint check: payments
    const paymentCount = await prisma.payment.count({ where: { pharmacyId: id } });
    if (paymentCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذه الصيدلية — مرتبطة بـ ${paymentCount} دفعة مالية.`,
      };
    }

    await prisma.pharmacy.delete({ where: { id } });
    revalidatePath("/dashboard/pharmacies");
    return { success: true, data: undefined, message: "تم حذف الصيدلية بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}
